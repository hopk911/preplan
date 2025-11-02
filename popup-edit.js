// popup-edit.js — robust Edit/Done toggle + JSONP save (CORS-free)
(function () {
  'use strict';

// Resolve a value from the current record by trying key variants
function __resolveValueFromRecord(keyBase){
  try{
    const rec = (window._currentRecord && typeof window._currentRecord==='object') ? window._currentRecord : null;
    if(!rec) return null;
    const variants = [
      keyBase,
      keyBase + ':',
      keyBase.replace(/\s+/g,' ').trim(),
      keyBase.replace(/\s+/g,' ').trim() + ':',
      keyBase.replace(/:$/,'').trim(),
      keyBase.replace(/:$/,'').trim() + ':'
    ];
    for (const v of variants){
      if (v in rec) return (rec[v] ?? '');
    }
    // Also try case-insensitive lookup
    const low = keyBase.toLowerCase().replace(/:$/,'');
    for (const k of Object.keys(rec)){
      if (String(k).toLowerCase().replace(/:$/,'') === low) return (rec[k] ?? '');
    }
    return null;
  }catch(_){ return null; }
}


  // ---- DOM hooks (match index.html) ----
  const modal   = document.getElementById('recordModal');
  const content = document.getElementById('modalContent');
  const btn     = document.getElementById('btnModalEdit');
  let __editObserverGuard = false;

// === Dropdown config (single source of truth) ===
const OCCUPANCY_OPTIONS = [
  'Apartment','Assembly','Ambulatory Health Care','Business','Day Care','Detention and Correctional','Educational','Factory/Industrial','Health Care','High Hazard','Institutional','Mercantile','Mixed Use','One and Two Family Dwelling','Residential Board and Care','Storage','Utility/Misc','Vacant', 'Other', 'Unknown'
];
const CONSTRUCTION_TYPE_OPTIONS = ['Type I (Fire Resistive)','Type II (Non-Combustible)','Type III (Ordinary)','Type IV (Heavy Timber)','Type V (Wood Frame)'];
const ROOF_TYPE_OPTIONS = ['Flat','Pitched','Arch','Metal','Membrane','Hip','Gable','Gambrel','Mansard','Other'];
const ELEVATOR_TYPE_OPTIONS = ['Hydraulic','Traction','Machine-Room-Less (MRL)','None','Unknown'];
const ALARM_TYPE_OPTIONS = ['Local','Central Station','Proprietary','Remote Supervising','None','Unknown'];

const FIELD_SELECTS = {
  'occupancy': OCCUPANCY_OPTIONS,
  'construction type': CONSTRUCTION_TYPE_OPTIONS,
  'roof type': ROOF_TYPE_OPTIONS,
  'elevator type': ELEVATOR_TYPE_OPTIONS,
  'alarm type': ALARM_TYPE_OPTIONS
};
// === End dropdown config ===

// --- Dropdown option sets ---






// Map normalized header -> options


  // Editable dropdown options
  


  if (!modal || !content || !btn) {
    console.warn('[popup-edit] Required elements not found. Aborting.');
    alert('Edit UI not initialized: required elements missing.');
    return;
  
    // allow DOM to settle, then re-enable observer
    setTimeout(() => { __editObserverGuard = false; }, 0);
  }

  const WEBAPP_URL  = (window && window.WEBAPP_URL)  || '';
  const EDIT_SECRET = (window && window.EDIT_SECRET) || '';

  // Fields that must not be editable
  const LOCKED_KEYS = ['stable id'];
  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const isLocked = label => LOCKED_KEYS.includes(norm(label));

  // Visual hint styles (once)
  (function injectStyleOnce(){
    if (document.getElementById('popup-edit-style')) return;
    const st = document.createElement('style');
    st.id = 'popup-edit-style';
    st.textContent = `
      .kv .v[contenteditable="true"]{outline:2px dashed #888;padding:2px;border-radius:6px}
      .modal-head #btnModalEdit.toggled{background:#111;color:#fff}
      .kv.locked .v{pointer-events:none;opacity:.8}
      .kv.locked .k::after{content:" (locked)";font-weight:400;opacity:.7}
    `;
    document.head.appendChild(st);
  })();

  let editing = false;

  function setEditable(on){

  __editObserverGuard = true;
  try {
    editing = !!on;
    modal.classList.toggle('editing', editing);
    btn.classList.toggle('toggled', editing);
    btn.textContent = editing ? 'Done' : 'Edit';

    const rows = content.querySelectorAll('.kv');
    rows.forEach(row => {
      const kEl = row.querySelector('.k');
      const vEl = row.querySelector('.v');
      if (!kEl || !vEl) return;

      const locked = isLocked(kEl.innerText);
      row.classList.toggle('locked', locked);

      // Normalize header (strip trailing colon, lower case)
      const keyText = (kEl.innerText || '').trim();
      const normKey = keyText.replace(/:\s*$/, '').trim();
      const normKeyLower = normKey.toLowerCase();

      if (editing && !locked){
        // If this field has a select defined, render select; else use contenteditable
        const opts = FIELD_SELECTS[normKeyLower];
        if (opts && !vEl.querySelector('select[data-editor]')){
          let current = (vEl.innerText||'').trim();
          const recVal = __resolveValueFromRecord(normKey);
          if (recVal != null && String(recVal).trim() !== '') current = String(recVal).trim();
          vEl.removeAttribute('contenteditable');
          const sel = document.createElement('select');
          sel.setAttribute('data-editor', normKeyLower);
sel.setAttribute('data-current', (current || ''));
          (function(){
      const blank = document.createElement('option');
      blank.value = ''; blank.textContent = ''; sel.appendChild(blank);
      (opts||[]).forEach(function(opt){
        const o = document.createElement('option');
        o.value = String(opt).trim();
        o.textContent = String(opt);
        sel.appendChild(o);
      });
      const cur = (current||'').trim();
      if (cur) {
        const curNorm = cur.toLowerCase();
        const hit = Array.from(sel.options).find(o => o.value.toLowerCase() === curNorm);
        if (hit) sel.value = hit.value; else {
          const extra = document.createElement('option'); extra.value = cur; extra.textContent = cur; sel.appendChild(extra); sel.value = cur;
        }
      } else {
        sel.value = '';
      }
    })();
          if (current) sel.value = current;
          vEl.textContent = '';
          vEl.appendChild(sel);
        } else {
          vEl.setAttribute('contenteditable','true');
        }
        if (!vEl.hasAttribute('data-original')) vEl.setAttribute('data-original', vEl.innerText);
      } else {
        // Leaving edit: collapse any selects to text
        const sel = vEl.querySelector('select[data-editor]');
        if (sel) { vEl.textContent = sel.value || ''; }
        vEl.removeAttribute('contenteditable');
      }
    });
  } finally {
    setTimeout(() => { __editObserverGuard = false; }, 0);
  }

}



  
function collectFromPopup(){
  const data = {};
  const rows = content.querySelectorAll('.kv');
  rows.forEach(row => {
    const k = (row.querySelector('.k')?.innerText || '').trim();
    if (!k) return;
    const vWrap = row.querySelector('.v');
    let v = '';
    if (vWrap){
      const sel = vWrap.querySelector('select[data-editor]');
      if (sel) v = sel.value; else v = (vWrap.innerText || '').trim();
    }
    data[k] = v;
  });
  return data;
}
  function getCurrentRecord(){
    // Prefer record exposed by the bundle when modal opens
    // (openModal in the bundle sets window._currentRecord when we patched it)
    const rec = (window._currentRecord && typeof window._currentRecord === 'object') ? window._currentRecord : null;
    if (rec) return rec;

    // Fallback: parse from the current popup
    const parsed = collectFromPopup();
    if (Object.keys(parsed).length) {
      console.warn('[popup-edit] window._currentRecord not set by bundle; using parsed modal data.');
      return parsed;
    }
    return {};
  }

  // ---- JSONP helper (CORS-free) ----
  function saveViaJSONP(url, payload){
    return new Promise((resolve, reject) => {
      const cbName = '__popupEditCB_' + Math.random().toString(36).slice(2);
      const s = document.createElement('script');

      const cleanup = () => { try { delete window[cbName]; s.remove(); } catch(e){} };

      window[cbName] = (data) => {
        cleanup();
        if (data && data.ok === false) reject(new Error(data.error || 'save error'));
        else resolve(data || { ok: true });
      };

      s.onerror = () => { cleanup(); reject(new TypeError('JSONP load failed')); };

      const qs = [
        'fn=save',
        'callback=' + encodeURIComponent(cbName),
        'payload='  + encodeURIComponent(JSON.stringify(payload))
      ];
      if (EDIT_SECRET) qs.push('secret=' + encodeURIComponent(EDIT_SECRET));
      s.src = url + '?' + qs.join('&');

      document.head.appendChild(s);
    });
  }

  async function saveEdits(){
    if (!WEBAPP_URL){
      alert('Save is not configured: WEBAPP_URL is empty.');
      return;
    }

    const original = getCurrentRecord();
    const edited   = collectFromPopup();

    // Merge and protect Stable ID (whatever the exact header casing is)
    let payload = Object.assign({}, original, edited);
    (function keepStableID(){
      const sKey = Object.keys(original||{}).find(k => norm(k) === 'stable id')
                  || Object.keys(edited||{}).find(k => norm(k) === 'stable id');
      if (sKey && original[sKey]) payload[sKey] = original[sKey];
    })();

    // UI feedback
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Saving…';

    try {
      const data = await saveViaJSONP(WEBAPP_URL, payload);
      console.log('[popup-edit] JSONP response:', data);
      try{ if(window && window._currentRecord) window._currentRecord.__saved = true; }catch(e){}

      setEditable(false);
      setTimeout(() => location.reload(), 250);
    } catch (e) {
      console.error('[popup-edit] save failed', e);
      alert('Save failed. See console for details.');
      btn.textContent = label;
    } finally {
      btn.disabled = false;
    }
  }

  // ---- Bind the Edit/Done button ----
  btn.addEventListener('click', () => {
    if (!editing) setEditable(true);
    else saveEdits();
  });
  try{ if (window && window._isNewDraft) setEditable(true); }catch(e){}

  // If modal content re-renders while editing, exit edit mode to avoid stale state
  const observer = new MutationObserver(() => { if (__editObserverGuard) return; if (editing) setEditable(false); });
  observer.observe(content, { childList: true });
})();

/* --- Post-process selects to keep blank defaults on empty values --- */
(function(){
  try{
    const content = document.getElementById('modalContent');
    if(!content) return;
    const ensureBlank = (root)=>{
      root.querySelectorAll('select[data-editor]').forEach(sel=>{
        // Ensure a leading blank option exists
        const hasBlank = [...sel /* FIXED: was .sel (typo), now handled above */.options].some(o => o.value === '');
        if(!hasBlank){
          const blank = document.createElement('option');
          blank.value = '';
          blank.textContent = '';
          sel.insertBefore(blank, sel.firstChild);
        }
        // If current field is empty/falsy, keep it blank
        const textValue = sel.getAttribute('data-current') || '';
        if(!textValue || textValue === '-' || textValue === '—' || textValue === 'N/A'){
          sel.value = '';
        }
      });
    };
    // Run on open and whenever content mutates (entering edit mode)
    ensureBlank(content);
    const mo = new MutationObserver(muts => muts.forEach(m => ensureBlank(content)));
    mo.observe(content, {childList:true, subtree:true});
  }catch(e){ console.warn('select blank-default patch failed', e); }
})();
