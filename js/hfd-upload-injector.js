// hfd-upload-injector.js — upload buttons inside correct sections (Sprinkler & Pump -> FIRE)
(function(){
  if (window.__HFD_UPLOAD_INJECTOR__) return;
  window.__HFD_UPLOAD_INJECTOR__ = true;

  const modal = document.getElementById('recordModal');
  const body  = document.getElementById('modalContent') || document.querySelector('#recordModal .modal-content');
  if (!modal || !body) { console.warn('[injector] modal/body not found'); return; }

  const ORDER = (Array.isArray(window.SECTION_CONFIG) ? window.SECTION_CONFIG.map(s => s.id)
                 : ['other','bldg','staging','fire','elevators','ems','water','electric','gas','hazmat']);

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

  function sectionForField(header){
    const h = String(header||'').toLowerCase();
    if (h === 'photo:')               return 'other';
    if (h.includes('roof'))           return 'bldg';
    if (h.includes('alarm'))          return 'fire';
    if (h.includes('elevator'))       return 'elevators';
    if (h.includes('gas'))            return 'gas';
    if (h.includes('electrical'))     return 'electric';
    if (h.includes('water shutoff'))  return 'water';
    if (h.includes('sprinkler'))      return 'fire';      // <-- moved to FIRE
    if (h.includes('pump'))           return 'fire';      // <-- moved to FIRE
    if (h.includes('tank'))           return 'hazmat';
    if (h.includes('combust'))        return 'hazmat';
    if (h.includes('hazmat'))         return 'hazmat';
    return 'other';
  }

  function labelForSection(secId){
    if (Array.isArray(window.SECTION_CONFIG)){
      const f = window.SECTION_CONFIG.find(x=>x.id===secId);
      if (f && f.label) return f.label;
    }
    return secId.charAt(0).toUpperCase() + secId.slice(1);
  }

  function ensureSectionOrdered(secId){
    if (!modal.classList.contains('editing')) return null;
    let sec = document.getElementById('section-' + secId);
    if (sec) return sec;

    const newSec = document.createElement('section');
    newSec.id = 'section-' + secId;
    newSec.className = 'section';
    newSec.setAttribute('data-color', secId);
    newSec.dataset.hfdInjected = '1';

    const h3 = document.createElement('h3');
    h3.className = 'section-header';
    h3.textContent = labelForSection(secId);
    newSec.appendChild(h3);

    const ORDER_LIST = ORDER;
    const myIndex = ORDER_LIST.indexOf(secId);
    const allSections = Array.from(body.querySelectorAll('section.section[id^="section-"]'));
    let anchor = null;
    for (const s of allSections){
      const id = s.id.replace(/^section-/, '');
      const idx = ORDER_LIST.indexOf(id);
      if (idx > -1 && idx > myIndex) { anchor = s; break; }
    }
    if (anchor) body.insertBefore(newSec, anchor);
    else body.appendChild(newSec);

    return newSec;
  }

  function buttonBar(sec){
    let bar = sec.querySelector('.per-section-uploads');
    if (!bar){
      bar = document.createElement('div');
      bar.className = 'per-section-uploads';
      const header = sec.querySelector('.section-header');
      if (header && header.nextSibling) sec.insertBefore(bar, header.nextSibling);
      else sec.appendChild(bar);
    }
    return bar;
  }

  function makeUploadBtn(fieldHeader){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-upload';
    btn.dataset.field = fieldHeader;
    btn.textContent = 'Upload ' + fieldHeader.replace(/:$/,'');
    btn.addEventListener('click', () => {
      if (!modal.classList.contains('editing')) return;
      if (typeof window.hfdOpenFilePicker !== 'function') { alert('Uploader not available'); return; }
      window.hfdOpenFilePicker(fieldHeader);
    });
    return btn;
  }

  function mountAll(){
    if (!modal.classList.contains('editing')) return;
    Object.keys(PHOTO_UPLOAD_FOLDERS).forEach((fieldHeader) => {
      const secId = sectionForField(fieldHeader);
      let sec = document.getElementById('section-' + secId);
      if (!sec) sec = ensureSectionOrdered(secId);
      if (!sec) return;
      const bar = buttonBar(sec);
      if (!bar.querySelector(`[data-field="${CSS.escape(fieldHeader)}"]`)){
        bar.appendChild(makeUploadBtn(fieldHeader));
      }
    });
  }

  function cleanup(){
    body.querySelectorAll('.per-section-uploads').forEach(n => n.remove());
    body.querySelectorAll('section.section[data-hfd-injected="1"]').forEach(n => n.remove());
  }

  modal.addEventListener('hfd-edit-start', mountAll);
  modal.addEventListener('hfd-edit-end', cleanup);

  const mo = new MutationObserver(() => {
    if (modal.classList.contains('editing')) mountAll();
    else cleanup();
  });
  mo.observe(modal, { attributes:true, attributeFilter:['class'] });

  if (modal.classList.contains('editing')) mountAll();

  console.log('[hfd-upload-injector] Sprinkler & Pump -> FIRE');
})();