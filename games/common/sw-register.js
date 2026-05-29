/**
 * Register the hub service worker and keep installed PWAs on fresh builds.
 * - Unregisters legacy per-game workers (snake/pathways) that pinned old caches.
 * - Checks for updates on load and when the app returns to foreground.
 * - Reloads once when a waiting worker takes control.
 */

const SW_URL = '/games/sw.js';
const SW_SCOPE = '/games/';

let listenersAttached = false;
let reloading = false;

async function unregisterLegacyGameWorkers() {
  if (!navigator.serviceWorker.getRegistrations) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map(async (reg) => {
    const scope = reg.scope || '';
    if (scope.includes('/games/snake/') || scope.includes('/games/pathways/')) {
      await reg.unregister().catch(() => {});
    }
  }));
}

export async function registerGamesServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    await unregisterLegacyGameWorkers();
    const reg = await navigator.serviceWorker.register(SW_URL, {
      scope: SW_SCOPE,
      // Always revalidate sw.js so deploys are detected quickly.
      updateViaCache: 'none'
    });
    await reg.update().catch(() => {});
    return reg;
  } catch (err) {
    console.warn('[SW] registration failed:', err);
    return null;
  }
}

async function checkForSwUpdate() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  if (reg) await reg.update().catch(() => {});
}

/**
 * Call once per page load on any /games/ page (hub, games, profile, feedback).
 */
export function initServiceWorkerUpdates() {
  if (!('serviceWorker' in navigator)) return;

  registerGamesServiceWorker();

  if (listenersAttached) return;
  listenersAttached = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForSwUpdate();
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}
