export function getPTDateYYYYMMDD(now = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = dtf.formatToParts(now);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

export function validateUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/** Read-only version — never creates an ID; returns null if not set. */
export function getAnonId() {
  try { return localStorage.getItem('dailygrid_anon_id'); } catch { return null; }
}

export function getOrCreateAnonId() {
  const key = 'dailygrid_anon_id';
  let anonId = localStorage.getItem(key);
  
  if (!anonId || !validateUUID(anonId)) {
    anonId = generateUUID();
    try {
      localStorage.setItem(key, anonId);
    } catch (error) {
      console.warn('Failed to save anon ID:', error);
    }
  }
  
  return anonId;
}

export function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Like formatTime but returns '—' for invalid values and
 * shows "Xs" (e.g. "45s") for sub-minute times. Used by hub/leaderboard pages.
 */
export function formatTimeShort(ms) {
  if (!ms || ms <= 0) return '—';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m > 0) return `${m}:${String(sec).padStart(2, '0')}`;
  return `${sec}s`;
}

export function createSeededRandom(seed) {
  let state = seed;
  return function() {
    state |= 0;
    state = state + 0x6D2B79F5 | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash | 0;
  }
  return Math.abs(hash);
}

export function normalizeWall(a, b) {
  const [ax, ay] = a;
  const [bx, by] = b;
  const s1 = `${ax},${ay}`;
  const s2 = `${bx},${by}`;
  return (s1 < s2) ? `${s1}-${s2}` : `${s2}-${s1}`;
}

/**
 * Redirect to /games/ if the viewport is at least minWidth px wide.
 * Must be called synchronously (before first paint) to avoid FOUC.
 * Hub-only pages (medals, profile, practice) call this to skip mobile-only UI.
 */
export function redirectOnDesktop(minWidth = 768) {
  if (window.matchMedia(`(min-width: ${minWidth}px)`).matches) {
    window.location.replace('/games/');
  }
}

/**
 * Reads ?practice=1 or ?mode=practice from the URL and calls
 * window.startPracticeMode() once the game has initialized.
 * Games must expose window.startPracticeMode before calling this.
 */
export function initPracticeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('practice') === '1' || params.get('mode') === 'practice') {
    const start = () => window.startPracticeMode?.();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0), { once: true });
    } else {
      setTimeout(start, 0);
    }
  }
}

const PLAYER_INITIALS_KEY = 'dailygrid_player_initials';
const INITIALS_PROMPT_SEEN_KEY = 'dailygrid_initials_prompt_seen';
const COMPLETIONS_WITHOUT_INITIALS_KEY = 'dailygrid_completions_without_initials';

export function getPlayerInitials() {
  try {
    const v = localStorage.getItem(PLAYER_INITIALS_KEY);
    if (!v) return null;
    const trimmed = v.toUpperCase().trim();
    return /^[A-Z]{1,3}$/.test(trimmed) ? trimmed : null;
  } catch {
    return null;
  }
}

export function setPlayerInitials(initials) {
  const trimmed = String(initials || '').toUpperCase().trim();
  if (!/^[A-Z]{1,3}$/.test(trimmed)) return false;
  try {
    localStorage.setItem(PLAYER_INITIALS_KEY, trimmed);
    return true;
  } catch {
    return false;
  }
}

export function hasPlayerInitials() {
  return Boolean(getPlayerInitials());
}

export function getCompletionsWithoutInitials() {
  try {
    return Number(localStorage.getItem(COMPLETIONS_WITHOUT_INITIALS_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function incrementCompletionsWithoutInitials() {
  try {
    const next = getCompletionsWithoutInitials() + 1;
    localStorage.setItem(COMPLETIONS_WITHOUT_INITIALS_KEY, String(next));
    return next;
  } catch {
    return 0;
  }
}

export function markInitialsPromptSeen() {
  try {
    localStorage.setItem(INITIALS_PROMPT_SEEN_KEY, '1');
  } catch {
    // ignore
  }
}

export function hasSeenInitialsPrompt() {
  try {
    return localStorage.getItem(INITIALS_PROMPT_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}
