;/* ==== HFD Pre‑Plan – consolidated app.bundle.js (edit+save fixed) ====
   Drop-in replacement for your current app.bundle.js. No extra patch files needed.

   Highlights:
   - Robust collectors (getCurrentRecord, collectFromPopup) for .kv rows and form controls.
   - Compact, safe JSONP saves:
       • Existing row: per‑field fn=saveField (tiny URLs; reliable on iPad/mobile).
       • New row: single trimmed fn=save (compact payload).
   - setEditable(flag) toggles UI and enables inputs in edit mode.
   - WEBAPP_URL bootstrap from ?webapp=.../exec (persisted in localStorage).

   Assumptions:
   - Modal/popup contains rows in the form: <div class="kv"><div class="k">Label:</div><div class="v">...</div></div>
   - Keys match Sheet headers (trailing ":" allowed in UI; handled automatically).
   - There's a Stable ID column in the Sheet (exact header "Stable ID").
*/

(function(){
  'use strict';

  // =========================
  // Config + URL bootstrap
  // =========================
  const LS_KEY = 'HFD_WEBAPP_URL';
  const q = new URLSearchParams(location.search);
  if (q.get('webapp')){
    try { localStorage.setItem(LS_KEY, q.get('webapp')); } catch(_){}
  }
  if (typeof window.WEBAPP_URL !== 'string' || !/script\.google\.com\/.*\/exec/.test(window.WEBAPP_URL||'')){
    window.WEBAPP_URL = (localStorage.getItem(LS_KEY)||'').trim();
  }
  if (!/script\.google\.com\/.*\/exec/.test(window.WEBAPP_URL||'')){
    console.warn('[HFD] WEBAPP_URL is not set. Set once with ?webapp=https://script.google.com/.../exec');
  } else {
    console.info('[HFD] JSONP rows build is active');
  }

  // =========================
  // DOM helpers
  // =========================
  function $(sel, root){ return (root||document).querySelector(sel); }
  function $all(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }
  function findPopupRoot(){
    return $('.popup.open') || $('.modal.open') || $('#popup') || $('[data-popup="record"]') || $('.popup') || $('.modal') || document.body;
  }
  function cleanKey(txt){ return String(txt||'').replace(/\s*:\s*$/,'').trim(); }
  function normKey(txt){ return cleanKey(txt).toLowerCase(); }

  // =========================
  // Record collectors
  // =========================
  // Get the record displayed when the popup opened (authoritative if provided).
  // We allow integrators to attach data-json to popup via data-record attr.
  function getCurrentRecord(){
    const root = findPopupRoot();
    const dataAttr = root && (root.getAttribute('data-record') || (root.dataset && root.dataset.record));
    if (dataAttr){
      try { return JSON.parse(dataAttr); } catch(_) {}
    }
    // Fallback: scrape current visible values
    const val = collectFromPopup();
    if (!Object.keys(val).some(k => normKey(k)==='stable id')) val.__isNew = true;
    return val;
  }

  // Scrape current values from popup UI (edit or read mode)
  function collectFromPopup(){
    const root = findPopupRoot();
    const out = {};

    // Preferred: .kv rows
    const rows = $all('.kv, .row.kv, .kv-row, .field-row', root);
    if (rows.length){
      rows.forEach(row=>{
        const kEl = row.querySelector('.k, .key, .label, label');
        const vEl = row.querySelector('.v, .value, .field, .control') || row;
        if (!kEl) return;
        const key = cleanKey(kEl.textContent || kEl.getAttribute('data-key') || '');
        if (!key) return;

        let val = '';
        const input = vEl.querySelector('input, textarea, select');
        if (input){
          if (input.tagName === 'SELECT'){
            val = input.value;
          } else if (input.type === 'checkbox'){
            val = input.checked ? 'TRUE' : 'FALSE';
          } else {
            val = input.value;
          }
        } else {
          val = (vEl.textContent || '').trim();
        }
        out[key] = val;
      });
      return out;
    }

    // Fallback: generic named controls
    const ctrls = $all('input[name], textarea[name], select[name]', root);
    ctrls.forEach(el=>{
      const k = cleanKey(el.name || el.id || '');
      const v = (el.type==='checkbox') ? (el.checked ? 'TRUE' : 'FALSE') : el.value;
      if (k) out[k] = v;
    });
    return out;
  }

  // Expose for other modules (if any)
  window.getCurrentRecord = getCurrentRecord;
  window.collectFromPopup = collectFromPopup;

  // =========================
  // Edit mode toggling
  // =========================
  function setEditable(flag){
    const root = findPopupRoot();
    if (!root) return;
    root.classList.toggle('editing', !!flag);
    // Enable/disable controls
    $all('input, textarea, select', root).forEach(el=>{
      if (flag){
        el.removeAttribute('disabled');
        el.removeAttribute('readonly');
        // Add a subtle edit style hint
        el.style.outline = '1px solid rgba(0,0,0,0.15)';
        el.style.background = 'rgba(255,255,255,0.9)';
      } else {
        el.setAttribute('readonly','readonly');
        el.style.outline = '';
        el.style.background = '';
      }
    });
  }
  window.setEditable = setEditable;

  // =========================
  // JSONP utilities
  // =========================
  function jsonp(url, params){
    return new Promise((resolve, reject) => {
      if (!url) { reject(new Error('WEBAPP_URL missing')); return; }
      const cbName = '__jsonp_'+Math.random().toString(36).slice(2);
      const s = document.createElement('script');
      const cleanup = () => { try{ delete window[cbName]; s.remove(); }catch(_){ } };
      window[cbName] = (data) => { cleanup(); if (data && data.ok===false) reject(new Error(data.error||'error')); else resolve(data||{ok:true}); };
      s.onerror = () => { cleanup(); reject(new TypeError('JSONP load failed')); };
      const qs = Object.entries(params||{}).map(([k,v]) => k+'='+encodeURIComponent(String(v)));
      s.src = String(url).replace(/\/$/,'') + '/exec?' + qs.join('&') + '&callback=' + encodeURIComponent(cbName);
      document.head.appendChild(s);
    });
  }

  // Full-row JSONP save (kept for new-row compact create)
  function saveViaJSONP(url, payload){
    return jsonp(url, { fn: 'save', payload: JSON.stringify(payload||{}) });
  }
  window.saveViaJSONP = saveViaJSONP;

  // Per-field JSONP save
  function saveFieldJSONP(url, stableId, field, value){
    return jsonp(url, { fn: 'saveField', stableId: stableId, field: field, value: (value==null? '' : String(value)) });
  }

  // =========================
  // Save flow (no patches required)
  // =========================
  async function saveEdits(){
    const WEBAPP_URL = window.WEBAPP_URL;
    if (!/script\.google\.com\/.*\/exec/.test(WEBAPP_URL||'')){
      alert('Save is not configured: WEBAPP_URL is empty or invalid.');
      return;
    }
    const original = getCurrentRecord() || {};
    const edited   = collectFromPopup() || {};

    // Locate Stable ID key
    const allKeys = new Set([ ...Object.keys(original), ...Object.keys(edited) ]);
    let stableKey = null;
    for (const k of allKeys){ if (normKey(k) === 'stable id'){ stableKey = k; break; } }
    const stableId = stableKey ? (original[stableKey] || edited[stableKey] || '') : '';

    const saveBtn = $('[data-action="save"], .btn.save, #btnSave', findPopupRoot()) || { disabled:false, textContent:'' };
    const prevText = saveBtn.textContent;
    saveBtn.disabled = true;
    if (prevText) saveBtn.textContent = 'Saving…';

    try{
      if (!stableId || original.__isNew){
        // New row: compact payload (trim blanks to keep URL short)
        const payload = {};
        Object.keys(edited).forEach(k => {
          const v = edited[k];
          const sv = (v==null ? '' : String(v).trim());
          if (sv !== '') payload[k] = sv;
        });
        if (stableKey && !payload[stableKey]) payload[stableKey] = edited[stableKey] || '';
        console.info('[HFD] Creating new row with keys:', Object.keys(payload));
        await saveViaJSONP(WEBAPP_URL, payload);
      } else {
        // Existing row: diff + per-field save
        const changes = [];
        for (const k of allKeys){
          const before = (k in original) ? String(original[k] ?? '') : '';
          const after  = (k in edited)  ? String(edited[k]  ?? '') : '';
          if (before !== after) changes.push([k, after]);
        }
        if (!changes.length){
          console.info('[HFD] No changes detected.');
        } else {
          console.info('[HFD] Saving changes:', changes.map(([k])=>k));
          for (const [k,v] of changes){
            await saveFieldJSONP(WEBAPP_URL, String(stableId), k, v);
          }
        }
      }
      // Exit edit and refresh table view
      setEditable(false);
      setTimeout(()=>location.reload(), 250);
    } catch (e){
      console.error('[HFD] Save failed', e);
      alert('Save failed. See console for details.');
    } finally {
      saveBtn.disabled = false;
      if (prevText) saveBtn.textContent = prevText;
    }
  }
  window.saveEdits = saveEdits;

  // =========================
  // Optional: wire default buttons if present
  // =========================
  function wireButtons(){
    const root = findPopupRoot();
    const editBtn = $('[data-action="edit"], .btn.edit, #btnEdit', root);
    const saveBtn = $('[data-action="save"], .btn.save, #btnSave', root);
    const closeBtn= $('[data-action="close"], .btn.close, #btnClose', root);
    if (editBtn && !editBtn.__wired){
      editBtn.addEventListener('click', ()=> setEditable(true));
      editBtn.__wired = true;
    }
    if (saveBtn && !saveBtn.__wired){
      saveBtn.addEventListener('click', ()=> saveEdits());
      saveBtn.__wired = true;
    }
    if (closeBtn && !closeBtn.__wired){
      closeBtn.addEventListener('click', ()=> setEditable(false));
      closeBtn.__wired = true;
    }
  }
  // Attempt to wire now & after DOM changes
  document.addEventListener('DOMContentLoaded', wireButtons);
  const mo = new MutationObserver(()=> wireButtons());
  mo.observe(document.documentElement, {subtree:true, childList:true});

})();