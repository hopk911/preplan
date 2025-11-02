// === Hard shims for globals used by bundle (load-first) ===
if (typeof __currentOpenIndex === 'undefined') { var __currentOpenIndex = -1; }
if (typeof __discardDraftIfAny === 'undefined') { var __discardDraftIfAny = function(){}; }
// Also mirror to window for any window-based checks
if (typeof window !== 'undefined') {
  if (typeof window.__currentOpenIndex === 'undefined') window.__currentOpenIndex = __currentOpenIndex;
  if (typeof window.__discardDraftIfAny === 'undefined') window.__discardDraftIfAny = __discardDraftIfAny;
}
// === end shims ===

(function(){
  'use strict';

  // ---- Runtime config
  const cfg = {
    get sheet(){ return window.GOOGLE_SHEET_JSON_URL || ''; },
    get webapp(){ return window.WEBAPP_URL || ''; }
  };

  // ---- Sections (order matters; "other" first for title-as-name)
  const SECTION_CONFIG = [
    { id:'other',     label:'Other',     color:'other'     },
    { id:'fire',      label:'Fire',      color:'fire'      },
    { id:'elevators', label:'Elevators', color:'elevators' },
    { id:'ems',       label:'EMS',       color:'ems'       },
    { id:'water',     label:'Water',     color:'water'     },
    { id:'electric',  label:'Electric',  color:'electric'  },
    { id:'gas',       label:'Gas',       color:'gas'       },
    { id:'hazmat',    label:'Hazmat',    color:'hazmat'    }
  ];

  // ---- Table columns
  const TABLE_COLUMNS = [
    { key:'__photo__', label:'Photo',            getter:r=>firstPhotoWithSection(r) },
    { key:'business',  label:'Business Name',    getter:r=>getField(r,['Business Name','Business Name:','Business','Name','Company','Facility Name']) },
    { key:'address',   label:'Address',          getter:r=>getField(r,['Address','Address:','Site Address','Street Address','Location Address']) },
    { key:'knox',      label:'Knox Box Location',getter:r=>getField(r,['Knox Box Location','Knox Box Location:','Knox Location','Knox Box']) },
    { key:'hydrant',   label:'Closest Hydrant',  getter:r=>getField(r,['Closest Hydrant','Closest Hydrant:','Nearest Hydrant','Hydrant Location']) }
  ];

  // ---- Modal field filters / helpers
  const HIDE_IN_MODAL = ['timestamp','time stamp','stable id','stableid','address','closest hydrant','knox box location'];
  const normalizeKey = k => String(k||'').toLowerCase().replace(/[:\s]+$/,'').replace(/[^a-z0-9]+/g,' ').trim();
  const isHiddenInModal = k => HIDE_IN_MODAL.includes(normalizeKey(k));

  
  const DRAFT_HIDE = ['timestamp','time stamp','stable id'];
  function shouldHideInModal(k){
    try{ if (window && window._isNewDraft) return DRAFT_HIDE.includes(normalizeKey(k)); }catch(e){}
    return isHiddenInModal(k);
  }
// ---- Field routing to sections
  const FIELD_PATTERNS = [
    [/^Remote Alarm Location:?$/i,'fire'],
    [/^Sprinkler Main Shutoff Location:?$/i,'fire'],
    [/^Roof Type:?$/i,'other'],
    [/^Roof Access Location:?$/i,'other'],
    [/^\s*Roof Access Photo\s*:?\s*$/i,'other'],
    [/^(fdc|standpipe|riser|fire pump|alarm|pull|extinguisher|ladder|stair|roof|pre plan|knox)/i,'fire'],
    [/(^| )(elevators?|lift|elevator bank|elevator key|elevator room|elev\b)/i,'elevators'],
    [/(^| )(ems|aed|narcan|medical)/i,'ems'],
    [/(^| )(water|hydrant|sprinkler|shutoff.*water)/i,'water'],
    [/(^| )(electric|electrical|panel|generator|shutoff.*electric)/i,'electric'],
    [/(^| )(gas|meter|propane|shutoff.*gas)/i,'gas'],
    [/(^| )(haz|msds|chemical|tank|combustible|flammable)/i,'hazmat'],
    [/^Closest Hydrant$/i,'water'],
    [/^Knox Box Location$/i,'fire']
  ];
  const sectionForField = (h)=>{ h=String(h||'').trim(); for(const [re,id] of FIELD_PATTERNS){ if(re.test(h)) return id; } return 'other'; };

  // ---- Drive ID extraction
  function extractDriveId(s){
    s=String(s||'').trim(); if(!s) return '';
    let m=s.match(/^[A-Za-z0-9_-]{20,}$/); if(m) return m[0];
    try{
      const u=new URL(s);
      const idQ=u.searchParams.get('id'); if(idQ) return idQ;
      m=u.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{20,})/); if(m) return m[1];
      m=u.pathname.match(/\/d\/([A-Za-z0-9_-]{20,})/); if(m) return m[1];
      const idQ2=u.searchParams.get('ucid')||u.searchParams.get('fileId'); if(idQ2) return idQ2;
      if(/googleusercontent\.com$/.test(u.hostname)){ m=u.pathname.match(/\/d\/([A-Za-z0-9_-]{20,})/); if(m) return m[1]; }
    }catch(e){}
    m=s.match(/([A-Za-z0-9_-]{20,})/); if(m) return m[1];
    return '';
  }

  function resolveFirstPhoto(rec){
    const headers = Object.keys(rec||{}).filter(h => /photo/i.test(String(h)));
    const candidates = [];
    const pushParts = (val,h)=>{
      if(!val) return;
      String(val).split(/[,\r\n]+|\s{2,}/).forEach(part=>{
        const p=String(part).trim(); if(p) candidates.push({url:p, header:h||''});
      });
    };
    ['Photo','Primary Photo','Main Photo'].forEach(h=>pushParts(rec[h],h));
    headers.forEach(h=>pushParts(rec[h],h));
    for(const c of candidates){ const id=extractDriveId(c.url); if(id) return {url:c.url, header:c.header}; }
    for(const c of candidates){ return {url:c.url, header:c.header}; }
    return {url:'', header:''};
  }
  function firstPhotoWithSection(rec){ const {url,header}=resolveFirstPhoto(rec); const sec=header?sectionForField(header):'other'; return {url,sectionId:sec}; }

  // ---- Stable loader (hybrid: Drive IDs use Drive endpoints; others via proxy)
  const DRIVE_THUMB = (id,w)=>`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w||600}`;
  const LH3_IMG     = (id,w)=>`https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w${w||600}`;
  const PROXY_IMG   = (url,w)=>`${cfg.webapp}?fn=img&u=${encodeURIComponent(url)}&w=${w||600}`;
  const IMG_CACHE=new Map(), PENDING=new Map(); let IN_FLIGHT=0; let MAX_CONCURRENCY=1;


