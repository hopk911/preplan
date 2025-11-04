
(function(){
  if (window.__HFD_UPLOAD_INJECTOR__) return;
  window.__HFD_UPLOAD_INJECTOR__ = true;
  const modal=document.getElementById('recordModal'), content=document.getElementById('modalContent');
  if(!modal||!content) return;
  const SID_HEADER='Stable ID', SID_LABEL='Stable ID:';
  function editToken(){ return sessionStorage.getItem('HFD_EDIT_TOKEN')||''; }
  function getSID(){ const r=window._currentRecord||{}; const sid=r[SID_HEADER]||r[SID_LABEL]; return sid?String(sid).trim():''; }
  async function postForm(obj){ const url=(window.WEBAPP_URL||''); if(!url) throw new Error('WEBAPP_URL not set'); const form=new URLSearchParams(); Object.entries(obj).forEach(([k,v])=>form.set(k, v==null?'':String(v))); form.set('token',editToken()); const res=await fetch(url,{method:'POST',body:form}); const j=await res.json(); if(!res.ok||j.ok===false) throw new Error(j.error||('HTTP '+res.status)); return j; }
  async function ensureRow(){ const sid=getSID(); if(!sid) throw new Error('Missing Stable ID'); try{ await postForm({fn:'save', payload: JSON.stringify({[SID_HEADER]:sid,[SID_LABEL]:sid})}); }catch(_){ } return sid; }
  async function postMultipart(file,header){ const url=(window.WEBAPP_URL||''); const fd=new FormData(); fd.append('fn','upload'); fd.append('field',header); fd.append('filename',file.name||'photo.jpg'); fd.append('token',editToken()); fd.append('file',file,file.name||'photo.jpg'); const res=await fetch(url,{method:'POST',body:fd}); const j=await res.json(); if(!res.ok||j.ok===false) throw new Error(j.error||('HTTP '+res.status)); return j; }
  async function postDataUrl(file,header){ const dataUrl=await new Promise((ok,err)=>{ const fr=new FileReader(); fr.onerror=()=>err(new Error('reader failed')); fr.onload=()=>ok(fr.result); fr.readAsDataURL(file); }); return await postForm({fn:'upload', field:header, filename:file.name||'', dataUrl}); }
  let queue=Promise.resolve(); function enqueue(task){ queue=queue.then(task).catch(()=>{}); return queue; }
  function sectionFor(h){ h=String(h||'').toLowerCase(); if(/elev/.test(h))return 'elevators'; if(/fdc|alarm|sprinkler|riser|fire/.test(h))return 'fire'; if(/water|hydrant|cistern/.test(h))return 'water'; if(/electric|panel|breaker|generator/.test(h))return 'electric'; if(/gas|propane/.test(h))return 'gas'; if(/hazmat|chemical|flammable|tank/.test(h))return 'hazmat'; return 'other'; }
  function ensureBar(id){ const sec=document.getElementById('section-'+id); if(!sec) return null; let bar=sec.querySelector('.per-section-uploads'); if(bar) return bar; bar=document.createElement('div'); bar.className='per-section-uploads'; const h3=sec.querySelector('h3'); if(h3&&h3.nextSibling) sec.insertBefore(bar,h3.nextSibling); else sec.prepend(bar); return bar; }
  function photoHeaders(){ const ks=[...content.querySelectorAll('.kv .k')].map(el=>(el.textContent||'').trim()).filter(Boolean).filter(k=>/photo/i.test(k)); return ks.length?ks:['Photo:','Alarm Photo:','Roof Access Photo:','Elevator Shutoff Photo:','Elevator Key Photo:','FDC Photo:','Sprinkler Shutoff Photo:','Panel Photo:']; }
  function mount(){
    if(!modal.classList.contains('editing')) return;
    photoHeaders().forEach(header=>{
      const bar=ensureBar(sectionFor(header)); if(!bar) return;
      if(bar.querySelector('[data-hfd-upload="'+header+'"]')) return;
      const btn=document.createElement('button'); btn.className='btn'; btn.type='button'; btn.setAttribute('data-hfd-upload',header); btn.textContent='Upload: '+header;
      const input=document.createElement('input'); input.type='file'; input.accept='image/*'; input.multiple=true; input.style.display='none';
      const wrap=document.createElement('span'); wrap.className='upload-wrap'; wrap.appendChild(btn); wrap.appendChild(input); bar.appendChild(wrap);
      btn.addEventListener('click',()=>input.click());
      input.addEventListener('change',()=>{
        if(!input.files||!input.files.length) return;
        const sid=getSID(); if(!sid){ alert('Please click Edit first.'); return; }
        const prev=btn.textContent; btn.disabled=true; btn.textContent='Uploading…';
        enqueue(async ()=>{
          const links=[];
          try{
            await ensureRow();
            for(const f of input.files){
              let out; try{ out=await postDataUrl(f,header);}catch(e1){ out=await postMultipart(f,header); }
              const link=out.link||out.url||(out.id?('https://drive.google.com/uc?export=view&id='+out.id):''); if(link) links.push(link);
            }
          }catch(e){ console.error(e); alert('Upload failed: '+e.message); }
          finally{ btn.disabled=false; btn.textContent=prev; input.value=''; }
          if(!links.length) return;
          const rec=window._currentRecord||{}; const base=(rec&&rec[header])?String(rec[header]).trim():''; const csv=[base,links.join(', ')].filter(Boolean).join(', ');
          if(window._currentRecord) window._currentRecord[header]=csv;
          await postForm({fn:'savefield', stableId:sid, field: /:$/.test(header)?header:(header+':'), value: csv});
        });
      });
    });
  }
  const mo=new MutationObserver(()=>{ if(modal.open&&modal.classList.contains('editing')){ mount(); setTimeout(mount,0); setTimeout(mount,300);} });
  mo.observe(modal,{attributes:true, attributeFilter:['open','class']});
  setInterval(()=>{ if(modal.open&&modal.classList.contains('editing')) mount(); },1200);
})();
