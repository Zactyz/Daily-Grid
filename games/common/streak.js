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
 */
function getPTYesterdayYYYYMMDD() {
  const now = new Date();
  const ptOffset = getPTOffsetMs();
  const ptMs = now.getTime() + ptOffset;
  const ptDate = new Date(ptMs);
  // Subtract one day
  ptDate.setUTCDate(ptDate.getUTCDate() - 1);
  const y = ptDate.getUTCFullYear();
  const m = String(ptDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ptDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns milliseconds to add to UTC to get Pacific Time.
 * Approximates DST: PDT (UTC-7) from mid-March to early November, PST (UTC-8) otherwise.
 */
function getPTOffsetMs() {
  const now = new Date();
  const year = now.getUTCFullYear();
  // Second Sunday in March
  const dstStart = getNthSundayOfMonth(year, 2, 2); // March, 2nd Sunday
  // First Sunday in November
  const dstEnd = getNthSundayOfMonth(year, 10, 1); // November, 1st Sunday
  const isPDT = now >= dstStart && now < dstEnd;
  return isPDT ? -7 * 3600 * 1000 : -8 * 3600 * 1000;
}

function getNthSundayOfMonth(year, month, n) {
  // month: 1-12
  const d = new Date(Date.UTC(year, month - 1, 1));
  // Move to first Sunday
  d.setUTCDate(1 + ((7 - d.getUTCDay()) % 7));
  // Move to nth Sunday
  d.setUTCDate(d.getUTCDate() + (n - 1) * 7);
  // 2 AM local = 10:00 UTC (approximate)
  d.setUTCHours(10, 0, 0, 0);
  return d;
}

/**
 * Returns milliseconds until midnight Pacific Time (next day's puzzle).
 */
export function getMsUntilPTMidnight() {
  const now = new Date();
  const ptOffset = getPTOffsetMs();
  const ptMs = now.getTime() + ptOffset;
  const ptDate = new Date(ptMs);
  // Build next midnight explicitly using Date.UTC so day+1 overflow is unambiguous
  const nextMidnight = Date.UTC(
    ptDate.getUTCFullYear(),
    ptDate.getUTCMonth(),
    ptDate.getUTCDate() + 1   // Date.UTC handles month/year rollover automatically
  );
  return nextMidnight - ptMs;
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
