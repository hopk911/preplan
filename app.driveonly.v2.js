// === Drive-only v2: no proxy, no lh3, no lazy swapping ===
(function(){
  function extractId(input){
    if (!input) return '';
    var s = String(input).trim();
    var m = s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/); if (m) return m[1];
    m = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/);       if (m) return m[1];
    m = s.match(/^([a-zA-Z0-9_-]{25,})$/);          if (m) return m[1];
    return '';
  }

  // Drive-thumbnail ONLY. Real src=..., so nothing swaps it later.
  window.buildImgWithFallback = function(srcOrId, cls, size){
    if (!srcOrId) return '';
    var w = size || 600;
    var id = extractId(srcOrId);
    var url = id ? ('https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w' + w)
                 : String(srcOrId);
    var klass = cls ? (' ' + cls) : '';
    return '<img src="' + url + '" class="thumb' + klass + '" loading="lazy" alt="photo">';
  };

  // Neutralize swappers so URLs are never rewritten
  window.loadThumbsWithin = function(){ /* no-op: src already set */ };
  if (window.HFD) window.HFD.observeThumbsWithin = function(){};
})();
// === End drive-only v2 ===