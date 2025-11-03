/* HFD Pre-Plan — single-file bundle
   - Merges: drive-only thumbnail helper + main app logic
   - No prototype monkey-patching; no duplicate globals
*/
console.log('[bundle] JSONP rows build is active');


(function(){
  'use strict';

  // ---------- Config ----------
  const CFG = {
    get sheet(){ return window.GOOGLE_SHEET_JSON_URL || ''; },
    get webapp(){ return window.WEBAPP_URL || ''; }
  };

  // ---------- Drive-only thumbnail builder ----------
  function extractDriveId(input){
    if (!input) return '';
    const s = String(input).trim();
    let m = s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/); if (m) return m[1];
    m = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/);     if (m) return m[1];
    m = s.match(/^([a-zA-Z0-9_-]{20,})$/);         if (m) return m[1];
    return '';
  }
  
function buildImgWithFallback(srcOrId, cls, size){
  if (!srcOrId) return '';
  const w = size || 600;
  const id = extractDriveId(srcOrId);
  const driveThumb = id ? ('https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w' + w) : String(srcOrId);
  const webapp = (window.WEBAPP_URL||'').replace(/\/$/,'');
  const good = !!(webapp && /^https:\/\/script\.google\.com\//.test(webapp) && webapp.length > 40);
  const proxied = (good && id) ? (webapp + '?id=' + encodeURIComponent(id) + '&w=' + w) : '';
  const klass = cls ? (' ' + cls) : '';
  if (proxied) {
    // Proxy FIRST; if it fails, fall back to Drive thumb
    const onerr = "this.onerror=null;this.src='" + driveThumb.replace("'", "\\'") + "'";
    return '<img src="' + proxied + '" onerror="' + onerr + '" class="thumb' + klass + '" loading="lazy" alt="photo">';
  }
  return '<img src="' + driveThumb + '" class="thumb' + klass + '" loading="lazy" alt="photo">';
}
  var loadThumbsWithin = function(){ /* no-op in drive-only mode */ };
// ---------- Sections & routing ----------
  const SECTION_CONFIG = [
    { id:'other',     label:'Other',     color:'other'     },
    { id:'bldg',      label:'Building Construction', color:'bldg' },
    { id:'fire',      label:'Fire',      color:'fire'      },
    { id:'elevators', label:'Elevators', color:'elevators' },
    { id:'ems',       label:'EMS',       color:'ems'       },
    { id:'water',     label:'Water',     color:'water'     },
    { id:'electric',  label:'Electric',  color:'electric'  },
    { id:'gas',       label:'Gas',       color:'gas'       },
    { id:'hazmat',    label:'Hazmat',    color:'hazmat'    }
  ];
// ---- Optional per-section field order (top-to-bottom) ----
const FIELD_ORDER = {
  bldg: [
    'Number of Stories:', 'Occupancy:', 'Occupancy Notes:',
    'Construction Type:', 'Construction Type Notes:',
    'Roof Type:', 'Basement:'
  ],
  other: ['Address:', 'Knox Box Location:', 'Closest Hydrant:'],
  fire:  ['FDC:', 'Remote Alarm Location:', 'Sprinkler Main Shutoff Location:']
};
function _normKeyLabel(s){ return String(s||'').toLowerCase().replace(/:\s*$/,'').trim(); }
function _orderFor(sectionId){
  const arr = FIELD_ORDER[sectionId] || [];
  const idx = new Map(arr.map((h,i)=>[_normKeyLabel(h), i]));
  return (a, b) => {
    const ak = (a.h != null ? a.h : a).toString();
    const bk = (b.h != null ? b.h : b).toString();
    const ia = idx.has(_normKeyLabel(ak)) ? idx.get(_normKeyLabel(ak)) : 1e6;
    const ib = idx.has(_normKeyLabel(bk)) ? idx.get(_normKeyLabel(bk)) : 1e6;
    if (ia !== ib) return ia - ib;
    return _normKeyLabel(ak).localeCompare(_normKeyLabel(bk));
  };
}


  const TABLE_COLUMNS = [
    { key:'__photo__', label:'Photo',            getter:r=>firstPhotoWithSection(r) },
    { key:'business',  label:'Business Name',    getter:r=>getField(r,['Business Name','Business Name:','Business','Name','Company','Facility Name']) },
    { key:'address',   label:'Address',          getter:r=>getField(r,['Address','Address:','Site Address','Street Address','Location Address']) },
    { key:'knox',      label:'Knox Box Location',getter:r=>getField(r,['Knox Box Location','Knox Box Location:','Knox Location','Knox Box']) },
    { key:'fdc',      label:'FDC',              getter:r=>getField(r,['FDC','FDC:','FDC Location','FDC Location:','Fire Department Connection','Fire Department Connection:']) },
    { key:'hydrant',   label:'Closest Hydrant',  getter:r=>getField(r,['Closest Hydrant','Closest Hydrant:','Nearest Hydrant','Hydrant Location']) }
  ];

  const BASE_HIDE_IN_MODAL = ['timestamp', 'time stamp', 'stable id', 'stableid'];
  const normalizeKey = k => String(k||'').toLowerCase().replace(/[:\s]+$/,'').replace(/[^a-z0-9]+/g,' ').trim();
  const isHiddenInModal = k => {
    const m = document.getElementById('recordModal');
    const editing = !!(m && m.classList && m.classList.contains('editing'));
    if (editing) return false;
    return BASE_HIDE_IN_MODAL.includes(normalizeKey(k));
  };

  const FIELD_PATTERNS = [
            [/^Address:?$/i,'other'],
    [/^Closest Hydrant:?$/i,'other'],
    [/^Knox Box Location:?$/i,'other'],
[ /^Number of Stories:?$/i,'bldg' ],
    [ /^Occupancy:?$/i,'bldg' ],
    [ /^Occupancy Notes:?$/i,'bldg' ],
    [ /^Construction Type:?$/i,'bldg' ],
    [ /^Construction Type Notes:?$/i,'bldg' ],
    [ /^Roof Type:?$/i,'bldg' ],
    [ /^Basement:?$/i,'bldg' ],
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
  function sectionForField(label){
    let h = String(label||'').trim();
    for (const [re,id] of FIELD_PATTERNS) if (re.test(h)) return id;
    return 'other';
  }

  // ---------- Data helpers ----------
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
  function normalizeSheetUrl(u){ return (u||'').trim().replace(/\/pubhtml(\?.*)?$/i,'/pub?output=csv'); }
 async function loadData(){
  const webapp = (window.WEBAPP_URL || '').replace(/\/$/,'');
  // 1) Try JSONP rows from Apps Script first (works for domain users; no CORS)
  if (webapp){
    try{
      const data = await new Promise((resolve, reject)=>{
        const cb = '__rows_cb_' + Date.now();
        window[cb] = (resp)=>{
          try {
            delete window[cb];
            if (resp && resp.ok && Array.isArray(resp.data)) resolve(resp.data);
            else reject(new Error('rows: bad response'));
          } catch(e){ reject(e); }
        };
        const s = document.createElement('script');
        s.src = webapp + '?fn=rows&callback=' + cb;
        s.onerror = function(){ delete window[cb]; reject(new Error('rows: jsonp error')); };
        document.head.appendChild(s);
      });
      return data;
    }catch(e){
      console.warn('WebApp rows failed, falling back to CSV:', e);
    }
  }

  // 2) Fallback to CSV if your admin ever allows publish-to-web again
  const eff = normalizeSheetUrl(CFG.sheet);
  if(!eff) return SAMPLE_DATA;
  try{
    if(/output=csv/i.test(eff)){
      const t = await fetch(eff).then(r => r.text());
      return csvToObjects(t);
    }
    const r = await fetch(eff);
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j = await r.json();
    return Array.isArray(j.data) ? j.data : (Array.isArray(j) ? j : []);
  }catch(e){
    console.warn('Fetch failed, using SAMPLE_DATA:', e);
    return SAMPLE_DATA;
  }
}


  const SAMPLE_DATA=[
    {"Business Name":"Sample Plaza","Address":"73 Main Street","Knox Box Location":"Alpha side","Closest Hydrant":"Main & Park",
     "Photo":"https://lh3.googleusercontent.com/d/1vbeLxw_vGQ55hy5BroC3ghkYtBTbN1nw=w800",
     "FDC":"Front entrance","Water Shutoff":"Meter room","Electric Panel Location":"Rear hall","Gas Meter Location":"NW corner","Haz-Mat":"Paint locker"}
  ];

  function getField(rec,keys){
    for(const k of keys){ if(rec[k] && String(rec[k]).trim()) return String(rec[k]).trim(); }
    const map={}; Object.keys(rec||{}).forEach(h=>map[normalizeKey(h)]=h);
    for(const k of keys){ const nk=normalizeKey(k); if(map[nk]){ const raw=rec[map[nk]]; if(raw!=null && String(raw).trim()) return String(raw).trim(); } }
    for(const k of keys){ const nk=normalizeKey(k); for(const hk in map){ if(hk.includes(nk)){ const raw=rec[map[hk]]; if(raw!=null && String(raw).trim()) return String(raw).trim(); } } }
    return '';
  }
  const isPhotoHeader = h => /photo/i.test(String(h));

  function resolveFirstPhoto(rec){
    const headers = Object.keys(rec||{}).filter(h => /photo/i.test(String(h)));
    const candidates = [];
    const pushParts = (val,h)=>{
      if(!val) return;
      String(val).split(/[\,\r\n]+|\s{2,}/).forEach(part=>{
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

  // ---------- DOM refs ----------
  const $ = (id)=>document.getElementById(id);
  const tableHead = $('tableHead'), tableBody = $('tableBody');
  const prevPage  = $('prevPage'), nextPage = $('nextPage'), pageInfo = $('pageInfo');
  const btnAdd    = $('btnAdd'), searchInput = $('searchInput');
  const modal=$('recordModal'),modalTitle=$('modalTitle'),modalContent=$('modalContent'),sectionNav=$('sectionNav');
  const btnCloseModal=$('btnCloseModal'),backdrop=$('modalBackdrop');

  // ---------- State ----------
  const PAGE_SIZE=10; let page=0,rows=[],headers=[],selectedIndex=-1;

  function buildHeaders(data){ const s=new Set(); data.forEach(r=>Object.keys(r).forEach(k=>s.add(k))); headers=[...s]; }
function ensureHeaders(){
  if (Array.isArray(headers) && headers.length) return headers;
  const s = new Set();
  const srcA = (window._allRows && Array.isArray(window._allRows)) ? window._allRows : (Array.isArray(rows)?rows:[]);
  srcA.forEach(r => Object.keys(r||{}).forEach(k => s.add(k)));
  headers = Array.from(s);
  if (!headers.length){ headers = ['Business Name','Address','Closest Hydrant','Knox Box Location','Stable ID']; }
  return headers;
}


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
    tr.classList.add('selected');
openModal();
  });

  function renderKV(k,v){
  var _v = (v==null? '' : String(v));
  var _empty = !_v.trim();
  var cls = 'kv' + (_empty ? ' empty' : '');
  return '<div class="' + cls + '"><div class="k">' + k + '</div><div class="v">' + _v + '</div></div>';
}
function renderPhotosBlock(items){ return items.length?`<div class="thumb-grid">`+items.map(it=>buildImgWithFallback(it.url,'',300)).join('')+`</div>`:''; }

  function openModal(){
    const rec=rows[selectedIndex]||{};
    // Expose currently opened record to popup-edit.js
    window._currentRecord = rec;
  window._isNewDraft = !!(rec && rec.__isNew);

    const title = getField(rec,['Business Name','Business Name:','Business','Name','Company']) ||
                  getField(rec,['Address','Address:','Site Address','Street Address']) || 'Record';
    modalTitle.textContent = title;

    // Thumb
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

    // Buckets
    const buckets={}; SECTION_CONFIG.forEach(sc=>buckets[sc.id]={kv:[],photos:[]});
    for(const h of headers){
      if(isHiddenInModal(h)) continue;
      const sec=sectionForField(h);
      if(/photo/i.test(String(h))){
        const urls=String(rec[h]||'').split(/[\,\r\n]+|\s{2,}|,\s*/).filter(Boolean);
        for(const u of urls) buckets[sec].photos.push({url:u,sectionId:sec});
      } else {
        const val=String(rec[h]??''); buckets[sec].kv.push({h:h, html: renderKV(h,val)});
      }
    }
    let html='';
    for(const sc of SECTION_CONFIG){
      const {kv,photos}=buckets[sc.id];
      if(Array.isArray(kv)) kv.sort(_orderFor(sc.id)); if(!kv.length && !photos.length && !(window && window._isNewDraft)) continue;
      const label = sc.id==='other' ? title : sc.label;
      html += `<section id="section-${sc.id}" class="section" data-color="${sc.color}">
        <h3>${label}</h3>
        ${kv.length?`<div class="grid">${kv.map(it=>it.html||it).join('')}</div>`:''}
        ${renderPhotosBlock(photos)}
      </section>`;
    }
    modalContent.innerHTML = html;
    loadThumbsWithin(modalContent);

    if (modal.showModal) modal.showModal(); else { modal.setAttribute('open',''); backdrop.hidden=false; }
  }

  function closeModal(){ if(modal.close) modal.close(); else { modal.removeAttribute('open'); backdrop.hidden=true;  discardDraftIfNeeded && discardDraftIfNeeded(); } }
  btnCloseModal.addEventListener('click',closeModal);
  backdrop.addEventListener('click',closeModal);
  if (modal && modal.addEventListener) modal.addEventListener('close', ()=>{ discardDraftIfNeeded && discardDraftIfNeeded(); });

  // Toolbar actions
  btnAdd.addEventListener('click', ()=>{
  try{
    ensureHeaders();
    const sKey = (typeof findStableKey==='function') ? findStableKey(headers) : 'Stable ID';
    if (!headers.includes(sKey)) headers.push(sKey);
    const rec = {}; headers.forEach(h=> rec[h]='');
    rec[sKey] = (typeof generateStableId==='function') ? generateStableId() : (Date.now().toString(36).toUpperCase());
    Object.defineProperty(rec,'__isNew',{value:true, enumerable:false, writable:true});
    Object.defineProperty(rec,'__saved',{value:false, enumerable:false, writable:true});
    rows.unshift(rec); selectedIndex=0; renderTable && renderTable(); openModal && openModal();
  }catch(e){ console.error('[addNew] failed to add new record', e); try{ alert('Unable to create a new draft row. See console.'); }catch(_){} }
});
btnEdit.addEventListener('click',()=>{ if(selectedIndex>=0) openModal(); });
  prevPage.addEventListener('click',()=>{ if(page>0){ page--; renderTable(); }});
  nextPage.addEventListener('click',()=>{ const total=Math.ceil(rows.length/PAGE_SIZE); if(page<total-1){ page++; renderTable(); }});

  // Search (debounced)
  function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
  const onSearch = debounce(()=>{
    const q=(searchInput.value||'').trim().toLowerCase();
    if(!q) rows=(window._allRows||[]).slice();
    else rows=(window._allRows||[]).filter(r=>Object.keys(r).some(h=>String(r[h]??'').toLowerCase().includes(q)));
    page=0; renderTable();
  },200);
  searchInput.addEventListener('input', onSearch);

  // Bootstrap
  (async function init(){
    const data=await loadData(); window._allRows=data; buildHeaders(data); rows=data.slice(); renderTable();
  
function findStableKey(headersArr){ const CANON='Stable ID'; const hit=(headersArr||[]).find(h=> String(h||'').toLowerCase().replace(/[:\s]+$/,'').trim()==='stable id'); return hit||CANON; }
function generateStableId(){ const t=new Date(), pad=n=>String(n).padStart(2,'0'); const stamp=`${t.getFullYear()}${pad(t.getMonth()+1)}${pad(t.getDate())}-${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}`; const rnd=Math.random().toString(36).slice(2,6).toUpperCase(); return `PP-${stamp}-${rnd}`; }
function discardDraftIfNeeded(){ try{ const rec=rows[selectedIndex]; if(rec && rec.__isNew && !rec.__saved){ rows.splice(selectedIndex,1); selectedIndex=-1; renderTable && renderTable(); } }catch(e){ console.warn('[addNew] discardDraftIfNeeded',e); } }
})();


function findStableKey(headersArr){ const CANON='Stable ID'; const hit=(headersArr||[]).find(h=> String(h||'').toLowerCase().replace(/[:\s]+$/,'').trim()==='stable id'); return hit||CANON; }
function generateStableId(){ const t=new Date(), pad=n=>String(n).padStart(2,'0'); const stamp=`${t.getFullYear()}${pad(t.getMonth()+1)}${pad(t.getDate())}-${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}`; const rnd=Math.random().toString(36).slice(2,6).toUpperCase(); return `PP-${stamp}-${rnd}`; }
function discardDraftIfNeeded(){ try{ const rec=rows[selectedIndex]; if(rec && rec.__isNew && !rec.__saved){ rows.splice(selectedIndex,1); selectedIndex=-1; renderTable && renderTable(); } }catch(e){ console.warn('[addNew] discardDraftIfNeeded',e); } }
})(); 
