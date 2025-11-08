// popup-edit.js — always require password before each Edit + reset if closed without save
(function () {
  'use strict';


// ==== SID helpers (safe defaults) ====
window.SID_HEADER = window.SID_HEADER || 'Stable ID';
window.SID_LABEL  = window.SID_LABEL  || 'SID';

/** Generate a stable ID if none exists (base36 timestamp + random). */
function genSID(){
  try{
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2,8);
    const prefix = (window._userInitials || '').toString().replace(/[^A-Za-z0-9]/g,'').toUpperCase();
    return (prefix ? (prefix + '-') : '') + t + '-' + r;
  }catch(_){
    // ultra-fallback
    return 'sid-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
  }
}

/** Ensure we always have a SID cached and on the current record */
function ensureSID(){
  try{
    let sid =
      (window._currentSID) ||
      (window._currentRecord && (window._currentRecord['Stable ID'] || window._currentRecord['SID'] || window._currentRecord['Stable ID:'])) ||
      '';

    if (!sid) sid = genSID();
    window._currentSID = sid;

    // reflect into record so saves include it
    if (window._currentRecord && typeof window._currentRecord === 'object'){
      window._currentRecord[window.SID_HEADER] = sid;
      window._currentRecord[window.SID_LABEL]  = sid;
    }
    return sid;
  }catch(e){
    // as a last resort
    const sid = genSID();
    window._currentSID = sid;
    return sid;
  }
}



// === Dropdown config (single source of truth) ===
const OCCUPANCY_OPTIONS = [
  'Apartment','Assembly','Ambulatory Health Care','Business','Day Care','Detention and Correctional','Educational','Factory/Industrial','Health Care','High Hazard','Institutional','Mercantile','Mixed Use','One and Two Family Dwelling','Residential Board and Care','Storage','Utility/Misc','Vacant', 'Other', 'Unknown'
];
const CONSTRUCTION_TYPE_OPTIONS = ['Type I (Fire Resistive)','Type II (Non-Combustible)','Type III (Ordinary)','Type IV (Heavy Timber)','Type V (Wood Frame)'];
const ROOF_TYPE_OPTIONS         = ['Flat','Pitched','Arch','Metal','Membrane','Hip','Gable','Gambrel','Mansard','Other'];
const ELEVATOR_TYPE_OPTIONS     = ['Hydraulic','Traction','Machine-Room-Less (MRL)','None','Unknown'];
const ALARM_TYPE_OPTIONS        = ['Local','Central Station','Proprietary','Remote Supervising','None','Unknown'];

const FIELD_SELECTS = {
  'occupancy': OCCUPANCY_OPTIONS,
  'construction type': CONSTRUCTION_TYPE_OPTIONS,
  'roof type': ROOF_TYPE_OPTIONS,
  'elevator type': ELEVATOR_TYPE_OPTIONS,
  'alarm type': ALARM_TYPE_OPTIONS
};
// === End dropdown config ===

function _normLabel(s){ return String(s||'').toLowerCase().replace(/:\s*$/,'').trim(); }

function buildSelect(options, currentValue){
  const sel = document.createElement('select');
  sel.className = 'hfd-select';
  sel.setAttribute('data-select-for', '1');
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = '';
  sel.appendChild(blank);
  (options||[]).forEach(opt=>{
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt;
    sel.appendChild(o);
  });
  if (currentValue && options.includes(currentValue)) sel.value = currentValue;
  return sel;
}



  const modal   = document.getElementById('recordModal');
  const content = document.getElementById('modalContent');

  // === Wait overlay helpers (Save/Upload) ===
  function ensureWaitHost(){
    let host = modal.querySelector('.upload-wait');
    if (!host){
      host = document.createElement('div');
      host.className = 'upload-wait';
      host.innerHTML = '<div class="box"><div class="spinner"></div><div class="msg">Working…</div></div>';
      modal.appendChild(host);
    }
    return host;
  }
  function showWait(msg){
    const host = ensureWaitHost();
    const label = host.querySelector('.msg');
    if (label) label.textContent = msg || 'Working…';
    host.style.display = 'flex';
    return ()=>{ host.style.display = 'none'; };
  }

  const btn     = document.getElementById('btnModalEdit');
  const closeBtn = document.getElementById('btnCloseModal');
  if (!modal || !content || !btn) { console.warn('[popup-edit.js] missing DOM'); return; }

  const WEBAPP_URL  = (window && window.WEBAPP_URL)  || '';
  const SID_HEADER = 'Stable ID', SID_LABEL = 'Stable ID:';

  function editToken(){ return sessionStorage.getItem('HFD_EDIT_TOKEN') || ''; }
  function setToken(t){ if (t) sessionStorage.setItem('HFD_EDIT_TOKEN', t); }
  function clearEditToken(){ try{ sessionStorage.removeItem('HFD_EDIT_TOKEN'); }catch(_){} }

  function resetEditing(){
    modal.classList.remove('editing');
    btn.classList.remove('toggled');
    btn.textContent = 'Edit';
    content.querySelectorAll('.kv .v').forEach(v => v.removeAttribute('contenteditable'));
  }
// hotfix: hide editing/saved badges when exiting edit mode
try{ (function(){ 
  var b=document.getElementById('editBadge'); if(b){ b.hidden=true; b.classList.remove('show'); }
  var s=document.getElementById('saveBadge'); if(s){ s.hidden=true; s.classList.remove('show'); }
})(); }catch(_){}


  
async function getEditToken() {
  clearEditToken();
  if (!window.WEBAPP_URL) { alert('WEBAPP_URL is not set'); throw new Error('No WEBAPP_URL'); }

  // Try modal if present
  const modal = document.getElementById('pwModal');
  /* HFD PW-IN-DIALOG HOTFIX */
  try{
    const dlg = document.getElementById('recordModal');
    if (dlg && dlg.hasAttribute('open') && modal && modal.parentElement !== dlg){
      dlg.appendChild(modal);
      modal.classList.add('in-dialog');
    }
  }catch(_){}

  const input = document.getElementById('pwInput');
  const okBtn = document.getElementById('pwOk');
  const cancelBtn = document.getElementById('pwCancel');

  let pw = '';
  if (modal && input && okBtn && cancelBtn){
    pw = await new Promise((resolve, reject)=>{
      function cleanup(){
        try{ okBtn.removeEventListener('click', onOK); }catch(_){}
        try{ cancelBtn.removeEventListener('click', onCancel); }catch(_){}
        try{ input.removeEventListener('keydown', onKey); }catch(_){}
        modal.hidden = true;
      }
      function onOK(){
        const v = (input.value||'').trim();
        cleanup();
        resolve(v);
      }
      function onCancel(){
        cleanup();
        reject(new Error('Password required'));
      }
      function onKey(e){
        if (e.key === 'Enter'){ onOK(); }
        if (e.key === 'Escape'){ onCancel(); }
      }
      modal.hidden = false;
      input.value='';
      setTimeout(()=>{ try{ input.focus(); }catch(_){ } }, 30);
      okBtn.addEventListener('click', onOK);
      cancelBtn.addEventListener('click', onCancel);
      input.addEventListener('keydown', onKey);
    });
  } else {
    // Fallback to prompt if modal not available
    pw = window.prompt('Enter edit password:');
    if (!pw) throw new Error('Password required');
  }

  function jsonp(url){
    return new Promise((resolve, reject) => {
      const cb = '__hfd_cb_' + Math.random().toString(36).slice(2);
      window[cb] = (data) => { try{ delete window[cb]; }catch(_){ } s.remove(); resolve(data); };
      const s = document.createElement('script');
      s.onerror = () => { try{ delete window[cb]; }catch(_){ } s.remove(); reject(new Error('JSONP failed')); };
      s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
      document.head.appendChild(s);
    });
  }
  const url = window.WEBAPP_URL + '?fn=authedit&pw=' + encodeURIComponent(pw);
  const res = await jsonp(url);
  if (!res || !res.ok || !res.token) { alert('Invalid password'); throw new Error('Invalid password'); }
  setToken(res.token);
  return res.token;
}
function genSID(){
  const d = new Date();
  const z = n => String(n).padStart(2,'0');
  const rand = Math.floor(Math.random()*65536).toString(36).padStart(4,'0');
  // YYYYMMDD-HHMM-rand
  return `${d.getFullYear()}${z(d.getMonth()+1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}-${rand}`;
}


  
function ensureSID(){
  const rec = (typeof window._currentRecord === 'object' && window._currentRecord) ? window._currentRecord : {};
  window._currentRecord = rec;
  let sid = rec[SID_HEADER] || rec[SID_LABEL];
  if (!sid || !String(sid).trim()){
    sid = genSID();
    rec[SID_HEADER] = sid;
    rec[SID_LABEL]  = sid;
    try{
      // Update the Stable ID row in the DOM if it exists
      const rows = Array.from(content.querySelectorAll('.kv'));
      const row = rows.find(r => ((r.querySelector('.k')?.innerText || '').trim().replace(/:$/, '') === SID_HEADER));
      if (row){
        const v = row.querySelector('.v'); if (v) v.textContent = sid;
      }
    }catch(_){}
  }
  return sid;
}


  function setEditable(on){
  modal.classList.toggle('editing', !!on);
  btn.classList.toggle('toggled', !!on);
  btn.textContent = on ? 'Save' : 'Edit';

  content.querySelectorAll('.kv').forEach(row => {
    const kEl = row.querySelector('.k');
    const vEl = row.querySelector('.v');
    if (!kEl || !vEl) return;

    const isKey = ((kEl.innerText||'').trim().replace(/:$/,'') === SID_HEADER);
    row.classList.toggle('locked', isKey);

    if (on){
      if (isKey){
        vEl.removeAttribute('contenteditable');
        return;
      }
      const label = (kEl.innerText||'').trim();
      const key   = _normLabel(label);
      const opts  = FIELD_SELECTS[key];

      if (Array.isArray(opts) && opts.length){
        let sel = vEl.querySelector('select.hfd-select');
        if (!sel){
          const currentText = (vEl.innerText || '').trim();
          vEl.innerHTML = '';
          sel = buildSelect(opts, currentText);
          vEl.appendChild(sel);
        }
      }else{
        vEl.setAttribute('contenteditable','true');
      }
    } else {
      const sel = vEl.querySelector('select.hfd-select');
      if (sel){
        const chosen = sel.value || '';
        vEl.innerHTML = '';
        vEl.textContent = chosen;
      }else{
        vEl.removeAttribute('contenteditable');
      }
    }
  });
}


  function collectFromPopup(){
  const data = {};
  content.querySelectorAll('.kv').forEach(row => {
    const k = (row.querySelector('.k')?.innerText || '').replace(/\u00a0/g,' ').trim();
    if (!k) return;

    const vWrap = row.querySelector('.v');
    if (!vWrap) return;

    const sel = vWrap.querySelector('select.hfd-select');
    const v   = sel ? (sel.value || '') : ((vWrap.innerText || '').trim());

    data[/:\s*$/.test(k) ? k : (k + ':')] = v;
  });

  const sid = ensureSID();
  if (!data[SID_LABEL] && !data[SID_HEADER]) data[SID_LABEL] = String(sid);

  if (window._currentRecord){
    Object.keys(window._currentRecord).forEach(h => {
      if (/:$/.test(h) && window._currentRecord[h] && /photo/i.test(h)) data[h] = window._currentRecord[h];
    });
  }
  return data;
}


  async function saveViaPost(payload){
    const form = new URLSearchParams();
    form.set('fn','save');
    form.set('payload', JSON.stringify(payload));
    form.set('token', editToken());
    const res = await fetch(WEBAPP_URL, { method:'POST', body: form });
    let j = {};
    try { j = await res.json(); } catch(_){}
    if (!res.ok || j.ok === false) throw new Error(String(j.error || ('HTTP '+res.status)));
    return j;
  }

  function closeModal(){
    try {
      resetEditing(); // Reset UI
      if (typeof modal.close === 'function') modal.close();
      else modal.removeAttribute('open');
    } catch(_){}
  }

  btn.addEventListener('click', async function(){
    const enteringEdit = !modal.classList.contains('editing');
    if (enteringEdit){
      const tok = await getEditToken();
      if (!tok) return;
      ensureSID();
      setEditable(true);
      return;
    }

    const original = (window._currentRecord && typeof window._currentRecord==='object') ? window._currentRecord : {};
    const edited   = collectFromPopup();
    const payload  = Object.assign({}, original, edited);
    const sid = ensureSID();
    payload[SID_HEADER] = sid;
    payload[SID_LABEL]  = sid;

    
    const hideWait = showWait('Saving changes…');btn.disabled = true;
    try{
      await saveViaPost(payload);
      clearEditToken();
      resetEditing();
      closeModal();
      window.location.reload();
    }catch(e){
      console.error(e);
      alert('Save failed: ' + (e.message || e));
      setEditable(true);
    }finally{
      try{ hideWait(); }catch(_){ }
      btn.disabled = false;
    }
  });

  // Ensure clean state on any close
  if (closeBtn) closeBtn.addEventListener('click', () => {
    clearEditToken();
    resetEditing();
  });
  modal.addEventListener('close', () => {
    clearEditToken();
    resetEditing();
  });

  // Also reset automatically when modal is reopened
  new MutationObserver(() => {
    if (modal.hasAttribute('open')) resetEditing();
  }).observe(modal, { attributes: true, attributeFilter: ['open'] });

  console.log('[popup-edit.js] ready. WEBAPP_URL:', WEBAPP_URL);
})();


