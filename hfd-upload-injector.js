// hfd-upload-injector.updated.js
// Minimal, surgical updates on top of the original behavior:
//  - Buttons appear in their sections and ONLY in Edit mode.
//  - Uploads always send a dataUrl via form-encoded POST (no CORS preflight), plus the exact Sheet header in `field`.
//  - After a successful upload, the Drive link is written to the in-memory record AND saved to the Sheet via savefield.
//  - Modal lookup supports #recordModal or #popup-modal.
//
// Requirements:
//   window.WEBAPP_URL -> your Apps Script web app /exec
//   Sheet key header is "Stable ID" or "Stable ID:"
// ------------------------------------------------------------------
(function(){
  if (window.__HFD_UPLOAD_INJECTOR_UPDATED__) return;
  window.__HFD_UPLOAD_INJECTOR_UPDATED__ = true;

  // ===== exact sheet headers (with trailing colon) =====
  const PHOTO_HEADERS = {
    'Photo:':                    'section-fire',
    'Roof Access Photo:':        'section-roof',
    'Alarm Photo:':              'section-fire',
    'Elevator Shutoff Photo:':   'section-elevators',
    'Gas Shutoff Photo:':        'section-gas',
    'Electrical Shutoff Photo:': 'section-electric',
    'Water Shutoff Photo:':      'section-water',
    'Sprinkler Shutoff Photo:':  'section-water',
    'Fire Pump Photo:':          'section-fire',
    'Tanks Photo:':              'section-hazmat',
    'Combustibles Photo:':       'section-hazmat',
    'Hazmat Photo:':             'section-hazmat'
  };

  // --- Helpers ---
  const getModal = () => document.getElementById('recordModal') || document.getElementById('popup-modal');
  const isEditing = (m) => !!(m && m.classList.contains('editing'));

  function ensureBar(sectionEl){
    if (!sectionEl) return null;
    let bar = sectionEl.querySelector('.per-section-uploads');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.className = 'per-section-uploads';
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 10px;';
    // below section header if present
    const h = sectionEl.querySelector('h2,h3,h4');
    if (h && h.nextSibling) sectionEl.insertBefore(bar, h.nextSibling);
    else sectionEl.prepend(bar);
    return bar;
  }

  // Send URL-ENCODED form (no custom headers → no preflight)
  async function postForm(bodyObj){
    if (!window.WEBAPP_URL) throw new Error('WEBAPP_URL is not set');
    const form = new URLSearchParams();
    for (const [k,v] of Object.entries(bodyObj)) form.set(k, v == null ? '' : String(v));
    const res = await fetch(window.WEBAPP_URL, { method: 'POST', body: form });
    let json = {};
    try { json = await res.json(); } catch(e) { throw new Error('Failed to fetch'); }
    if (!res.ok || !json || json.ok === false) throw new Error(String(json.error || ('HTTP '+res.status)));
    return json;
  }

  // iOS-safe: read as data URL and send as form-encoded
  async function uploadOneFileToDrive(file, fieldHeader){
    const dataUrl = await new Promise((resolve, reject)=>{
      const fr = new FileReader();
      fr.onerror = ()=> reject(new Error('reader failed'));
      fr.onload  = ()=> resolve(fr.result);
      fr.readAsDataURL(file);
    });
    return await postForm({ fn:'upload', field: fieldHeader, filename: file.name || '', dataUrl });
  }

  // Immediately persist link to the sheet
  async function writeLinkToSheet(stableId, header, driveLink){
    if (!stableId || !header || !driveLink) return;
    await postForm({ fn:'savefield', stableId: String(stableId), field: header, value: driveLink });
  }

  function mountButtons(){
    const modal = getModal();
    if (!modal || !isEditing(modal)) return;

    Object.keys(PHOTO_HEADERS).forEach(header => {
      const sectionId = PHOTO_HEADERS[header];
      const sectionEl = document.getElementById(sectionId);
      if (!sectionEl) return;
      const bar = ensureBar(sectionEl);
      if (!bar) return;
      if (bar.querySelector('[data-hfd-upload="'+header+'"]')) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = 'Upload: ' + header.replace(':','');
      btn.setAttribute('data-hfd-upload', header);

      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';

      const wrap = document.createElement('span');
      wrap.style.cssText = 'display:inline-flex;gap:6px;align-items:center;';
      wrap.appendChild(btn); wrap.appendChild(inp);
      bar.appendChild(wrap);

      btn.addEventListener('click', ()=> inp.click());
      inp.addEventListener('change', async ()=>{
        if (!inp.files || !inp.files.length) return;
        const prev = btn.textContent; btn.disabled = true; btn.textContent = 'Uploading…';
        try{
          const out = await uploadOneFileToDrive(inp.files[0], header);
          const driveLink = out.link || out.url || (out.id ? ('https://drive.google.com/uc?export=view&id='+out.id) : '');

          // update the in-memory record for this popup
          window._currentRecord = window._currentRecord || {};
          window._currentRecord[header] = driveLink;

          // best-effort immediate persist
          const sid = (window._currentRecord['Stable ID'] || window._currentRecord['Stable ID:'] || '').toString().trim();
          if (sid && driveLink) {
            try { await writeLinkToSheet(sid, header, driveLink); } catch(e){ console.warn('savefield failed:', e); }
          }
          alert('Uploaded ✔');
        }catch(e){
          console.error(e);
          alert('Upload failed: ' + e.message);
        }finally{
          btn.disabled = false; btn.textContent = prev; inp.value='';
        }
      });
    });
  }

  // Observe modal open/edit toggles & content changes
  const modal = getModal();
  if (modal){
    const mo = new MutationObserver(()=> mountButtons());
    mo.observe(modal, { attributes:true, childList:true, subtree:true });
  }
  setInterval(()=>{ const m=getModal(); if (m && isEditing(m)) mountButtons(); }, 800);
})();