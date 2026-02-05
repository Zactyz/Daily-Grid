const CACHE_VERSION = 'dg-games-v1';
const CORE_ASSETS = [
  '/games/',
  '/games/index.html',
  '/games/manifest.json',
  '/games/bits/bitsnew-logo.jpg',
  '/games/hashi/hashi-logo.jpg',
  '/games/shikaku/shikaku-logo.jpg',
  '/games/lattice/lattice-logo.png?v=2',
  '/games/pathways/pathways-logo.png',
  '/games/snake/snake-logo.png',
  '/Images/web%20icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!url.pathname.startsWith('/games/')) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        return response;
      }).catch(() => caches.match('/games/index.html'));
    })
  );
});
