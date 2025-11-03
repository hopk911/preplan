/* ==== HFD Pre-Plan – merged, cleaned bundle (Building Construction + FDC + Photo hidden) ==== */
/* Paste this file as app.bundle.js */

;(()=>{
  try{
    const css = `
/* Building Construction (dark red) */
.pill.bldg{background:#8B0000!important;border-color:#5A0000!important;color:#fff!important}
.pill.bldg:hover{filter:brightness(1.05)}
.section-bldg .section-header,
.section.bldg .section-header{background:#8B0000!important;border-bottom:2px solid #5A0000!important;color:#fff!important}
.section.bldg .pill, .tab.bldg{background:#8B0000!important;color:#fff!important}
`;
    if (!document.getElementById('bldg-color-style')){
      const s = document.createElement('style');
      s.id = 'bldg-color-style';
      s.type = 'text/css';
      s.appendChild(document.createTextNode(css));
      document.head.appendChild(s);
    }
  }catch(e){}
})();
/* HFD Pre-Plan — single-file bundle
   - Merges: drive-only thumbnail help + modal + table + search + add/edit hooks
   - Adds: Building Construction section (bldg) + dark red; FDC col; hide Photo: kv rows
*/

(function(){
  'use strict';

  // ---------- Config ----------
  const CFG = {
    PAGE_SIZE: 10,
    get sheet(){ return window.GOOGLE_SHEET_JSON_URL || ''; },
    get webapp(){ return window.WEBAPP_URL || ''; }
  };

  // ---------- DOM ----------
  const tableHead=document.getElementById('tableHead');
  const tableBody=document.getElementById('tableBody');
  const prevPage=document.getElementById('prevPage');
  const nextPage=document.getElementById('nextPage');
  const pageInfo=document.getElementById('pageInfo');
  const searchInput=document.getElementById('searchInput');
  const btnAdd=document.getElementById('btnAdd');
  const modal=document.getElementById('recordModal');
  const backdrop=document.getElementById('modalBackdrop');
  const modalContent=document.getElementById('modalContent');
  const modalTitle=document.getElementById('modalTitle');
  const btnCloseModal=document.getElementById('btnCloseModal');
  const btnEdit= document.getElementById('btnModalEdit');
  const sectionNav=document.getElementById('sectionNav');

  // ---------- Images / Drive helpers ----------
  function proxiedDriveThumb(url,size){
    const w = size || 600;
    const webapp = (window.WEBAPP_URL||'').replace(/\/$/,'');
    if(!webapp) return url;
    const id = extractDriveId(url);
    if(id) return `${webapp}/exec?fn=img&id=${encodeURIComponent(id)}&w=${w}`;
    return `${webapp}/exec?fn=img&u=${encodeURIComponent(url)}&w=${w}`;
  }
  function extractDriveId(u){
    if(!u) return '';
    const m1 = String(u).match(/\/d\/([a-zA-Z0-9_-]{10,})/);
    if(m1) return m1[1];
    const m2 = String(u).match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    if(m2) return m2[1];
    return '';
  }
  function buildImgWithFallback(url,klass,w){
    const driveThumb = proxiedDriveThumb(url,w);
    if(driveThumb!==url){
      const proxied = driveThumb;
      const onerr = "this.onerror=null;this.src='" + driveThumb.replace("'", "\\'") + "'";
      return '<img src="' + proxied + '" onerror="' + onerr + '" class="thumb' + (klass?(' '+klass):'') + '" loading="lazy" alt="photo">';
    }
    return '<img src="' + driveThumb + '" class="thumb' + (klass?(' '+klass):'') + '" loading="lazy" alt="photo">';
  }
  var loadThumbsWithin = function(){ /* no-op in drive-only mode */ };

  // ---------- Sections & routing ----------
  const SECTION_CONFIG = [
    { id:'other',     label:'Other',                 color:'other'     },
    { id:'bldg',      label:'Building Construction', color:'bldg'      }, // NEW
    { id:'fire',      label:'Fire',                  color:'fire'      },
    { id:'elevators', label:'Elevators',             color:'elevators' },
    { id:'ems',       label:'EMS',                   color:'ems'       },
    { id:'water',     label:'Water',                 color:'water'     },
    { id:'electric',  label:'Electric',              color:'electric'  },
    { id:'gas',       label:'Gas',                   color:'gas'       },
    { id:'hazmat',    label:'Hazmat',                color:'hazmat'    }
  ];

  const normalizeKey = k => String(k||'').toLowerCase().replace(/[:\s]+$/,'').replace(/[^a-z0-9]+/g,' ').trim();
  const BASE_HIDE_IN_MODAL = ['timestamp','time stamp','stable id','stableid','address','closest hydrant','knox box location','photo'];

  // Route select
  const FIELD_PATTERNS = [
    [/^\s*Number of Stories\s*:?\s*$/i,'bldg'],
    [/^\s*Occupancy\s*:?\s*$/i,'bldg'],
    [/^\s*Occupancy Notes\s*:?\s*$/i,'bldg'],
    [/^\s*Construction Type\s*:?\s*$/i,'bldg'],
    [/^\s*Construction Type Notes\s*:?\s*$/i,'bldg'],
    [/^\s*Roof Type\s*:?\s*$/i,'bldg'],
    [/^\s*Basement\s*:?\s*$/i,'bldg'],

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
      else{ if(c=='"'){ inQ=true; } else if(c==','){ row.push(field); field=''; } else if(c=='\n'){ row.push(field); rowsA.push(row); row=[]; field=''; } else field+=c; }
    }
    row.push(field); rowsA.push(row);
    const H=(rowsA[0]||[]).map(h=>String(h||'').trim()); const out=[];
    for(let r=1;r<rowsA.length;r++){ const o={}; H.forEach((h,i)=>o[h]=rowsA[r][i]||''); out.push(o); }
    return out;
  }
  function getField(rec,keys){
    for(const k of keys){ if(rec[k] && String(rec[k]).trim()) return String(rec[k]).trim(); }
    const map={}; Object.keys(rec||{}).forEach(h=>map[normalizeKey(h)]=h);
    for(const k of keys){ const nk=normalizeKey(k); const real=map[nk]; if(real && rec[real] && String(rec[real]).trim()) return String(rec[real]).trim(); }
    return '';
  }

  // ---------- Table ----------
  let rows=[], page=0, selectedIndex=-1, headers=null;
  const PAGE_SIZE=CFG.PAGE_SIZE;

  function ensureHeaders(){
    if(headers) return headers;
    const s = new Set();
    const srcA = (window._allRows && Array.isArray(window._allRows)) ? window._allRows : (Array.isArray(rows)?rows:[]);
    srcA.forEach(r => Object.keys(r||{}).forEach(k => s.add(k)));
    headers = Array.from(s);
    if (!headers.length){ headers = ['Business Name','Address','Closest Hydrant','Knox Box Location','Stable ID']; }
    return headers;
  }

  const TABLE_COLUMNS = [
    { key:'__photo__', label:'Photo',            getter:r=>firstPhotoWithSection(r) },
    { key:'business',  label:'Business Name',    getter:r=>getField(r,['Business Name','Business Name:','Business','Name','Company','Facility Name']) },
    { key:'address',   label:'Address',          getter:r=>getField(r,['Address','Address:','Site Address','Street Address','Location Address']) },
    { key:'knox',      label:'Knox Box Location',getter:r=>getField(r,['Knox Box Location','Knox Box Location:','Knox Location','Knox Box']) },
    { key:'hydrant',   label:'Closest Hydrant',  getter:r=>getField(r,['Closest Hydrant','Closest Hydrant:','Nearest Hydrant','Hydrant Location']) },
    { key:'fdc',       label:'FDC',              getter:r=>getField(r,['FDC','FDC Location','Fire Department Connection','FDC:']) }
  ];

  function resolveFirstPhoto(rec){
    const candidates=[];
    function pushParts(val,h){
      if(!val) return;
      String(val).split(/[\,\r\n]+|\s{2,}/).forEach(part=>{
        const p=String(part).trim(); if(p) candidates.push({url:p, header:h||''});
      });
    }
    const keys=['Photo','Photo:','Roof Photo','Roof Photo:','Roof Access Photo','Roof Access Photo:','Alarm Photo','Alarm Photo:','Elevator Photo','Elevator Photo:'];
    keys.forEach(h=>pushParts(rec[h],h));
    headers && headers.forEach(h=>{ if(/photo/i.test(h)) pushParts(rec[h],h); });
    // Prefer any photo in Building Construction first (if we had a header note), else first-photo
    for(const c of candidates){ const id=extractDriveId(c.url); if(id) return {url:c.url, header:c.header}; }
    for(const c of candidates){ return {url:c.url, header:c.header}; }
    return {url:'', header:''};
  }

  function firstPhotoWithSection(r){ return resolveFirstPhoto(r); }

  function buildHeaders(sampleRows){
    const s = new Set();
    (Array.isArray(sampleRows)?sampleRows:[]).forEach(r=>Object.keys(r||{}).forEach(k=>s.add(k)));
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
      });
      return '<tr data-index="'+(start+i)+'">'+tds.join('')+'</tr>';
    }).join('');
    pageInfo.textContent = (page+1)+' / '+(Math.max(1,Math.ceil(rows.length/PAGE_SIZE)));
    tableBody.querySelectorAll('tr').forEach(tr=>{
      tr.addEventListener('click',()=>{ selectedIndex = Number(tr.getAttribute('data-index')||'0'); openModal(); });
    });
  }

  // ---------- Modal ----------
  function renderKV(k,v){
    var _v = (v==null? '' : String(v));
    var _empty = !_v.trim();
    var cls = 'kv' + (_empty ? ' empty' : '');
    return '<div class="' + cls + '"><div class="k">' + k + '</div><div class="v">' + _v + '</div></div>';
  }
  function renderPhotosBlock(items){ return items.length?`<div class="photos">${items.map(it=>buildImgWithFallback(it.url,'',300)).join('')}</div>`:''; }

  function openModal(){
    const rec=rows[selectedIndex]||{};
    // Expose currently opened record to popup-edit.js
    window._currentRecord = rec;
    window._isNewDraft = !!(rec && rec.__isNew);

    ensureHeaders();

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
      const sec = sectionForField(h);
      // Photos: add thumbnails but don't add a KV row
      if(/photo/i.test(String(h))){
        const urls = String(rec[h]||'').split(/[\,\r\n]+|\s{2,}|,\s*/).filter(Boolean);
        for(const u of urls){ buckets[sec].photos.push({url:u, sectionId:sec}); }
        continue;
      }
      // Hide some keys in view mode
      if(isHiddenInModal(h)) continue;
      const val = String(rec[h] ?? '');
      buckets[sec].kv.push(renderKV(h, val));
    }

    let html='';
    for(const sc of SECTION_CONFIG){
      const {kv,photos}=buckets[sc.id]; if(!kv.length && !photos.length && !(window && window._isNewDraft)) continue;
      const label = sc.id==='other' ? title : sc.label;
      html += `<section id="section-${sc.id}" class="section" data-color="${sc.color}">
        <h3>${label}</h3>
        ${kv.length?`<div class="grid">${kv.join('')}</div>`:''}
        ${renderPhotosBlock(photos)}
      </section>`;
    }
    modalContent.innerHTML = html;
    loadThumbsWithin(modalContent);

    if (modal.showModal) modal.showModal(); else { modal.setAttribute('open',''); backdrop.hidden=false; }
  }

  function closeModal(){ if(modal.close) modal.close(); else { modal.removeAttribute('open'); backdrop.hidden=true;  discardDraftIfNeeded && discardDraftIfNeeded(); } }
  btnCloseModal.addEventListener('click',closeModal);

  // Simple hidden-keys logic (view mode only)
  const isHiddenInModal = k => {
    const m = document.getElementById('recordModal');
    const editing = !!(m && m.classList && m.classList.contains('editing'));
    if (editing) return false;
    return BASE_HIDE_IN_MODAL.includes(normalizeKey(k));
  };

  // ---------- Paging / Search ----------
  prevPage.addEventListener('click',()=>{ if(page>0){ page--; renderTable(); } });
  nextPage.addEventListener('click',()=>{ if((page+1)*PAGE_SIZE<rows.length){ page++; renderTable(); } });

  function onSearch(){
    const q=(searchInput.value||'').trim().toLowerCase();
    if(!q) rows=(window._allRows||[]).slice();
    else rows=(window._allRows||[]).filter(r=>Object.keys(r).some(h=>String(r[h]??'').toLowerCase().includes(q)));
    page=0; selectedIndex=-1; renderTable();
  }
  let _t=null;
  searchInput.addEventListener('input',()=>{ clearTimeout(_t); _t=setTimeout(onSearch, 200); });

  // ---------- Add New ----------
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
    }catch(e){ console.error('[addNew] failed to add new record', e); alert('Unable to create a new draft row. See console.'); }
  });
  btnEdit.addEventListener('click',()=>{ if(selectedIndex>=0) openModal(); });

  // ---------- Data loading ----------
  async function loadData(){
    const src = (window.GOOGLE_SHEET_JSON_URL||'').trim();
    if(src){
      try{
        const u = normalizeSheetUrl(src);
        const res = await fetch(u, {cache:'no-store'});
        const text = await res.text();
        return csvToObjects(text);
      }catch(e){ console.warn('[loadData csv]',e); }
    }
    // fallback: try webapp ?fn=sheet (optional)
    try{
      const webapp = (window.WEBAPP_URL || '').replace(/\/$/,'');
      if(webapp){
        const u = `${webapp}/exec?fn=sheet`;
        const res = await fetch(u, {cache:'no-store'});
        const json = await res.json();
        if(Array.isArray(json && json.rows)) return json.rows;
      }
    }catch(e){ console.warn('[loadData webapp]',e); }
    return [];
  }
  function normalizeSheetUrl(u){ return (u||'').trim().replace(/\/pubhtml(\?.*)?$/i,'/pub?output=csv'); }

  // ---------- Boot ----------
  (async function(){
    const data=await loadData(); window._allRows=data; buildHeaders(data); rows=data.slice(); renderTable();
  })();

  // (Optional) helpers copied by index.html footer
  // function findStableKey(headersArr){ ... }
  // function generateStableId(){ ... }
  // function discardDraftIfNeeded(){ ... }
})();

/* End of app.bundle.js */