// /* hotfix: badge sync */
(function(){
  var modal = document.getElementById('recordModal');
  var badge = document.getElementById('editBadge');
  if(!modal || !badge) return;
  function sync(){
    var on = modal.classList.contains('editing');
    badge.hidden = !on;
    if (!on) badge.classList.remove('show');
  }
  // run at start, on DOM ready, on class change, and when dialog open attr flips
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync); else sync();
  new MutationObserver(sync).observe(modal, { attributes:true, attributeFilter:['class','open'] });
})();





// === HFD: Chip order (safe modal-scoped) — 2025-11-07 ===
// Order: bldg, staging, fire, water, electric, gas, elevators, hazmat, ems, other
(function(){
  'use strict';
  try{
    const DESIRED = ['bldg','staging','fire','water','electric','gas','elevators','hazmat','ems','other'];

    function keyFor(el){
      try{
        const d = el && el.dataset ? el.dataset : {};
        return (d.color || d.id || (el.textContent||'')).toString().trim().toLowerCase();
      }catch(_){ return ''; }
    }
    function idxFor(el){
      const i = DESIRED.indexOf(keyFor(el));
      return i >= 0 ? i : DESIRED.length + 1;
    }
    function reorderOnce(nav){
      try{
        if (!nav) return;
        const chips = Array.from(nav.querySelectorAll('.chip'));
        if (chips.length <= 1) return;
        const frag = document.createDocumentFragment();
        chips.sort((a,b)=> idxFor(a) - idxFor(b)).forEach(c=>frag.appendChild(c));
        nav.appendChild(frag);
      }catch(_){ /* never throw */ }
    }

    function install(){
      const dlg = document.getElementById('recordModal');
      if (!dlg) return;
      const obs = new MutationObserver((muts)=>{
        for (const m of muts){
          if (m.type === 'attributes' && m.attributeName === 'open' && dlg.hasAttribute('open')){
            const nav = document.getElementById('sectionNav');
            setTimeout(()=>{ reorderOnce(nav); }, 0);
          }
        }
      });
      obs.observe(dlg, { attributes:true, attributeFilter:['open'] });
      dlg.__hfdOrderObs = obs;
    }

    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', install, { once:true });
    }else{
      setTimeout(install, 0);
    }
  }catch(_){ /* never throw */ }
})();


