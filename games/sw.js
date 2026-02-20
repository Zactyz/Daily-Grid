const CACHE_VERSION = 'dg-games-v3';
const CORE_ASSETS = [
  '/games/',
  '/games/index.html',
  '/games/practice/',
  '/games/practice/index.html',
  '/games/medals/',
  '/games/medals/index.html',
  '/games/profile/',
  '/games/profile/index.html',
  '/games/manifest.json',
  '/games/bits/bitsnew-logo.jpg',
  '/games/hashi/hashi-logo.jpg',
  '/games/shikaku/shikaku-logo.jpg',
  '/games/lattice/lattice-logo.png?v=2',
  '/games/pathways/pathways-logo.png',
  '/games/snake/snake-logo.png',
  '/games/assets/dg-games-192.png',
  '/games/assets/dg-games-512.png',
  '/games/assets/dg-games-180.png'
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

// ─── Push notification handler ────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Daily Grid', body: event.data?.text() || "Today's puzzles are live!" };
  }

  const title   = data.title  || 'Daily Grid';
  const options = {
    body:    data.body  || "Today's puzzles are live! Come solve them.",
    icon:    data.icon  || '/games/assets/dg-games-192.png',
    badge:   data.badge || '/games/assets/dg-games-192.png',
    tag:     'daily-grid-daily',       // replace existing notification of same type
    renotify: false,
    data: { url: data.url || '/games/' },
    actions: [
      { action: 'open', title: 'Play Now' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification click handler ───────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/games/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus an existing window if one is open
      for (const client of windowClients) {
        if (client.url.includes('/games/') && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
