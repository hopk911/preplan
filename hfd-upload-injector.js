// hfd-upload-injector.js (JSON dataUrl upload – minimal patch + immediate sheet write)
// Based on your original injector; only the upload path changed to always send {fn:"upload", dataUrl, filename, field}
// and we immediately persist the Drive link(s) to the Sheet via fn=savefield after a successful upload.
// Place AFTER popup-edit.js. Requires window.WEBAPP_URL to point at your Apps Script Web App.

(function(){
  if (window.__HFD_UPLOAD_INJECTOR__) return;
  window.__HFD_UPLOAD_INJECTOR__ = true;

  // ===== CONFIG: Drive folders by sheet header (headers include trailing colon) =====
  const PHOTO_UPLOAD_FOLDERS = {
    'Photo:':                    '1a-g1z9wQmo5wSr8oIidoLg2wLt4BTwxO',
    'Roof Access Photo:':        '1tlRVFlcBoWSG7jhs9uScwO93yE2qLccw',
    'Alarm Photo:':              '1lAEJdYGwhPbAIUToHRnGvoz8X4hOJqOb',
    'Elevator Shutoff Photo:':   '1eUFsCFkjbpzSnoUf2DK_lyMQyt3vG8Q3',
    'Gas Shutoff Photo:':        '1grghRBy6VsryKhWephqeuJs_Uixq-sJE',
    'Electrical Shutoff Photo:': '1YlVxc0h6dj0wp5oCeV-0aB8sWGtO_vfm',
    'Water Shutoff Photo:':      '1zGqySR-Sks_YpDCj-C4lnhPM595TWivg',
    'Sprinkler Shutoff Photo:':  '1p7aFq3gviIN4Bh8S7iQm-eDS6HaDNmK_',
    'Fire Pump Photo:':          '1KKfbSQdha4NiKSQlNRTigUZPypE7RKNN',
    'Tanks Photo:':              '1p2kmKIzyB_8PKwM8sqhAK9W6P75f5bQS',
    'Combustibles Photo:':       '1-bvhTaL0en9zNsC8ZaLR6kdFWD5xw0ty',
    'Hazmat Photo:':             '1eq2NtwoCga_o8s-A6Tc_QagCB2G-e2pQ'
  };

  const modal = document.getElementById('recordModal');

  function appendPreviews(header, links){
    try{
      const secId = sectionForField(header);
      if (secId === 'other') return; // skip “Other” section
      const secEl = document.getElementById('section-' + secId);
      if (!secEl) return;
      let grid = secEl.querySelector('.thumb-grid');
      if (!grid){
        grid = document.createElement('div');
        grid.className = 'thumb-grid';
        secEl.appendChild(grid);
      }
      links.forEach(u=>{
        let html = '';
        try{
          if (typeof window.buildImgWithFallback === 'function'){
            html = window.buildImgWithFallback(u, '', 300);
          } else {
            const id = (String(u).match(/[?&]id=([\w-]{10,})/)||String(u).match(/\/d\/([\w-]{10,})/))?.[1] || '';
            const url = id ? ('https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w300') : String(u);
            html = '<img src="'+url+'" class="thumb" loading="lazy" alt="photo">';
          }
        }catch(e){ html=''; }
        if (html){
          const tmp = document.createElement('div'); tmp.innerHTML = html;
          const img = tmp.firstChild;
          grid.appendChild(img);
          try{ if (window.loadThumbsWithin) window.loadThumbsWithin(grid); }catch(e){}
        }
      });
    }catch(e){}
  }

  function sectionForField(label){
    const L = String(label||'').toLowerCase();
    if (/(^|\b)(elevators?|elevator (bank|key|room)|lift|elev\b)/.test(L)) return 'elevators';
    if (/^(alarm|pull|fdc|standpipe|riser|sprinkler|fire pump)/.test(L)) return 'fire';
    if (/(water|hydrant|cistern|sprinkler)/.test(L)) return 'water';
    if ((/electric|electrical|panel|breaker|generator/).test(L)) return 'electric';
    if (/(gas|propane)/.test(L)) return 'gas';
    if (/(hazmat|chemical|combustible|flammable|tank)/.test(L)) return 'hazmat';
    return 'other';
  }

  // Keep photos in save payload
  function mergePhotoFieldsIntoPayload(payload) {
    try {
      const rec = (window && window._currentRecord) ? window._currentRecord : {};
      if (!rec) return payload;
      Object.keys(PHOTO_UPLOAD_FOLDERS).forEach(header => {
        const val = (rec[header] || '').trim();
        if (!val) return;
        payload[header] = val;
        if (!header.endsWith(':')) payload[header + ':'] = val;
      });
    } catch (e) { console.warn('mergePhotoFieldsIntoPayload skipped:', e); }
    return payload;
  }

  (function patchSavers(){
    try {
      const oldCollect = window.collectFromPopup;
      if (typeof oldCollect === 'function') {
        window.collectFromPopup = function(){
          const payload = oldCollect.apply(this, arguments);
          return mergePhotoFieldsIntoPayload(payload);
        };
      }
    } catch (e) {}
    try {
      const oldSave = window.saveEdits;
      if (typeof oldSave === 'function') {
        window.saveEdits = async function(){
          return await oldSave.apply(this, arguments);
        };
      }
    } catch (e) {}
  })();

  // === Upload: ALWAYS send dataUrl via form-encoded POST (no preflight) ===
  async function uploadOneFileToDrive(file, fieldHeader){
    if (!window.WEBAPP_URL) throw new Error('WEBAPP_URL is not set');

    // read the file as a data URL (iOS/Safari-safe)
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('reader failed'));
      fr.onload  = () => resolve(fr.result);
      fr.readAsDataURL(file);
    });

    // send as a simple form post (no headers) to avoid CORS preflight
    const form = new URLSearchParams();
    form.set('fn', 'upload');
    form.set('field', fieldHeader);     // exact sheet header, e.g., "Alarm Photo:"
    form.set('filename', file.name || '');
    form.set('dataUrl', dataUrl);       // "data:image/jpeg;base64,...."

    const res = await fetch(window.WEBAPP_URL, { method: 'POST', body: form });
    let json;
    try { json = await res.json(); } catch (_) { throw new Error('Failed to fetch'); }
    if (!res.ok || !json || json.ok === false) {
      throw new Error(String((json && json.error) || ('HTTP ' + res.status)));
    }
    return json; // { ok:true, id, url|link }
  }

  // Write one cell to the Sheet without CORS preflight.
  // Requires your Code.gs to handle fn=savefield (field must match header in the Sheet).
  async function writeLinkToSheet(stableId, header, driveLink) {
    if (!window.WEBAPP_URL) throw new Error('WEBAPP_URL is not set');
    if (!stableId || !header || !driveLink) return;

    const form = new URLSearchParams();
    form.set('fn', 'savefield');
    form.set('stableId', String(stableId));
    form.set('field', header);        // MUST match the Sheet header exactly (e.g., "Alarm Photo:")
    form.set('value', driveLink);

    const res = await fetch(window.WEBAPP_URL, { method: 'POST', body: form });
    let j = {};
    try { j = await res.json(); } catch (_) {}
    if (!res.ok || j.ok === false) {
      throw new Error((j && j.error) || ('HTTP ' + res.status));
    }
  }

  function ensureSectionHeaderControls(sectionEl){
    if (!sectionEl) return null;
    let bar = sectionEl.querySelector('.per-section-uploads');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.className = 'per-section-uploads';
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 10px;';
    const h3 = sectionEl.querySelector('h3');
    if (h3 && h3.nextSibling) sectionEl.insertBefore(bar, h3.nextSibling);
    else sectionEl.prepend(bar);
    return bar;
  }

  function mountButtons(){
    if (!modal || !modal.classList.contains('editing')) return;
    const rec = (window && window._currentRecord) ? window._currentRecord : {};
    Object.keys(PHOTO_UPLOAD_FOLDERS).forEach(header => {
      const secId = sectionForField(header);
      const secEl = document.getElementById('section-' + secId);
      if (!secEl) return;
      const bar = ensureSectionHeaderControls(secEl);
      if (!bar) return;
      if (bar.querySelector('[data-hfd-upload="'+header+'"]')) return;

      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.type = 'button';
      btn.setAttribute('data-hfd-upload', header);
      btn.textContent = 'Upload: ' + header;

      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.multiple = true;
      inp.style.display = 'none';

      const wrap = document.createElement('span');
      wrap.style.cssText = 'display:inline-flex;gap:6px;align-items:center;';
      wrap.appendChild(btn); wrap.appendChild(inp);
      bar.appendChild(wrap);

      btn.addEventListener('click', ()=> inp.click());
      inp.addEventListener('change', async ()=>{
        if (!inp.files || !inp.files.length) return;
        const prev = btn.textContent; btn.disabled = true; btn.textContent = 'Uploading…';
        const links = [];
        try{
          for (const f of inp.files){
            const out = await uploadOneFileToDrive(f, header);
            const link = out.link || out.url || (out.id ? ('https://drive.google.com/uc?export=view&id=' + out.id) : '');
            if (link) links.push(link);
          }
        }catch(e){
          console.error(e); alert('Upload failed: ' + e.message);
        }finally{
          btn.disabled = false; btn.textContent = prev; inp.value='';
        }
        if (!links.length) return;
        // Update in-memory record for save
        try{
          const base = (rec && rec[header]) ? String(rec[header]).trim() : '';
          const csv = [base, links.join(', ')].filter(Boolean).join(', ');
          if (window._currentRecord) window._currentRecord[header] = csv;
          appendPreviews(header, links);

          // Immediately write to the sheet as well (best effort)
          const sid = (window._currentRecord['Stable ID'] || window._currentRecord['Stable ID:'] || '').toString().trim();
          if (sid && csv){
            try { await writeLinkToSheet(sid, header, csv); } catch(e){ console.warn('savefield failed', e); }
          }
        }catch(e){}
      });
    });
  }

  // Re-mount buttons whenever the modal switches to edit mode
  if (modal){
    const mo = new MutationObserver(()=>{
      if (modal.classList.contains('editing')) mountButtons();
    });
    mo.observe(modal, { attributes:true, attributeFilter:['class'] });
  }
  // Also poll for robustness (some flows delay section rendering)
  setInterval(()=>{
    if (modal && modal.open && modal.classList.contains('editing')) mountButtons();
  }, 800);
})();

