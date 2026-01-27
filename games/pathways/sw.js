// Pathways Game Service Worker
const CACHE_NAME = 'pathways-game-v1';
const OFFLINE_URLS = [
  '/games/pathways/',
  '/games/pathways/index.html',
  '/games/pathways/pathways-engine.js',
  '/games/pathways/pathways-renderer.js',
  '/games/pathways/pathways-input.js',
  '/games/pathways/pathways-ui.js',
  '/games/pathways/pathways-utils.js',
  '/games/pathways/pathways-puzzle-generator.js',
  '/games/pathways/pathways-logo.png',
  '/games/pathways/manifest.json'
];

// Install - cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS);
    })
  );
  self.skipWaiting();
});

// Activate - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests (POST, etc. cannot be cached)
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Skip API requests - always go to network
  if (event.request.url.includes('/api/')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and cache successful responses
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request);
      })
  );
});
