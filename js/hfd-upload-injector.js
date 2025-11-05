
(function(){
  if (window.__HFD_UPLOAD_INJECTOR__) return;
  window.__HFD_UPLOAD_INJECTOR__ = true;

  const modal = document.getElementById('recordModal');
  const content = document.getElementById('modalContent');
  if (!modal || !content) return;

  const SID_HEADER = 'Stable ID';
  const SID_LABEL  = 'Stable ID:';

  

  // === Upload wait overlay helpers ===
  function ensureWaitHost(){
    // place once inside the dialog so it covers the popup
    let host = modal.querySelector('.upload-wait');
    if (!host){
      host = document.createElement('div');
      host.className = 'upload-wait';
      host.innerHTML = '<div class="box"><div class="spinner"></div><div class="msg">Uploading photo…</div></div>';
      modal.appendChild(host);
    }
    return host;
  }
  function showWait(msg){
    const host = ensureWaitHost();
    const label = host.querySelector('.msg');
    if (label) label.textContent = msg || 'Uploading photo…';
    host.style.display = 'flex';
    return ()=>{ host.style.display = 'none'; };
  }
function editToken(){ try{ return sessionStorage.getItem('HFD_EDIT_TOKEN') || ''; }catch(_){ return ''; } }
  function getSID(){
    const r = window._currentRecord || {};
    const sid = r[SID_HEADER] || r[SID_LABEL];
    return sid ? String(sid).trim() : '';
  }

  async function postForm(obj){
    const url = (window.WEBAPP_URL || '');
    if (!url) throw new Error('WEBAPP_URL not set');
    const form = new URLSearchParams();
    Object.entries(obj).forEach(([k,v]) => form.set(k, v==null ? '' : String(v)));
    form.set('token', editToken());
    const res = await fetch(url, { method:'POST', body: form });
    const j = await res.json().catch(()=>({ok:false,error:'bad json'}));
    if (!res.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + res.status));
    return j;
  }

  
  // --- Helpers: strong SID and savefield with token retry ---
  function getStableIdStrong(){
    try{
      var r = window._currentRecord || {};
      var sid = (r['Stable ID'] || r['Stable ID:'] || '').toString().trim();
      if (!sid && typeof window.ensureSID === 'function') sid = String(window.ensureSID()||'').trim();
      if (!sid) sid = String(getSID()||'').trim();
      return sid || '';
    }catch(_){ return ''; }
  }

  async function saveFieldWithRetry(fieldName, value){
    let sid = getStableIdStrong();
    if (!sid) throw new Error('Missing Stable ID');
    async function tryOnce(){
      return await postForm({ fn:'savefield', stableId:sid, field:fieldName, value:value });
    }
    try {
      return await tryOnce();
    } catch(e){
      // refresh token and retry once
      try{
        if (typeof window.getEditToken === 'function') { await window.getEditToken(); }
      }catch(_){}
      return await tryOnce();
    }
  }

async function ensureRow(){
    const sid = (typeof ensureSID==='function' ? ensureSID() : getSID());
    if (!sid) throw new Error('Missing Stable ID');
    try{
      await postForm({ fn:'save', payload: JSON.stringify({ [SID_HEADER]:sid, [SID_LABEL]:sid }) });
    }catch(_){ /* ignore */ }
    return sid;
  }

  async function postMultipart(file, header){
    const url = (window.WEBAPP_URL || '');
    const fd = new FormData();
    fd.append('fn','upload');
    fd.append('field', header);
    fd.append('filename', file.name || 'photo.jpg');
    fd.append('token', editToken());
    fd.append('file', file, file.name || 'photo.jpg');
    const res = await fetch(url, { method:'POST', body: fd });
    const j = await res.json().catch(()=>({ok:false,error:'bad json'}));
    if (!res.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + res.status));
    return j;
  }

  async function postDataUrl(file, header){
    const dataUrl = await new Promise((ok, err)=>{
      const fr = new FileReader();
      fr.onerror = ()=>err(new Error('reader failed'));
      fr.onload  = ()=>ok(fr.result);
      fr.readAsDataURL(file);
    });
    return await postForm({ fn:'upload', field: header, filename: (file.name||''), dataUrl });
  }

  let queue = Promise.resolve();
  function enqueue(task){ queue = queue.then(task).catch(()=>{}); return queue; }

  function sectionFor(h){
    h = String(h||'').toLowerCase();
    if (/elev/.test(h)) return 'elevators';
    if (/fdc|alarm|sprinkler|riser|fire pump|fire/.test(h)) return 'fire';
    if (/water|hydrant|cistern/.test(h)) return 'water';
    if (/electric|panel|breaker|generator/.test(h)) return 'electric';
    if (/gas|propane/.test(h)) return 'gas';
    if (/hazmat|chemical|combustibles|flammable|tank/.test(h)) return 'hazmat';
    if (/roof/.test(h)) return 'other';
    return 'other';
  }

  function ensureBar(id){
    const sec = document.getElementById('section-'+id);
    if (!sec) return null;
    let bar = sec.querySelector('.per-section-uploads');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.className = 'per-section-uploads';
    const h3 = sec.querySelector('h3');
    if (h3 && h3.nextSibling) sec.insertBefore(bar, h3.nextSibling);
    else sec.prepend(bar);
    return bar;
  }

  // FIX: the spread syntax line was broken earlier. This version is correct.
  function photoHeaders(){
    const ks = [...content.querySelectorAll('.kv .k')]
      .map(el => (el.textContent || '').trim())
      .filter(Boolean)
      .filter(k => /photo/i.test(k));

    // If page has no explicit photo KV rows yet, seed with our known headers.
    if (ks.length) return ks;
    return [
      'Photo:',
      'Roof Access Photo:',
      'Alarm Photo:',
      'Elevator Shutoff Photo:',
      'Gas Shutoff Photo:',
      'Electrical Shutoff Photo:',
      'Water Shutoff Photo:',
      'Sprinkler Shutoff Photo:',
      'Fire Pump Photo:',
      'Tanks Photo:',
      'Combustibles Photo:',
      'Hazmat Photo:'
    
      ,'Alpha Photo:',
      'Bravo Photo:',
      'Charlie Photo:',
      'Delta Photo:'
    ];
  }

  function mount(){
    if (!modal.classList.contains('editing')) return; // only show in edit mode
    photoHeaders().forEach(header => {
      const bar = ensureBar(sectionFor(header));
      if (!bar) return;
      if (bar.querySelector('[data-hfd-upload="'+header+'"]')) return;

      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.type = 'button';
      btn.setAttribute('data-hfd-upload', header);
      btn.textContent = 'Upload: ' + header;

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = false;
      input.style.display = 'none';

      const wrap = document.createElement('span');
      wrap.className = 'upload-wrap';
      wrap.appendChild(btn);
      wrap.appendChild(input);
      bar.appendChild(wrap);
      // Hide button if field already has a value in current record
      (function initialHide(){
        try{
          const rec = window._currentRecord || {};
          const key = /:$/.test(header) ? header : (header + ':');
          const val = String(rec[key] || rec[header] || '').trim();
          wrap.hidden = !!val;
        }catch(_){}
      })();


      btn.addEventListener('click', () => input.click());
      input.addEventListener('change', () => {
        if (!input.files || !input.files.length) return;
        const sid = (typeof ensureSID==='function' ? ensureSID() : getSID());
        if (!sid){ alert('Please click Edit first.'); return; }
        const prev = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Uploading…';

        const hideWait = showWait('Uploading photo…');

        enqueue(async ()=>{
          const links = [];
          try{
            await ensureRow();
            for (const f of input.files){
              let out;
              try{ out = await postDataUrl(f, header); }
              catch(e1){ out = await postMultipart(f, header); }
              const link = out.link || out.url || (out.id ? ('https://drive.google.com/uc?export=view&id='+out.id) : '');
              if (link) links.push(link);
            }
          }catch(e){
            console.error(e);
            alert('Upload failed: ' + e.message);
            try{ hideWait(); }catch(_){}
          }finally{
            btn.disabled = false;
            btn.textContent = prev;
            input.value = '';
          }

          if (!links.length) { try{ hideWait(); }catch(_){ } return; }
          const rec  = window._currentRecord || {};
          const csv  = (links && links.length) ? links[0] : '';
          if (window._currentRecord) window._currentRecord[header] = csv;
          const fieldName = /:$/.test(header) ? header : (header + ':');
          await saveFieldWithRetry(fieldName, csv);
            
          // Optionally autosave the whole record if we already have a token
          try{
            var hasTok = false;
            try{ hasTok = !!sessionStorage.getItem('HFD_EDIT_TOKEN'); }catch(_){}
            if (hasTok && typeof window.hfdAutoSaveDraft === 'function'){
              await window.hfdAutoSaveDraft('photo-upload');
            }
          }catch(_){}
          // Immediately hide this upload control and notify listeners
          try{
            wrap.hidden = true;
            document.dispatchEvent(new CustomEvent('hfd:photo-changed', {
              detail: { field: fieldName, hasPhoto: true }
            }));
          }catch(_){}
hideWait();
        });
      });
    });
  }

  
  // Keep upload buttons in sync when photos change elsewhere (e.g., deletion)
  document.addEventListener('hfd:photo-changed', function(e){
    try{
      const f = e && e.detail && e.detail.field ? String(e.detail.field) : '';
      if (!f) return;
      const btn = modal.querySelector('[data-hfd-upload="' + f + '"]');
      if (!btn) return;
      const shell = btn.closest('.upload-wrap');
      if (!shell) return;
      shell.hidden = !!e.detail.hasPhoto;
    }catch(_){}
  });

// Mount on open / edit toggle
  const mo = new MutationObserver(()=>{
    if (modal.open && modal.classList.contains('editing')){
      mount();
      setTimeout(mount, 0);
      setTimeout(mount, 300);
    }
  });
  mo.observe(modal, { attributes:true, attributeFilter:['open','class'] });

  // Also try once per second while the modal is open (cheap safety net)
  setInterval(()=>{
    if (modal.open && modal.classList.contains('editing')) mount();
  }, 1000);
})();
