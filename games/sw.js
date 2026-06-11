// Bump CACHE_VERSION on every production deploy that changes HTML/JS/CSS.
const CACHE_VERSION = 'dg-games-v13';
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
  '/games/common/hub-nav.css',
  '/games/common/hub-nav.js',
  '/games/common/practice-hub.js',
  '/games/common/hub-footer.css',
  '/games/common/hub-footer.js',
  '/games/common/desktop-game.css',
  '/games/common/tab-bar.css',
  '/games/common/tab-bar.js',
  '/games/common/design-tokens.css',
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

const HTML_PAGES = [
  '/games/',
  '/games/practice/',
  '/games/medals/',
  '/games/profile/',
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

function ensureHtmlContentType(response) {
  if (!response) return response;
  if (response.status !== 200) return response;
  const ct = response.headers.get('content-type') || '';
  if (ct.includes('text/html')) return response;
  const headers = new Headers(response.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(response.body, { status: 200, statusText: 'OK', headers });
}

function isHubHtmlPage(pathname) {
  return HTML_PAGES.includes(pathname);
}

function shouldUseNetworkFirst(request, url) {
  if (request.mode === 'navigate' && isHubHtmlPage(url.pathname)) return false;
  if (request.mode === 'navigate') return true;
  if (HTML_PAGES.includes(url.pathname)) return true;
  if (url.pathname.endsWith('.html')) return true;
  if (/\.(js|mjs|css)(\?|$)/i.test(url.pathname)) return true;
  return false;
}

function isStaticAsset(url) {
  return /\.(png|jpe?g|gif|webp|svg|ico|woff2?)(\?|$)/i.test(url.pathname);
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/games/index.html');
      if (fallback) return fallback;
    }
    return Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }

  const response = await networkPromise;
  return response || Response.error();
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_VERSION);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!url.pathname.startsWith('/games/')) return;
  if (url.pathname.includes('/api/')) return;

  const isHtml = request.mode === 'navigate' || HTML_PAGES.includes(url.pathname)
    || url.pathname.endsWith('.html');

  if (request.mode === 'navigate' && isHubHtmlPage(url.pathname)) {
    event.respondWith((async () => {
      const response = await staleWhileRevalidate(request);
      return ensureHtmlContentType(response);
    })());
    return;
  }

  if (shouldUseNetworkFirst(request, url)) {
    event.respondWith((async () => {
      const response = await networkFirst(request);
      return isHtml ? ensureHtmlContentType(response) : response;
    })());
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
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
    tag:     data.tag   || 'daily-grid-daily',
    renotify: false,
    data: { url: data.url || '/games/' },
    actions: [
      { action: 'open', title: 'Play Now' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/games/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes('/games/') && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
