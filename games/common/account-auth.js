/**
 * Client-side account auth helpers. All requests use credentials for session cookies.
 */
import { getAnonId, getOrCreateAnonId } from './utils.js';

let cachedStatus = null;
let statusFetchedAt = 0;
const STATUS_TTL_MS = 30_000;

export async function fetchAuthStatus({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedStatus && now - statusFetchedAt < STATUS_TTL_MS) {
    return cachedStatus;
  }
  try {
    const res = await fetch('/api/auth/status', { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    cachedStatus = await res.json();
    statusFetchedAt = now;
    return cachedStatus;
  } catch (err) {
    console.warn('[AccountAuth] status check failed:', err);
    return { configured: false, signedIn: false, user: null };
  }
}

export function isSignedIn(status = cachedStatus) {
  return Boolean(status?.signedIn && status?.user?.id);
}

export function isAuthLive(status = cachedStatus) {
  return Boolean(status?.configured);
}

export async function requestCode(email, { termsAccepted = false } = {}) {
  const res = await fetch('/api/auth/request-code', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, termsAccepted })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'Could not send code');
  return data;
}

export async function verifyCode(email, code, { marketingOptIn = false, termsAccepted = true } = {}) {
  const res = await fetch('/api/auth/verify-code', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, marketingOptIn, termsAccepted })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'Invalid code');
  cachedStatus = { configured: true, signedIn: true, user: data.user };
  statusFetchedAt = Date.now();
  return data;
}

export async function logout() {
  const res = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include'
  });
  cachedStatus = { configured: true, signedIn: false, user: null };
  statusFetchedAt = Date.now();
  return res.ok;
}

export async function linkCurrentDevice() {
  const anonId = getAnonId() || getOrCreateAnonId();
  const res = await fetch('/api/account/link', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ anonId })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'Link failed');
  return data;
}

export async function fetchAccountMe() {
  const res = await fetch('/api/account/me', { credentials: 'include' });
  if (!res.ok) return null;
  return res.json();
}

export async function signInAndLink(email, code, { marketingOptIn = false, termsAccepted = true } = {}) {
  await verifyCode(email, code, { marketingOptIn, termsAccepted });
  await linkCurrentDevice();
  try {
    const { uploadLocalProgress } = await import('./account-progress.js');
    await uploadLocalProgress();
  } catch {
    // progress sync optional until endpoint exists
  }
  return fetchAuthStatus({ force: true });
}

export function invalidateAuthCache() {
  cachedStatus = null;
  statusFetchedAt = 0;
}