function buildImgWithFallback(srcOrId, cls, size) {
  if (!srcOrId) return '';
  const w = size || 600;
  const id = extractDriveId(srcOrId);
  const driveThumb = id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}` : String(srcOrId);
  const webapp = (window.WEBAPP_URL||'').replace(/\/$/,'');
  const proxied = id ? `${webapp}?id=${encodeURIComponent(id)}&w=${w}` : driveThumb;
  const classAttr = cls ? ` class="${cls} js-thumb"` : ' class="js-thumb"';
  return `<img data-src="${proxied}" data-fallback="${driveThumb}" alt="photo" loading="lazy"${classAttr}>`;
}

  // --- Backoff & fetch helpers to tame 429s ---
  const sleep = (ms)=>new Promise(r=>setTimeout(r, ms));
  async function tryLoad(img, url){
    return new Promise((resolve, reject)=>{
      const onLoad = ()=>{ cleanup(); resolve(url); };
      const onErr  = ()=>{ cleanup(); reject(new Error('load-fail')); };
      const cleanup= ()=>{ img.removeEventListener('load', onLoad); img.removeEventListener('error', onErr); };
      img.addEventListener('load', onLoad, { once:true });
      img.addEventListener('error', onErr, { once:true });
      img.src = url;
    });
  }
  async function tryWithRetries(img, url){
    const delays = [500, 1200, 2500];
    for (let i=0;i<delays.length;i++){
      try { await tryLoad(img, url); return true; }
      catch(e){
        // If server said 429 (rate limit), wait longer; else just move on
        await sleep(delays[i] + Math.floor(Math.random()*120));
      }
    }
    return false;
  }


  
  function preloadOnce(url){ /* kept for compatibility; now unused in new loader */ return Promise.resolve(); }

  function _runQueue(q){ if(!q.length||IN_FLIGHT>=MAX_CONCURRENCY) return;
    const t=q.shift(); IN_FLIGHT++;
    t().finally(()=>{ IN_FLIGHT--; _runQueue(q); });
  }
  
  // ---- Global guards for retry helpers (in case block scoping hid originals) ----
  if (typeof window.sleep !== 'function') {
    window.sleep = (ms)=>new Promise(r=>setTimeout(r, ms));
  }
  if (typeof window.tryLoad !== 'function') {
    window.tryLoad = function(img, url){
      return new Promise((resolve, reject)=>{
        function onLoad(){ cleanup(); resolve(url); }
        function onErr(){ cleanup(); reject(new Error('load-fail')); }
        function cleanup(){ img.removeEventListener('load', onLoad); img.removeEventListener('error', onErr); }
        img.addEventListener('load', onLoad, { once:true });
        img.addEventListener('error', onErr, { once:true });
        img.src = url;
      });
    };
  }
  if (typeof window.tryWithRetries !== 'function') {
    window.tryWithRetries = async function(img, url){
      const delays = [500, 1200, 2500];
      for (let i=0;i<delays.length;i++){
        try { await window.tryLoad(img, url); return true; }
        catch(e){ await window.sleep(delays[i] + Math.floor(Math.random()*120)); }
      }
      return false;
    };
  }

  function loadThumbsWithin(root){
    const imgs=[...((root||document).querySelectorAll('img.js-thumb'))];
    let toggle=false; // alternate provider order to spread load
    const tasks = imgs.map(img => () => (async()=>{
      const primary  = img.getAttribute('data-src') || '';
      const fallback = img.getAttribute('data-fallback') || '';
      const pair = toggle ? [fallback, primary] : [primary, fallback];
      toggle = !toggle;

      // Try first URL with retries; if fails, try the other
      if (pair[0]) {
        const ok = await tryWithRetries(img, pair[0]);
        if (ok) return;
      }
      if (pair[1]) {
        await tryWithRetries(img, pair[1]).catch(()=>{});
      }
    })());
    const q=tasks.slice();
    (async()=>{await sleep(150+Math.random()*250); for(let i=0;i<Math.min(MAX_CONCURRENCY,q.length);i++) _runQueue(q);})();
  }

  // ---- DOM refs
  // ---- DOM refs (defined ONCE)
  var $ = window.$ || function(id){ return document.getElementById(id); };
  const tableHead = $('tableHead'), tableBody = $('tableBody');
  const prevPage  = $('prevPage'), nextPage  = $('nextPage'), pageInfo = $('pageInfo');
  const btnAdd    = $('btnAdd'),   btnEdit   = $('btnEdit'),   searchInput = $('searchInput');
  const modal=$('recordModal'),modalTitle=$('modalTitle'),modalContent=$('modalContent'),sectionNav=$('sectionNav');
  const btnCloseModal=$('btnCloseModal'),backdrop=$('modalBackdrop');

  // ---- Utils (define ONCE)
  const debounce=(fn,ms)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };

  // CSV parse (kept tiny but robust for quoted fields)
  function csvToObjects(text){
    const rowsA=[]; let field='',row=[],inQ=false;
    for(let i=0;i<text.length;i++){ const c=text[i],n=text[i+1];
      if(inQ){ if(c=='"'&&n=='"'){field+='"'; i++;} else if(c=='"'){ inQ=false; } else field+=c; }
      else{ if(c=='"'){ inQ=true; } else if(c==','){ row.push(field); field=''; } else if(c=='\r'){} else if(c=='\n'){ row.push(field); rowsA.push(row); row=[]; field=''; } else field+=c; }
    }
    row.push(field); rowsA.push(row);
    const H=(rowsA[0]||[]).map(h=>String(h||'').trim()); const out=[];
    for(let r=1;r<rowsA.length;r++){ const o={}; H.forEach((h,i)=>o[h]=rowsA[r][i]==null?'':rowsA[r][i]); out.push(o); }
    return out;
  }
  const normalizeSheetUrl = u => (u||'').trim().replace(/\/pubhtml(\?.*)?$/i,'/pub?output=csv');

  async function loadData(){
    const SHEET_URL = cfg.sheet;
    if(!SHEET_URL){ console.warn('No sheet URL configured; using SAMPLE_DATA'); return SAMPLE_DATA; }
    const eff = normalizeSheetUrl(SHEET_URL);
    try{
      if(/output=csv/i.test(eff)){ const t=await fetch(eff).then(r=>r.text()); return csvToObjects(t); }
      const r=await fetch(eff); if(!r.ok) throw new Error('HTTP '+r.status);
      const j=await r.json(); return Array.isArray(j.data)?j.data:(Array.isArray(j)?j:[]);
    }catch(e){ console.warn('Fetch failed, using SAMPLE_DATA:', e); return SAMPLE_DATA; }
  }

  const SAMPLE_DATA=[
    {"Business Name":"Sample Plaza","Address":"73 Main Street","Knox Box Location":"Alpha side","Closest Hydrant":"Main & Park",
     "Photo":"https://lh3.googleusercontent.com/d/1vbeLxw_vGQ55hy5BroC3ghkYtBTbN1nw=w800",
     "FDC":"Front entrance","Water Shutoff":"Meter room","Electric Panel Location":"Rear hall","Gas Meter Location":"NW corner","Haz-Mat":"Paint locker"}
  ];

  function buildHeaders(data){ const s=new Set(); data.forEach(r=>Object.keys(r).forEach(k=>s.add(k))); headers=[...s]; }

  // ---- Modal helpers
  function renderKV(k,v){ return `<div class="kv"><div class="k">${k}</div><div class="v">${v||''}</div></div>`; }
  function renderPhotosBlock(items){ return items.length?`<div class="thumb-grid">`+items.map(it=>buildImgWithFallback(it.url,'',300)).join('')+`</div>`:''; }

  function getField(rec,keys){
    for(const k of keys){ if(rec[k] && String(rec[k]).trim()) return String(rec[k]).trim(); }
    const map={}; Object.keys(rec||{}).forEach(h=>map[normalizeKey(h)]=h);
    for(const k of keys){ const nk=normalizeKey(k); if(map[nk]){ const raw=rec[map[nk]]; if(raw!=null && String(raw).trim()) return String(raw).trim(); } }
    for(const k of keys){ const nk=normalizeKey(k); for(const hk in map){ if(hk.includes(nk)){ const raw=rec[map[hk]]; if(raw!=null && String(raw).trim()) return String(raw).trim(); } } }
    return '';
  }
  const isPhotoHeader = h => /photo/i.test(String(h));

  // ---- Render table & modal (single definitions)
  const PAGE_SIZE=10; let page=0,rows=[],headers=[],selectedIndex=-1;

  function renderTable(){
    tableHead.innerHTML = '<tr>'+TABLE_COLUMNS.map(c=>'<th>'+c.label+'</th>').join('')+'</tr>';
    const start=page*PAGE_SIZE; const slice=rows.slice(start,start+PAGE_SIZE);
    tableBody.innerHTML = slice.map((r,i)=>{
      const tds = TABLE_COLUMNS.map(col=>{
        const v=col.getter(r);
        if(col.key==='__photo__'){
          const url = v&&v.url || getField(r,['Photo','Photo:']) || '';
          return '<td class="td-photo">'+(url?buildImgWithFallback(url,'tbl-thumb',160):'')+'</td>';
        }
        return '<td>'+(v||'')+'</td>';
      }).join('');
      return '<tr data-abs-index="'+(start+i)+'">'+tds+'</tr>';
    }).join('');
    loadThumbsWithin(tableBody);
    prevPage.disabled = page<=0;
    nextPage.disabled = (start+PAGE_SIZE)>=rows.length;
    pageInfo.textContent = rows.length ? `Page ${page+1} of ${Math.ceil(rows.length/PAGE_SIZE)}` : '';
  }

  tableBody.addEventListener('click',(ev)=>{
    const tr=ev.target.closest('tr'); if(!tr) return;
    selectedIndex=Number(tr.getAttribute('data-abs-index'));
    document.querySelectorAll('#dataTable tbody tr').forEach(t=>t.classList.remove('selected'));
    tr.classList.add('selected'); if (btnEdit) { btnEdit.disabled=false; } openModal();
  });

  function openModal(){ if(!(typeof selectedIndex==='number' && selectedIndex>=0)) return; __currentOpenIndex = selectedIndex; if(!(typeof selectedIndex==='number' && selectedIndex>=0)) return;
    const rec=rows[selectedIndex]||{};
window._currentRecord = rec;
window._isNewDraft = !!(rec && rec.__isNew);
    const title = getField(rec,['Business Name','Business Name:','Business','Name','Company']) ||
                  getField(rec,['Address','Address:','Site Address','Street Address']) || 'Record';
    modalTitle.textContent = title;

    // tiny thumb left of title
    const tw=document.getElementById('modalThumbWrap');
    if(tw){
      const fp=resolveFirstPhoto(rec);
      tw.innerHTML = fp.url ? buildImgWithFallback(fp.url,'',120) : '';
      loadThumbsWithin(tw);
    }

    // Section nav chips
    sectionNav.innerHTML = SECTION_CONFIG.filter(sc=>sc.id!=='other')
      .map(sc=>`<button class="chip" data-color="${sc.color}" data-target="${sc.id}">${sc.label}</button>`).join('');
    sectionNav.querySelectorAll('.chip').forEach(chip=>{
      chip.addEventListener('click',()=>{
        const id=chip.getAttribute('data-target');
        const el=document.getElementById('section-'+id);
        if(el) el.scrollIntoView({behavior:'smooth',block:'start'});
      });
    });

    // Build sections
    
const buckets={}; SECTION_CONFIG.forEach(sc=>buckets[sc.id]={kv:[],photos:[]});
for (const h of headers){
  const sec = sectionForField(h);
  if (isPhotoHeader(h)){
    const urls = String(rec[h]||'').split(/[\,\r\n]+|\s{2,}|,\s*/).filter(Boolean);
    for (const u of urls){ buckets[sec].photos.push({url:u, sectionId:sec}); }
    // no KV row for photo fields (they're hidden), but previews should still render
    continue;
  }
  // Non-photo fields: respect hide rule
  if (shouldHideInModal(h)) continue;
  const val = rec[h]==null ? '' : String(rec[h]);
  buckets[sec].kv.push(renderKV(h, val));
}
let html='';
    for(const sc of SECTION_CONFIG){
  const {kv,photos} = buckets[sc.id];
  if (!window._isNewDraft && !kv.length && !photos.length) continue;
      const label = sc.id==='other' ? title : sc.label;
      html += `<section id="section-${sc.id}" class="section" data-color="${sc.color}">
        <h3>${label}</h3>
        ${kv.length?`<div class="grid">${kv.join('')}</div>`:''}
        ${renderPhotosBlock(photos)}
      </section>`;
    }
    modalContent.innerHTML = html;
    loadThumbsWithin(modalContent);
    // Open
    if (modal.showModal) modal.showModal(); else { modal.setAttribute('open',''); backdrop.hidden=false; }
  }

  // Close modal (supports non-<dialog> fallback)
  function closeModal(){ if(modal.close) modal.close(); else { modal.removeAttribute('open'); backdrop.hidden=true; } }
  btnCloseModal.addEventListener('click',closeModal);
  backdrop.addEventListener('click',closeModal);

  
  try{ modal.addEventListener('close', ()=>{ __discardDraftIfAny(); }); }catch(_){}
// Toolbar actions
  btnAdd.addEventListener('click',()=>{ const blank={ __isNew:true }; headers.forEach(h=>blank[h]=''); rows.unshift(blank); selectedIndex=0; openModal(); });
  if (btnEdit) btnEdit.addEventListener('click',()=>{ if(selectedIndex>=0) openModal(); });
  prevPage.addEventListener('click',()=>{ if(page>0){ page--; renderTable(); }});
  nextPage.addEventListener('click',()=>{ const total=Math.ceil(rows.length/PAGE_SIZE); if(page<total-1){ page++; renderTable(); }});

  // Search
  searchInput.addEventListener('input',debounce(()=>{
    const q=(searchInput.value||'').trim().toLowerCase();
    if(!q) rows=(window._allRows||[]).slice();
    else rows=(window._allRows||[]).filter(r=>Object.keys(r).some(h=>String(r[h]??'').toLowerCase().includes(q)));
    page=0; renderTable();
  },200));

  // ---- Bootstrap
  (async function init(){
    const data=await loadData(); window._allRows=data; buildHeaders(data); rows=data.slice(); renderTable();
  })();

})();


// ---- Robust modal button wiring (delegation; safe if buttons aren't in DOM yet) ----
(function () {
  document.addEventListener('click', function (e) {
    const t = e.target.closest('#btnModalEdit, #btnModalDone, #btnModalClose');
    if (!t) return;

    // Prefer your existing helpers if present
    if (t.id === 'btnModalEdit') {
      e.preventDefault();
      try { setEditable(true); } catch (_) {}        // defined in popup-edit.js
    }
    if (t.id === 'btnModalDone') {
      e.preventDefault();
      try { saveEdits(); } catch (_) {}              // defined in popup-edit.js
    }
    if (t.id === 'btnModalClose') {
      e.preventDefault();
      try { if (typeof closeModal === 'function') closeModal(); } catch (_) {}
      // After any programmatic close, discard draft if present
      try { if (typeof __discardDraftIfAny === 'function') __discardDraftIfAny(); } catch (_) {}
      // Fallback close if no helper:
      const m = document.getElementById('recordModal');
      if (m) {
        if (typeof m.close === 'function') {
          m.close();
        } else {
          m.removeAttribute('open');
          try { m.dispatchEvent(new Event('close')); } catch(_) {}
          // If this was a new, unsaved draft, force a soft refresh
          try {
            if (window._isNewDraft === true) {
              window._isNewDraft = false;
              setTimeout(()=>location.reload(), 0);
            }
          } catch(_) {}
        }
      }
    }
  });
})();
