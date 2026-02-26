import { getPTDateYYYYMMDD } from './utils.js';

const KEY = (gameId) => `dailygrid_${gameId}_streak`;

/**
 * Read streak data for a game. Returns { current, best, lastCompletedDate }.
 */
export function getStreak(gameId) {
  try {
    const raw = localStorage.getItem(KEY(gameId));
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { current: 0, best: 0, lastCompletedDate: null };
}

/**
 * Record a daily completion for a game.
 * Must only be called once per daily puzzle (idempotent for same date).
 * Returns the updated streak object.
 */
export function recordStreak(gameId) {
  const today = getPTDateYYYYMMDD();
  const data = getStreak(gameId);

  if (data.lastCompletedDate === today) {
    return data; // already recorded for today
  }

  const yesterday = getPTYesterdayYYYYMMDD();
  if (data.lastCompletedDate === yesterday) {
    data.current += 1;
  } else {
    data.current = 1;
  }
  data.best = Math.max(data.best, data.current);
  data.lastCompletedDate = today;

  try {
    localStorage.setItem(KEY(gameId), JSON.stringify(data));
  } catch { /* ignore storage errors */ }

  return data;
}

/**
 * Returns yesterday's date in Pacific Time as YYYY-MM-DD.
 * Uses Intl (same approach as getPTDateYYYYMMDD) for consistency.
 */
function getPTYesterdayYYYYMMDD() {
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
  return getPTDateYYYYMMDD(yesterday);
}

/**
 * Returns milliseconds to add to UTC to get Pacific Time.
 * Approximates DST: PDT (UTC-7) from mid-March to early November, PST (UTC-8) otherwise.
 */
function getPTOffsetMs() {
  const now = new Date();
  const year = now.getUTCFullYear();
  // Second Sunday in March: 2 AM PST = 10 UTC
  const dstStart = getNthSundayOfMonth(year, 3, 2, 10);
  // First Sunday in November: 2 AM PDT = 9 UTC
  const dstEnd = getNthSundayOfMonth(year, 11, 1, 9);
  const isPDT = now >= dstStart && now < dstEnd;
  return isPDT ? -7 * 3600 * 1000 : -8 * 3600 * 1000;
}

function getNthSundayOfMonth(year, month, n, utcHour = 10) {
  // month: 1-12. utcHour: 2 AM local in Pacific (10 UTC for PST, 9 UTC for PDT).
  const d = new Date(Date.UTC(year, month - 1, 1));
  // Move to first Sunday
  d.setUTCDate(1 + ((7 - d.getUTCDay()) % 7));
  // Move to nth Sunday
  d.setUTCDate(d.getUTCDate() + (n - 1) * 7);
  d.setUTCHours(utcHour, 0, 0, 0);
  return d;
}

/**
 * Returns milliseconds until midnight Pacific Time (next day's puzzle).
 * Uses getPTDateYYYYMMDD (Intl) for the current PT date, then computes the UTC
 * timestamp for next PT midnight (08:00 UTC in PST, 07:00 UTC in PDT).
 */
export function getMsUntilPTMidnight() {
  const today = getPTDateYYYYMMDD();
  const [y, m, d] = today.split('-').map(Number);
  const ptOffset = getPTOffsetMs();
  const hourOffset = Math.round(-ptOffset / (3600 * 1000));
  const nextMidnightUTC = Date.UTC(y, m - 1, d + 1, hourOffset, 0, 0, 0);
  return nextMidnightUTC - Date.now();
}

/**
 * Formats milliseconds as "Xh Ym" or "Ym" etc.
 */
export function formatCountdown(ms) {
  if (ms <= 0) return '0m';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
