;(function(){
  // HFD Save-Field Patch (drop-in) — load this AFTER popup-edit.js
  // Purpose: avoid long JSONP URLs by saving only changed fields (fn=saveField).
  // Assumes the page defines:
  //   - window.WEBAPP_URL (string, .../exec)
  //   - window.getCurrentRecord() -> original row object (plus __isNew for new rows if available)
  //   - window.collectFromPopup() -> edited row object from the modal
  //   - window.saveViaJSONP(url, payload) -> existing JSONP full-row save (kept for initial create)
  //   - window.setEditable(flag) -> toggle edit mode off/on
  //
  // It replaces window.saveEdits with a safer version that:
  //   - For existing rows: sends only changed fields via fn=saveField JSONP (very short URLs)
  //   - For new rows: sends one compact full save (trim blanks), then reloads
  //
  // If any dependency is missing, it logs a warning and does not override.
  try{
    if (!window || typeof document === 'undefined') return;

    function warn(msg){ console.warn('[HFD savefield-patch]', msg); }
    function info(msg){ console.info('[HFD savefield-patch]', msg); }

    // Minimal JSONP helper for GET endpoints (Apps Script Web App)
    function jsonpCall(url, params){
      return new Promise((resolve, reject) => {
        const cbName = '__jsonp_'+Math.random().toString(36).slice(2);
        const s = document.createElement('script');
        const cleanup = () => { try{ delete window[cbName]; s.remove(); }catch(_){} };
        window[cbName] = (data) => { cleanup(); if (data && data.ok === false){ reject(new Error(data.error || 'error')); } else { resolve(data || {ok:true}); } };
        s.onerror = () => { cleanup(); reject(new TypeError('JSONP load failed')); };
        const qs = Object.entries(params||{}).map(([k,v]) => k+'='+encodeURIComponent(String(v)));
        s.src = String(url||'').replace(/\/$/,'') + '/exec?' + qs.join('&') + '&callback=' + encodeURIComponent(cbName);
        document.head.appendChild(s);
      });
    }

    function saveFieldJSONP(url, stableId, field, value){
      return jsonpCall(url, {
        fn: 'saveField',
        stableId: stableId,
        field: field,
        value: (value == null ? '' : String(value))
      });
    }

    function normKey(s){ return String(s||'').toLowerCase().trim(); }

    // Verify required globals exist
    const deps = [
      ['WEBAPP_URL',   ()=>typeof window.WEBAPP_URL === 'string' && window.WEBAPP_URL.indexOf('/exec')>0],
      ['getCurrentRecord', ()=>typeof window.getCurrentRecord === 'function'],
      ['collectFromPopup', ()=>typeof window.collectFromPopup === 'function'],
      ['saveViaJSONP', ()=>typeof window.saveViaJSONP === 'function'],
      ['setEditable', ()=>typeof window.setEditable === 'function']
    ];
    const missing = deps.filter(([name,ok]) => !ok());
    if (missing.length){
      warn('Not patching: missing deps: ' + missing.map(([n])=>n).join(', '));
      return;
    }

    async function patchedSaveEdits(){
      const WEBAPP_URL = window.WEBAPP_URL;
      if (!WEBAPP_URL){
        alert('Save is not configured (WEBAPP_URL empty).');
        return;
      }
      let original, edited;
      try{
        original = window.getCurrentRecord ? window.getCurrentRecord() : null;
        edited   = window.collectFromPopup ? window.collectFromPopup() : null;
      }catch(e){
        console.error('[HFD savefield-patch] collect error', e);
        alert('Could not collect field values. See console.');
        return;
      }

      if (!edited || typeof edited !== 'object'){
        alert('Nothing to save: edited record not found.');
        return;
      }

      // Find Stable ID column key
      const allKeys = new Set([...(original?Object.keys(original):[]), ...Object.keys(edited)]);
      let stableKey = null;
      for (const k of allKeys){
        if (normKey(k) === 'stable id'){ stableKey = k; break; }
      }
      const stableId = stableKey ? (original && original[stableKey] || edited[stableKey] || '') : '';

      try{
        // New row path: compact full save (trim blanks)
        if (!stableId || (original && original.__isNew)){
          const payload = {};
          for (const k of Object.keys(edited)){
            const v = edited[k];
            const sv = (v == null ? '' : String(v).trim());
            if (sv !== '') payload[k] = sv;
          }
          if (stableKey && !payload[stableKey]) payload[stableKey] = edited[stableKey] || '';
          info('Creating new row with compact payload keys=', Object.keys(payload));

          await window.saveViaJSONP(WEBAPP_URL, payload);
        } else {
          // Existing row path: field-diff and per-field save
          const changes = [];
          for (const k of allKeys){
            const before = (original && (k in original)) ? String(original[k] ?? '') : '';
            const after  = (edited  && (k in edited))  ? String(edited[k]  ?? '') : '';
            if (before !== after) changes.push([k, after]);
          }
          info('Saving changes via saveField:', changes.map(([k])=>k));

          for (const [k,v] of changes){
            await saveFieldJSONP(WEBAPP_URL, String(stableId), k, v);
          }
        }

        // Exit edit and refresh
        window.setEditable(false);
        setTimeout(()=>location.reload(), 250);
      }catch(e){
        console.error('[HFD savefield-patch] save failed', e);
        alert('Save failed. See console for details.');
      }
    }

    // Install patch
    const prev = window.saveEdits;
    window.saveEdits = patchedSaveEdits;
    info('Patched saveEdits() ' + (prev ? ' (previous version was replaced)' : '(new)'));

  }catch(e){
    console.error('[HFD savefield-patch] fatal', e);
  }
})();