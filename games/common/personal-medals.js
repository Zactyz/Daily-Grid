import { GAME_META } from './games.js';
import { getAnonId } from './utils.js';

/** Live rank policy: server recomputes ranks from D1 (see /api/medals/personal). */
export function countPersonalMedalsFromLocalCache(gameIds = null) {
  const ids = gameIds || GAME_META.map((g) => g.id);
  const counts = { gold: 0, silver: 0, bronze: 0, top10: 0 };
  for (const gameId of ids) {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`dailygrid_${gameId}_leaderboard_`)) continue;
      if (key.includes('_leaderboard_seen_')) continue;
      try {
        const entry = JSON.parse(localStorage.getItem(key));
        const rank = Number(entry?.rank);
        if (!Number.isFinite(rank)) continue;
        if (rank === 1) counts.gold += 1;
        else if (rank === 2) counts.silver += 1;
        else if (rank === 3) counts.bronze += 1;
        if (rank <= 10) counts.top10 += 1;
      } catch {
        // ignore bad cache entries
      }
    }
  }
  return counts;
}

/**
 * Fetch medal counts from the server (live ranks), with localStorage fallback.
 */
export async function fetchPersonalMedals({ anonId = getAnonId(), userId = null } = {}) {
  const query = userId
    ? `userId=${encodeURIComponent(userId)}`
    : anonId
      ? `anonId=${encodeURIComponent(anonId)}`
      : null;

  if (!query) return countPersonalMedalsFromLocalCache();

  try {
    const res = await fetch(`/api/medals/personal?${query}`, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data?.counts || countPersonalMedalsFromLocalCache();
  } catch (err) {
    console.warn('[PersonalMedals] API fallback to local cache:', err);
    return countPersonalMedalsFromLocalCache();
  }
}
