
// popup-edit.js — "Save" label in edit mode; POST save; close modal + reload after save
(function () {
  'use strict';

  const modal   = document.getElementById('recordModal');
  const content = document.getElementById('modalContent');
  const btn     = document.getElementById('btnModalEdit');
  if (!modal || !content || !btn) { console.warn('[popup-edit.js] missing DOM'); return; }

  const WEBAPP_URL  = (window && window.WEBAPP_URL)  || '';
  const norm = s => String(s || '').toLowerCase().replace(/\s+/g,' ').replace(/:$/,'').trim();

  function setEditable(on){
    modal.classList.toggle('editing', !!on);
    btn.classList.toggle('toggled', !!on);
    btn.textContent = on ? 'Save' : 'Edit'; // Label = Save when editing
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
    // ensure Stable ID present
    const sid = (window._currentRecord && (window._currentRecord['Stable ID'] || window._currentRecord['Stable ID:'])) || '';
    if (sid && !data['Stable ID'] && !data['Stable ID:']) data['Stable ID'] = String(sid);
    // bring forward any photo links that might be hidden
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
    if (toEdit){ setEditable(true); return; }
    // leaving edit => SAVE
    const original = (window._currentRecord && typeof window._currentRecord==='object') ? window._currentRecord : {};
    const edited   = collectFromPopup();
    const payload  = Object.assign({}, original, edited);
    // lock Stable ID
    (function keepStable(){
      const keys = Object.keys(payload);
      const sKey = keys.find(k => norm(k)==='stable id');
      if (!sKey){
        const sid = original['Stable ID'] || original['Stable ID:'] || edited['Stable ID'] || edited['Stable ID:'] || '';
        if (sid) payload['Stable ID'] = String(sid);
      }
    })();

    btn.disabled = true;
    try{
      await saveViaPost(payload);
      // Close modal and refresh the page so the table updates
      closeModal();
      // full reload to ensure table + filters refresh
      window.location.reload();
    }catch(e){
      console.error(e);
      alert('Save failed: ' + e.message);
      setEditable(true); // keep in edit mode if failed
    }finally{
      btn.disabled = false;
    }
  }

  btn.addEventListener('click', onToggle);
})();
