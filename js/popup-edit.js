// popup-edit.js — edit PW every time + clean reset + toolbar + edit-start/end events
(function () {
  'use strict';

  const modal     = document.getElementById('recordModal');
  const content   = document.getElementById('modalContent') || document.querySelector('#recordModal .modal-body') || document.getElementById('recordModal');
  const btn       = document.getElementById('btnModalEdit');
  const closeBtn  = document.getElementById('btnCloseModal') || document.getElementById('btnModalClose');
  if (!modal || !content || !btn) { console.warn('[popup-edit.js] missing DOM'); return; }

  // Move Edit & Close together in header toolbar (CSS controls layout)
  (function mountToolbar(){
    try{
      const header = document.querySelector('#recordModal .modal-head') || document.getElementById('recordModal');
      if (!header) return;
      let bar = header.querySelector('.modal-toolbar');
      if (!bar) { bar = document.createElement('div'); bar.className = 'modal-toolbar'; header.appendChild(bar); }
      if (btn && btn.parentElement !== bar) bar.appendChild(btn);
      if (closeBtn && closeBtn.parentElement !== bar) bar.appendChild(closeBtn);
    }catch(e){ console.warn('mountToolbar failed', e); }
  })();

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

  // JSONP for password (avoids CORS on GitHub Pages)
  async function getEditToken() {
    clearEditToken(); // force PW every time
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
    const z = n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}${z(d.getMonth()+1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}-${Math.floor(Math.random()*65536).toString(36).padStart(4,'0')}`;
  }
  function ensureSID(){
    const rec = window._currentRecord = (window._currentRecord && typeof window._currentRecord==='object') ? window._currentRecord : {};
    let sid = rec[SID_HEADER] || rec[SID_LABEL];
    if (!sid || !String(sid).trim()){
      sid = genSID();
      rec[SID_HEADER] = sid;
      rec[SID_LABEL]  = sid;
      try{
        const row = Array.from(content.querySelectorAll('.kv')).find(r => (r.querySelector('.k')?.innerText || '').trim().replace(/:$/,'') === SID_HEADER);
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
      if (on){
        const isKey = ((kEl.innerText||'').trim().replace(/:$/,'') === SID_HEADER);
        row.classList.toggle('locked', isKey);
        if (!isKey) vEl.setAttribute('contenteditable','true');
      } else {
        vEl.removeAttribute('contenteditable');
      }
    });
    // inform others (injector) about edit state changes
    modal.dispatchEvent(new CustomEvent(on ? 'hfd-edit-start' : 'hfd-edit-end', {bubbles:false}));
  }

  function collectFromPopup(){
    const data = {};
    content.querySelectorAll('.kv').forEach(row => {
      const k = (row.querySelector('.k')?.innerText || '').replace(/\u00a0/g,' ').trim();
      if (!k) return;
      const vWrap = row.querySelector('.v');
      const v = vWrap ? (vWrap.innerText || '').trim() : '';
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
      // announce end of edit (ensures injector cleans up)
      modal.dispatchEvent(new CustomEvent('hfd-edit-end', {bubbles:false}));
      clearEditToken();
      resetEditing();
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
      setEditable(true);   // emits hfd-edit-start
      return;
    }
    // Save path
    const original = (window._currentRecord && typeof window._currentRecord==='object') ? window._currentRecord : {};
    const edited   = collectFromPopup();
    const payload  = Object.assign({}, original, edited);
    const sid = ensureSID();
    payload[SID_HEADER] = sid;
    payload[SID_LABEL]  = sid;

    btn.disabled = true;
    try{
      await saveViaPost(payload);
      closeModal();        // clears token + emits hfd-edit-end + resets UI
      window.location.reload();
    }catch(e){
      console.error(e);
      alert('Save failed: ' + (e.message || e));
      setEditable(true);   // stay in edit
    }finally{
      btn.disabled = false;
    }
  });

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('close', closeModal);

  console.log('[popup-edit.js] ready. WEBAPP_URL:', WEBAPP_URL);
})();