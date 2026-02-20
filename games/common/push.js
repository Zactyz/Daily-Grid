/**
 * Client-side Web Push subscription helpers.
 *
 * Usage:
 *   import { requestPushPermission, isPushSubscribed, unsubscribePush } from '../common/push.js';
 *
 * VAPID_PUBLIC_KEY is fetched from /api/push/vapid-public-key on first use,
 * or can be injected via window.DG_VAPID_PUBLIC_KEY.
 *
 * NOTE: Push notifications require the page to be served over HTTPS.
 */

const PUSH_OPT_IN_KEY   = 'dailygrid_push_opted_in';
const PUSH_ENDPOINT_KEY = 'dailygrid_push_endpoint';

/**
 * Returns true if the browser supports push and the user has an active subscription.
 */
export async function isPushSubscribed() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

/**
 * Request push notification permission and subscribe.
 * Returns true on success, false if denied or unsupported.
 * @param {string} anonId - The user's anonymous ID from localStorage
 * @param {string} [vapidPublicKey] - Optional override; will try window.DG_VAPID_PUBLIC_KEY
 */
export async function requestPushPermission(anonId, vapidPublicKey) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

  const pubKey = vapidPublicKey || window.DG_VAPID_PUBLIC_KEY;
  if (!pubKey) {
    console.warn('[Push] No VAPID public key available. Set window.DG_VAPID_PUBLIC_KEY.');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const reg = await navigator.serviceWorker.ready;

    // Remove any stale subscription first
    const existing = await reg.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(pubKey),
    });

    const subJson = sub.toJSON();
    const body = {
      endpoint: subJson.endpoint,
      p256dh:   subJson.keys?.p256dh,
      auth:     subJson.keys?.auth,
      anonId,
    };

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    localStorage.setItem(PUSH_OPT_IN_KEY, 'true');
    localStorage.setItem(PUSH_ENDPOINT_KEY, subJson.endpoint);

    return true;
  } catch (err) {
    console.warn('[Push] Subscribe failed:', err);
    return false;
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
