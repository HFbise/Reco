const CACHE = 'reco-v23';
const PRECACHE = [
  '/static/css/main.css',
  '/static/js/app.js',
  '/static/logo.svg',
  '/static/icon.svg',
  '/static/app-logo.png',
  '/static/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // 主页和 socket.io 始终走网络
  if (url.pathname === '/' || url.pathname.includes('socket.io')) return;
  // 静态资源：缓存优先，没有再从网络取
  if (url.pathname.startsWith('/static/')) {
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
      )
    );
  }
});
