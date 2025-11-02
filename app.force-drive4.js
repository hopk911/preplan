// app.force-drive3.js — v4 (rewrite ALL Drive URLs to proxy)
(function(){
  console.log('[force-drive4] hard override active');

  function extractIdFromAny(input){
    const s = String(input || '').trim();
    if (!s) return '';
    // direct id
    let m = s.match(/^[A-Za-z0-9_-]{20,}$/); if (m) return m[0];
    // common id in query ?id=
    m = s.match(/[?&]id=([A-Za-z0-9_-]{10,})/); if (m) return m[1];
    // /d/<id>/ or /file/d/<id>/
    m = s.match(/\/(?:file\/)?d\/([A-Za-z0-9_-]{10,})/); if (m) return m[1];
    // uc?id in path variants
    m = s.match(/\/uc(?:\?|\/).*?[?&]id=([A-Za-z0-9_-]{10,})/); if (m) return m[1];
    // googleusercontent /d/<id>=
    m = s.match(/googleusercontent\.com\/d\/([A-Za-z0-9_-]{10,})/); if (m) return m[1];
    // last resort any long token
    m = s.match(/([A-Za-z0-9_-]{20,})/); if (m) return m[1];
    return '';
  }

  function webappBase(){
    const webapp=(window.WEBAPP_URL||'').replace(/\/$/,'');
    return webapp && /^https?:\/\/script\.google\.com\//.test(webapp) ? webapp : '';
  }

  function toProxyById(id, w){
    const base = webappBase();
    if (!base) return '';
    return base + '?id=' + encodeURIComponent(id) + '&w=' + (w||600);
  }

  function toProxyByUrl(u, w){
    const base = webappBase();
    if (!base) return u;
    return base + '?fn=img&u=' + encodeURIComponent(u) + '&w=' + (w||600);
  }

  function looksLikeDrive(u){
    return /(?:^|\/\/)(?:drive\.google\.com|docs\.google\.com|lh3\.googleusercontent\.com)\b/i.test(String(u||''));
  }

  function fixUrl(u, w){
    if (!u) return u;
    // If it's any Drive/lh3 URL, prefer ID-based proxy
    if (looksLikeDrive(u)) {
      const id = extractIdFromAny(u);
      if (id) return toProxyById(id, w);
      return toProxyByUrl(u, w);
    }
    return u;
  }

  // Replace all Drive/lh3 links in HTML strings
  function rewriteHTML(html, w){
    if (!html) return html;
    return String(html).replace(/https?:\/\/[^\s"'<>]+/g, function(full){
      if (looksLikeDrive(full)) {
        const id = extractIdFromAny(full);
        return id ? toProxyById(id, w) : toProxyByUrl(full, w);
      }
      return full;
    });
  }

  // 1) Hard override builder used by the bundle/UI
  window.buildImgWithFallback = function(srcOrId, cls, size){
    const w = size || 600;
    const id = extractIdFromAny(srcOrId);
    const url = id ? toProxyById(id, w) : toProxyByUrl(String(srcOrId||''), w);
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

  // 3) Patch setAttribute for src/srcset/style
  const origSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value){
    if (/^(src|srcset)$/i.test(name) && typeof value === 'string'){
      value = fixUrl(value, 600);
    } else if (/^(style)$/i.test(name) && typeof value === 'string'){
      value = rewriteHTML(value, 600);
    }
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
    const style = img.getAttribute('style') || '';
    if (style && looksLikeDrive(style)) {
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