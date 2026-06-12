/**
 * Friend code sharing (PWA) and invite deep links (?addFriend=CODE).
 */
import { shareWithFallback, showShareFeedback } from './share.js';
import { fetchAuthStatus, isSignedIn } from './account-auth.js';

const PENDING_KEY = 'dailygrid_pending_friend_code';
const URL_PARAM = 'addFriend';
const INVITE_PATH = '/games/profile/';

export function isStandalonePWA() {
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true
  );
}

export function normalizeFriendCode(code) {
  return String(code || '').trim().toUpperCase().replace(/[^0-9A-F]/g, '');
}

export function buildFriendInviteUrl(friendCode) {
  const code = normalizeFriendCode(friendCode);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://dailygrid.app';
  return `${origin}${INVITE_PATH}?${URL_PARAM}=${encodeURIComponent(code)}`;
}

export function buildFriendShareText(friendCode) {
  const code = normalizeFriendCode(friendCode);
  const url = buildFriendInviteUrl(code);
  return `${url}\nAdd me as a friend on Daily Grid Games using my friend code ${code}!`;
}

export function captureFriendInviteFromUrl() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(URL_PARAM) || params.get('friend');
  const code = normalizeFriendCode(raw);
  if (!code) return null;

  try {
    sessionStorage.setItem(PENDING_KEY, code);
  } catch { /* ignore */ }

  params.delete(URL_PARAM);
  params.delete('friend');
  const qs = params.toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', next);
  return code;
}

export function getPendingFriendCode() {
  try {
    return normalizeFriendCode(sessionStorage.getItem(PENDING_KEY) || '');
  } catch {
    return '';
  }
}

export function clearPendingFriendCode() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch { /* ignore */ }
}

export async function fetchMyFriendCode() {
  const res = await fetch('/api/friends/code', { credentials: 'include' });
  if (!res.ok) return null;
  const data = await res.json();
  return normalizeFriendCode(data.friendCode) || null;
}

export async function addFriendByCode(friendCode) {
  const code = normalizeFriendCode(friendCode);
  if (!code) throw new Error('Invalid friend code');

  const res = await fetch('/api/friends/request', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ friendCode: code })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not add friend');
  return data;
}

export async function shareMyFriendCode(buttonEl) {
  const code = await fetchMyFriendCode();
  if (!code) throw new Error('Sign in to share your friend code');

  await shareWithFallback({
    shareTitle: 'Daily Grid Games — Friend invite',
    shareText: buildFriendShareText(code),
    onCopy: () => showShareFeedback(buttonEl, 'Copied!'),
    onError: () => showShareFeedback(buttonEl, 'Copy failed', { durationMs: 2500 })
  });
}

/**
 * Wire a share button (PWA + signed-in only).
 * @param {HTMLElement|null} button
 */
export async function initFriendCodeShareButton(button) {
  if (!button) return;

  const status = await fetchAuthStatus();
  const show = isStandalonePWA() && isSignedIn(status);
  button.classList.toggle('hidden', !show);
  if (!show) return;

  if (button.dataset.friendShareBound === '1') return;
  button.dataset.friendShareBound = '1';

  button.addEventListener('click', async () => {
    const original = button.innerHTML;
    button.disabled = true;
    try {
      await shareMyFriendCode(button);
    } catch (err) {
      showShareFeedback(button, err.message || 'Could not share', { durationMs: 2500 });
      setTimeout(() => {
        button.innerHTML = original;
        button.disabled = false;
      }, 2500);
      return;
    }
    button.disabled = false;
  });
}

/**
 * Accept a pending invite after sign-in. Returns status message or null.
 */
export async function consumePendingFriendInvite({ signedIn } = {}) {
  const pending = getPendingFriendCode();
  if (!pending) return null;

  if (!signedIn) {
    return { needsSignIn: true, code: pending };
  }

  try {
    await addFriendByCode(pending);
    clearPendingFriendCode();
    return { success: true, message: 'Friend added from invite link.' };
  } catch (err) {
    clearPendingFriendCode();
    return { error: err.message || 'Could not add friend from invite.' };
  }
}
