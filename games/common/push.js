/**
 * Client-side Web Push subscription helpers.
 *
 * Usage:
 *   import { requestPushPermission, isPushSubscribed, unsubscribePush } from '../common/push.js';
 *
 * VAPID_PUBLIC_KEY is fetched from /api/push/vapid-public-key on first use,
 * or can be injected via window.DG_VAPID_PUBLIC_KEY.
 *
 * NOTE: Push notifications require HTTPS and iOS 16.4+ for PWA home-screen installs.
 */

const PUSH_OPT_IN_KEY   = 'dailygrid_push_opted_in';
const PUSH_ENDPOINT_KEY = 'dailygrid_push_endpoint';

/** Resolves navigator.serviceWorker.ready with a timeout to avoid hanging. */
function swReady(timeoutMs = 8000) {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Service worker ready timed out')), timeoutMs)
    ),
  ]);
}

/**
 * Ensure the games service worker is registered (idempotent — safe to call repeatedly).
 * The profile page doesn't load a game so we register sw.js explicitly here.
 */
export async function ensureSwRegistered() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/games/sw.js', { scope: '/games/' });
  } catch (err) {
    console.warn('[Push] SW registration failed:', err);
  }
}

/**
 * Returns true if the browser supports push and the user has an active subscription.
 */
export async function isPushSubscribed() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const reg = await swReady();
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

/**
 * Request push notification permission and subscribe.
 * Returns { ok: true } on success, or { ok: false, reason: string } on failure.
 * @param {string} anonId - The user's anonymous ID from localStorage
 * @param {string} vapidPublicKey - VAPID public key (base64url, 65 bytes uncompressed P-256)
 */
export async function requestPushPermission(anonId, vapidPublicKey) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' };
  }

  if (!vapidPublicKey) {
    console.warn('[Push] No VAPID public key available.');
    return { ok: false, reason: 'no-vapid-key' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'denied') return { ok: false, reason: 'denied' };
    if (permission !== 'granted') return { ok: false, reason: 'dismissed' };

    await ensureSwRegistered();
    const reg = await swReady();

    // Remove any stale subscription first
    const existing = await reg.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    const subJson = sub.toJSON();
    const body = {
      endpoint: subJson.endpoint,
      p256dh:   subJson.keys?.p256dh,
      auth:     subJson.keys?.auth,
      anonId,
    };

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn('[Push] Server subscription failed:', res.status);
      return { ok: false, reason: 'server-error' };
    }

    localStorage.setItem(PUSH_OPT_IN_KEY, 'true');
    localStorage.setItem(PUSH_ENDPOINT_KEY, subJson.endpoint);

    return { ok: true };
  } catch (err) {
    console.warn('[Push] Subscribe failed:', err);
    return { ok: false, reason: 'error', detail: err.message };
  }
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    localStorage.removeItem(PUSH_OPT_IN_KEY);
    localStorage.removeItem(PUSH_ENDPOINT_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether the user previously opted in (localStorage flag).
 * Does not verify the subscription is still valid.
 */
export function hasPushOptIn() {
  return localStorage.getItem(PUSH_OPT_IN_KEY) === 'true';
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
