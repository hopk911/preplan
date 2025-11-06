
/* sw.js — HFD Pre-Plan offline support */
const VERSION = 'v1.0.0';
const APP_CACHE = 'hfd-app-' + VERSION;
const RUNTIME_CACHE = 'hfd-runtime-' + VERSION;

// URLs to precache (app shell)
const PRECACHE_URLS = [
  '/',              // root
  '/index.html',
  '/css/styles.css',
  '/js/app.bundle.js',
  '/js/popup-edit.js',
  '/js/hfd-upload-injector.js',
  '/js/sw.js',         
  '/offline.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => {
      if (![APP_CACHE, RUNTIME_CACHE].includes(k)) return caches.delete(k);
    }))).then(() => self.clients.claim())
  );
});

// Helper: classifies requests
function isHTML(req){ return req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html'); }
function isCSSJS(req){
  const u = req.url;
  return u.endsWith('.css') || u.endsWith('.js');
}
function isImage(req){
  const u = req.url;
  return /\.(png|jpg|jpeg|webp|gif|svg|ico)$/i.test(u) || u.includes('google.com/thumbnail') || u.includes('script.google.com/macros') && u.includes('fn=img');
}

// Strategy implementations
async function networkFirst(event){
  const cache = await caches.open(RUNTIME_CACHE);
  try{
    const resp = await fetch(event.request);
    cache.put(event.request, resp.clone());
    return resp;
  }catch(_){
    const cached = await cache.match(event.request) || await caches.match(event.request);
    return cached || (isHTML(event.request) ? await caches.match('/offline.html') : Response.error());
  }
}

async function staleWhileRevalidate(event){
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(event.request);
  const networkFetch = fetch(event.request).then(resp => {
    cache.put(event.request, resp.clone());
    return resp;
  }).catch(()=>cached);
  return cached || networkFetch;
}

async function cacheFirst(event){
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  try{
    const resp = await fetch(event.request, { mode: 'no-cors' }).catch(()=>null) || await fetch(event.request);
    if (resp) cache.put(event.request, resp.clone());
    return resp || Response.error();
  }catch(_){
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (isHTML(req)){
    event.respondWith(networkFirst(event));
    return;
  }
  if (isCSSJS(req)){
    event.respondWith(staleWhileRevalidate(event));
    return;
  }
  if (isImage(req)){
    event.respondWith(cacheFirst(event));
    return;
  }
  // Default: try cache, then network
  event.respondWith(staleWhileRevalidate(event));
});