/* === SAVE SHIM: reliable, CORS-safe save for edited fields === */
(function(){
  if (window.__HFD_SAVE_SHIM__) return;
  window.__HFD_SAVE_SHIM__ = true;

  // Use your injector's getModal if present; otherwise a simple fallback:
  const getModal = () => document.getElementById('recordModal') || document.getElementById('popup-modal');

  // CORS-safe POST (no custom headers)
  async function postForm(obj){
    if (!window.WEBAPP_URL) throw new Error('WEBAPP_URL is not set');
    const form = new URLSearchParams();
    for (const [k,v] of Object.entries(obj)) form.set(k, v == null ? '' : String(v));
    const res = await fetch(window.WEBAPP_URL, { method: 'POST', body: form });
    let json = {};
    try { json = await res.json(); } catch(_){ throw new Error('Failed to fetch'); }
    if (!res.ok || json.ok === false) throw new Error(String(json.error || ('HTTP '+res.status)));
    return json;
  }

  // Fallback collector (in case the page’s collectFromPopup misses any edited fields)
  function collectFromPopupShim(){
    const modal = getModal();
    const payload = {};
    if (!modal) return payload;

    // read all .kv rows: header in .k, value in .v or an input/select/textarea
    modal.querySelectorAll('.kv').forEach(row=>{
      const kEl = row.querySelector('.k');
      const vEl = row.querySelector('.v');
      if (!kEl || !vEl) return;

      let header = (kEl.textContent || '').replace(/\u00a0/g,' ').trim();
      if (!/:$/.test(header)) header += ':';                  // enforce trailing colon to match Sheet headers

      let value = '';
      const field = vEl.querySelector('input,select,textarea');
      if (field) {
        if (field.tagName === 'SELECT') value = field.value;
        else if (field.type === 'checkbox') value = field.checked ? 'Yes' : 'No';
        else value = field.value || '';
      } else {
        value = (vEl.textContent || '').trim();
      }
      payload[header] = value;
    });

    // ensure Stable ID present (row key)
    const sid = (window._currentRecord && (window._currentRecord['Stable ID'] || window._currentRecord['Stable ID:'])) || '';
    if (sid && !payload['Stable ID'] && !payload['Stable ID:']) payload['Stable ID'] = String(sid);

    // merge photo links from memory (so photos persist even if fields are hidden)
    if (window._currentRecord) {
      Object.keys(window._currentRecord).forEach(h=>{
        if (/:$/.test(h) && window._currentRecord[h]) payload[h] = window._currentRecord[h];
      });
    }
    return payload;
  }

  // Wrap the page’s save; send a form-encoded fn=save with full payload
  (function patchSave(){
    const oldSave = window.saveEdits;
    window.saveEdits = async function(){
      try{
        const payload = (typeof window.collectFromPopup === 'function')
          ? window.collectFromPopup()
          : collectFromPopupShim();

        // if both "Stable ID" and "Stable ID:" exist, keep one canonical key
        if (payload['Stable ID:'] && !payload['Stable ID']) payload['Stable ID'] = payload['Stable ID:'];

        // send to Apps Script as form-encoded — no preflight from file://
        await postForm({ fn: 'save', payload: JSON.stringify(payload) });
        alert('Saved ✔');
      }catch(e){
        console.error(e);
        alert('Save failed: ' + e.message);
        throw e;
      }finally{
        // preserve original behavior if the page expects it
        if (typeof oldSave === 'function') {
          try { return oldSave.apply(this, arguments); } catch(_) {}
        }
      }
    };
  })();
})();
