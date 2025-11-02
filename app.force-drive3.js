// app.force-drive3.js — load FIRST; aggressively rewrite any lh3 to Drive
(function(){
  console.log('[force-drive3] hard override active');

  function extractIdFromAny(input){
    const s = String(input || '').trim();
    let m = s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/); if (m) return m[1];
    m = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/);       if (m) return m[1];
    m = s.match(/^([a-zA-Z0-9_-]{25,})$/);          if (m) return m[1];
    return '';
  }
  
  function driveProxyUrl(u, w){
    const webapp=(window.WEBAPP_URL||'').replace(/\/$/,'');
    if (!webapp) return u;
    const enc = encodeURIComponent(u);
    return `${webapp}?fn=img&u=${enc}&w=${w||600}`;
  }

  function driveThumb(id, w){
  const webapp=(window.WEBAPP_URL||'').replace(/\/$/,'');
  if (webapp) return `${webapp}?id=${encodeURIComponent(id)}&w=${w||600}`;
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w||600}`;
}

  function fixUrl(u, w){
    if (!u) return u;
    if (u.includes('lh3.googleusercontent.com/d/')) {
      // Route full URL through proxy; avoids DriveApp permission issues
      return driveProxyUrl(u, w);
    }
    return u;
  }

  // Replace all lh3 links in HTML strings
  function rewriteHTML(html, w){
    return String(html||'').replace(/https?:\/\/lh3\.googleusercontent\.com\/d\/[^\s"']+/g,
      (full)=> driveProxyUrl(full, w));
  }

  // 1) Hard override builder
  window.buildImgWithFallback = function(srcOrId, cls, size){
    const id  = extractIdFromAny(srcOrId);
    const url = id ? driveThumb(id, size||600) : String(srcOrId||'');
    const klass = cls ? ` ${cls}` : '';
    return `<img src="${url}" class="thumb${klass}" loading="lazy" alt="photo">`;
  };

  // 2) Patch HTMLImageElement src setter
  const imgDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (imgDesc && imgDesc.set) {
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true,
      get: imgDesc.get,
      set: function(v){
        if (typeof v === 'string') v = fixUrl(v, 600);
        return imgDesc.set.call(this, v);
      }
    });
  }

  // 3) Patch setAttribute for src/srcset on any element (esp. IMG)
  const origSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value){
    if (/^(src|srcset)$/i.test(name) && typeof value === 'string') value = fixUrl(value, 600);
    if (/^(style)$/i.test(name) && typeof value === 'string') value = rewriteHTML(value, 600);
    return origSetAttr.call(this, name, value);
  };

  // 4) Patch innerHTML setter & insertAdjacentHTML
  const elDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  if (elDesc && elDesc.set) {
    Object.defineProperty(Element.prototype, 'innerHTML', {
      configurable: true,
      get: elDesc.get,
      set: function(v){ return elDesc.set.call(this, rewriteHTML(v, 600)); }
    });
  }
  const origInsertAdj = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function(pos, html){
    return origInsertAdj.call(this, pos, rewriteHTML(html, 600));
  };

  // 5) Patch document.write
  const origWrite = Document.prototype.write;
  Document.prototype.write = function(html){
    return origWrite.call(this, rewriteHTML(html, 600));
  };

  // 6) Patch appendChild to sanitize nodes being appended
  const origAppend = Node.prototype.appendChild;
  Node.prototype.appendChild = function(node){
    try{
      if (node && node.querySelectorAll) {
        node.querySelectorAll('img').forEach(function(img){
          const fixed = fixUrl(img.getAttribute('src') || '', 600);
          if (fixed) img.setAttribute('src', fixed);
        });
      } else if (node instanceof HTMLImageElement) {
        const fixed = fixUrl(node.getAttribute('src') || '', 600);
        if (fixed) node.setAttribute('src', fixed);
      }
    }catch(e){}
    return origAppend.call(this, node);
  };

  // 7) Rewrite existing DOM now and observe future mutations
  function rewriteImg(img){
    const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
    const fixed = fixUrl(src, 600);
    if (fixed && fixed !== src) img.setAttribute('src', fixed);
    // also check background-image inline styles
    const style = img.getAttribute('style') || '';
    if (style && /lh3\.googleusercontent\.com\/d\//.test(style)) {
      img.setAttribute('style', rewriteHTML(style, 600));
    }
  }
  function rewriteAll(){ document.querySelectorAll('img').forEach(rewriteImg); }
  rewriteAll();
  new MutationObserver(() => rewriteAll()).observe(document.documentElement, {childList:true, subtree:true});

  // 8) NOP any lazy swappers
  window.loadThumbsWithin = function(){};
  if (window.HFD) window.HFD.observeThumbsWithin = function(){};
})();

/* === OVERRIDES: robust id->proxy mapping === */
(function(){
  if (typeof extractIdFromAny !== 'function') {
    window.extractIdFromAny = function(input){
      const s = String(input||'').trim();
      let m = s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/); if (m) return m[1];
      m = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/);       if (m) return m[1];
      m = s.match(/^([a-zA-Z0-9_-]{25,})$/);            if (m) return m[1];
      return '';
    };
  }
  if (typeof driveProxyUrl !== 'function') {
    window.driveProxyUrl = function(u, w){
      const webapp=(window.WEBAPP_URL||'').replace(/\/$/,'');
      if (!webapp) return u;
      const enc = encodeURIComponent(u);
      return `${webapp}?fn=img&u=${enc}&w=${w||600}`;
    };
  }
  window.__fixUrlOverride = function(u, w){
    if (!u) return u;
    if (u.includes('lh3.googleusercontent.com/')) return driveProxyUrl(u, w);
    const id = extractIdFromAny(u);
    if (id) {
      const lh3 = `https://lh3.googleusercontent.com/d/${id}=w${w||600}`;
      return driveProxyUrl(lh3, w);
    }
    return u;
  };
  // Monkey-patch common attribute setters so all future sets run through override
  const _setAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value){
    if (name === 'src' || name === 'href') {
      value = window.__fixUrlOverride(value, 600);
    }
    return _setAttr.call(this, name, value);
  };
  // Initial sweep
  document.querySelectorAll('img, a').forEach(el => {
    const attr = el.tagName === 'A' ? 'href' : 'src';
    const v = el.getAttribute(attr);
    if (v) el.setAttribute(attr, v);
  });
})();

