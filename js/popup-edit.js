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

  async function getEditToken() {
    clearEditToken();
    if (!window.WEBAPP_URL) { alert('WEBAPP_URL is not set'); throw new Error('No WEBAPP_URL'); }

    const pw = window.prompt('Enter edit password:');
    if (!pw) throw new Error('Password required');

    function jsonp(url){
      return new Promise((resolve, reject) => {
        const cb = '__hfd_cb_' + Math.random().toString(36).slice(2);
        window[cb] = (data) => { try{ delete window[cb]; }catch(_){}; s.remove(); resolve(data); };
        const s = document.createElement('script');
        s.onerror = () => { try{ delete window[cb]; }catch(_){}; s.remove(); reject(new Error('JSONP failed')); };
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