// === Measure sticky elements for exact offsets (no tuck-under) — 2025-11-07 ===
(function(){
  'use strict';
  function setStickyVars(){
    const dlg  = document.getElementById('recordModal');
    if (!dlg) return;
    const head = dlg.querySelector('.modal-head');
    const nav  = dlg.querySelector('.section-nav');

    const headH = head ? head.offsetHeight : 56;
    const navH  = nav  ? nav.offsetHeight  : 40;

    document.documentElement.style.setProperty('--modal-head-h', headH + 'px');
    document.documentElement.style.setProperty('--section-nav-h', navH + 'px');
  }

  // When modal opens (attribute changes), measure after content paints
  const dlg = document.getElementById('recordModal');
  if (dlg && !dlg.__hfdStickyObs){
    const obs = new MutationObserver((muts)=>{
      for (const m of muts){
        if (m.type === 'attributes' && m.attributeName === 'open' && dlg.hasAttribute('open')){
          requestAnimationFrame(setStickyVars);
          setTimeout(setStickyVars, 250); // catch async adjustments
        }
      }
    });
    obs.observe(dlg, { attributes: true, attributeFilter: ['open'] });
    dlg.__hfdStickyObs = obs;
  }

  // Keep values fresh on resize/rotation/zoom
  window.addEventListener('resize', setStickyVars, { passive: true });
})();


