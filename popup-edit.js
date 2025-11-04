
// popup-edit.js — ensure one Stable ID for new records; Save label; POST save; close+reload
(function () {
  'use strict';

  const modal   = document.getElementById('recordModal');
  const content = document.getElementById('modalContent');
  const btn     = document.getElementById('btnModalEdit');
  if (!modal || !content || !btn) { console.warn('[popup-edit.js] missing DOM'); return; }

  const WEBAPP_URL  = (window && window.WEBAPP_URL)  || '';
  const norm = s => String(s || '').toLowerCase().replace(/\s+/g,' ').replace(/:$/,'').trim();
  const SID_HEADER = 'Stable ID';           // without colon for sheet key
  const SID_LABEL  = 'Stable ID:';          // with colon for UI map

  function genSID(){
    const d = new Date();
    const z = n=>String(n).padStart(2,'0');
    const y = d.getFullYear();
    const m = z(d.getMonth()+1);
    const day = z(d.getDate());
    const h = z(d.getHours());
    const mm = z(d.getMinutes());
    const s = z(d.getSeconds());
    const r = Math.floor(Math.random()*65536).toString(36).padStart(4,'0');
    return `${y}${m}${day}-${h}${mm}${s}-${r}`;
  }

  function ensureSID(){
    const rec = window._currentRecord = (window._currentRecord && typeof window._currentRecord==='object') ? window._currentRecord : {};
    let sid = rec[SID_HEADER] || rec[SID_LABEL];
    if (!sid || !String(sid).trim()){
      sid = genSID();
      rec[SID_HEADER] = sid;
      rec[SID_LABEL]  = sid;
      try{
        const sidRow = Array.from(content.querySelectorAll('.kv')).find(row => (row.querySelector('.k')?.innerText || '').trim().replace(/:$/,'') === SID_HEADER);
        if (sidRow){
          const v = sidRow.querySelector('.v'); if (v) v.textContent = sid;
        }
      }catch(_){}
    }
    return sid;
  }

  function setEditable(on){
    modal.classList.toggle('editing', !!on);
    btn.classList.toggle('toggled', !!on);
    btn.textContent = on ? 'Save' : 'Edit';
    const rows = content.querySelectorAll('.kv');
    rows.forEach(row => {
      const kEl = row.querySelector('.k');
      const vEl = row.querySelector('.v');
      if (!kEl || !vEl) return;
      if (on){
        const locked = norm(kEl.innerText) === 'stable id';
        row.classList.toggle('locked', locked);
        if (!locked) vEl.setAttribute('contenteditable','true');
      } else {
        vEl.removeAttribute('contenteditable');
      }
    });
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
    if (!WEBAPP_URL){ alert('Save is not configured: WEBAPP_URL is empty.'); throw new Error('No WEBAPP_URL'); }
    const form = new URLSearchParams();
    form.set('fn','save');
    form.set('payload', JSON.stringify(payload));
    const res = await fetch(WEBAPP_URL, { method:'POST', body: form });
    let j = {};
    try { j = await res.json(); } catch(_){ throw new Error('Save failed'); }
    if (!res.ok || j.ok === false) throw new Error(String(j.error || ('HTTP '+res.status)));
    return j;
  }

  function closeModal(){
    try {
      if (typeof modal.close === 'function') modal.close();
      else modal.removeAttribute('open');
    } catch(_){}
  }

  async function onToggle(){
    const toEdit = !modal.classList.contains('editing');
    if (toEdit){
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

    btn.disabled = true;
    try{
      await saveViaPost(payload);
      closeModal();
      window.location.reload();
    }catch(e){
      console.error(e);
      alert('Save failed: ' + e.message);
      setEditable(true);
    }finally{
      btn.disabled = false;
    }
  }

  btn.addEventListener('click', onToggle);
})();
