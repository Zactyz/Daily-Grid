// Shared score submission and rank calculation for Cloudflare Function API handlers

import { getSessionUser } from './auth-helpers.js';
import { findAccountScore, computeDedupedRank } from './score-identity.js';

/** Optional signed-in user from session cookie on score submit. */
export async function resolveSubmitUserId(db, request) {
  try {
    const session = await getSessionUser(db, request);
    return session?.userId || null;
  } catch {
    return null;
  }
}

/**
 * Submit or retrieve an existing score, then compute rank/percentile/total.
 * One score per account per puzzle: first submission wins (earliest created_at).
 * @param {D1Database} db - Cloudflare D1 binding
 * @param {string} table - e.g. 'snake_scores'
 * @param {string} puzzleId
 * @param {string} anonId
 * @param {number} timeMs
 * @param {number} hintsUsed
 * @param {string|null} userId - optional account id from session
 * @returns {{ rank, percentile, total }}
 */
export async function submitAndRank(db, table, puzzleId, anonId, timeMs, hintsUsed = 0, userId = null) {
  const existing = await findAccountScore(db, table, puzzleId, { userId, anonId });

  let userTime = timeMs;

  if (existing) {
    userTime = existing.time_ms;
    if (userId && existing.anon_id === anonId) {
      await db.prepare(
        `UPDATE ${table} SET user_id = ?1 WHERE puzzle_id = ?2 AND anon_id = ?3 AND (user_id IS NULL OR user_id = ?1)`
      ).bind(userId, puzzleId, anonId).run();
    }
  } else {
    if (userId) {
      await db.prepare(
        `INSERT INTO ${table} (puzzle_id, anon_id, user_id, time_ms, hints_used) VALUES (?1, ?2, ?3, ?4, ?5)`
      ).bind(puzzleId, anonId, userId, timeMs, hintsUsed).run();
    } else {
      await db.prepare(
        `INSERT INTO ${table} (puzzle_id, anon_id, time_ms, hints_used) VALUES (?1, ?2, ?3, ?4)`
      ).bind(puzzleId, anonId, timeMs, hintsUsed).run();
    }
  }

  return computeDedupedRank(db, table, puzzleId, userTime);
}