// === Precise sticky offsets (outer height, no tuck-under) — 2025-11-07 ===
(function(){
  'use strict';
  function outerH(el){
    if (!el) return 0;
    const r  = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const mt = parseFloat(cs.marginTop)||0, mb = parseFloat(cs.marginBottom)||0;
    const bt = parseFloat(cs.borderTopWidth)||0, bb = parseFloat(cs.borderBottomWidth)||0;
    return Math.ceil(r.height + mt + mb + bt + bb + 1); // +1 to avoid subpixel gaps
  }
  function setStickyVars(){
    const dlg  = document.getElementById('recordModal');
    if (!dlg) return;
    const head = dlg.querySelector('.modal-head');
    const nav  = dlg.querySelector('.section-nav');
    const headH = outerH(head) || 60;
    const navH  = outerH(nav)  || 40;
    document.documentElement.style.setProperty('--modal-head-h', headH + 'px');
    document.documentElement.style.setProperty('--section-nav-h',  navH + 'px');
  }

  const dlg = document.getElementById('recordModal');
  if (dlg && !dlg.__hfdStickyObs3){
    const obs = new MutationObserver((muts)=>{
      for (const m of muts){
        if (m.type === 'attributes' && m.attributeName === 'open' && dlg.hasAttribute('open')){
          // measure after paint and after async layout (fonts/images/buttons)
          requestAnimationFrame(setStickyVars);
          setTimeout(setStickyVars, 120);
          setTimeout(setStickyVars, 400);
        }
      }
    });
    obs.observe(dlg, { attributes: true, attributeFilter: ['open'] });
    dlg.__hfdStickyObs3 = obs;
  }
  window.addEventListener('resize', setStickyVars, { passive: true });
})();

