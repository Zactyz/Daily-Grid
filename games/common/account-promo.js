/**
 * Shared promotion helpers for optional account linking.
 */
import { fetchAuthStatus, isSignedIn, isAuthLive } from './account-auth.js';

export const BANNER_DISMISSED_KEY = 'dailygrid_account_banner_dismissed_v1';
export const INTRO_SEEN_KEY = 'dailygrid_account_intro_seen_v1';
export const NUDGE_DISMISSED_KEY = 'dailygrid_account_nudge_dismissed_v1';
export const NUDGE_SESSION_KEY = 'dailygrid_account_nudge_shown_session';
export const COMPLETIONS_WITHOUT_ACCOUNT_KEY = 'dailygrid_completions_without_account';
export const NUDGE_RANDOM_CHANCE = 0.33;
export const NUDGE_THRESHOLD = 3;

let authReadyPromise = null;

export function getAuthReady() {
  if (!authReadyPromise) authReadyPromise = fetchAuthStatus();
  return authReadyPromise;
}

export async function shouldShowAccountPromo() {
  const status = await getAuthReady();
  return isAuthLive(status) && !isSignedIn(status);
}

export function isBannerDismissed() {
  try { return localStorage.getItem(BANNER_DISMISSED_KEY) === '1'; } catch { return false; }
}

export function dismissBanner() {
  try { localStorage.setItem(BANNER_DISMISSED_KEY, '1'); } catch { /* ignore */ }
}

export function hasSeenAccountIntro() {
  try { return localStorage.getItem(INTRO_SEEN_KEY) === '1'; } catch { return false; }
}

export function markAccountIntroSeen() {
  try { localStorage.setItem(INTRO_SEEN_KEY, '1'); } catch { /* ignore */ }
}

export function hasDismissedAccountNudge() {
  try { return localStorage.getItem(NUDGE_DISMISSED_KEY) === '1'; } catch { return false; }
}

export function markAccountNudgeDismissed() {
  try { localStorage.setItem(NUDGE_DISMISSED_KEY, '1'); } catch { /* ignore */ }
}

export function wasNudgeShownThisSession() {
  try { return sessionStorage.getItem(NUDGE_SESSION_KEY) === '1'; } catch { return false; }
}

export function markNudgeShownThisSession() {
  try { sessionStorage.setItem(NUDGE_SESSION_KEY, '1'); } catch { /* ignore */ }
}

export function getCompletionsWithoutAccount() {
  try { return Number(localStorage.getItem(COMPLETIONS_WITHOUT_ACCOUNT_KEY)) || 0; } catch { return 0; }
}

export function incrementCompletionsWithoutAccount() {
  try {
    const next = getCompletionsWithoutAccount() + 1;
    localStorage.setItem(COMPLETIONS_WITHOUT_ACCOUNT_KEY, String(next));
    return next;
  } catch {
    return 0;
  }
}

export function resetCompletionsWithoutAccount() {
  try { localStorage.setItem(COMPLETIONS_WITHOUT_ACCOUNT_KEY, '0'); } catch { /* ignore */ }
}

export async function isAccountNudgeEligible() {
  if (!(await shouldShowAccountPromo())) return false;
  if (hasDismissedAccountNudge()) return false;
  if (wasNudgeShownThisSession()) return false;
  if (getCompletionsWithoutAccount() < NUDGE_THRESHOLD) return false;
  return Math.random() < NUDGE_RANDOM_CHANCE;
}

export function openAccountLinkFlow() {
  window.location.href = '/games/profile/#link-account';
}
