// Shared score submission and rank calculation for Cloudflare Function API handlers

/**
 * Submit or retrieve an existing score, then compute rank/percentile/total.
 * @param {D1Database} db - Cloudflare D1 binding
 * @param {string} table - e.g. 'snake_scores'
 * @param {string} puzzleId
 * @param {string} anonId
 * @param {number} timeMs
 * @param {number} hintsUsed
 * @returns {{ rank, percentile, total }}
 */
export async function submitAndRank(db, table, puzzleId, anonId, timeMs, hintsUsed = 0) {
  const existing = await db.prepare(
    `SELECT time_ms FROM ${table} WHERE puzzle_id = ?1 AND anon_id = ?2`
  ).bind(puzzleId, anonId).first();

  let userTime = timeMs;

  if (existing) {
    userTime = existing.time_ms;
  } else {
    await db.prepare(
      `INSERT INTO ${table} (puzzle_id, anon_id, time_ms, hints_used) VALUES (?1, ?2, ?3, ?4)`
    ).bind(puzzleId, anonId, timeMs, hintsUsed).run();
  }

  const fasterResult = await db.prepare(
    `SELECT COUNT(*) as count FROM ${table} WHERE puzzle_id = ?1 AND time_ms < ?2`
  ).bind(puzzleId, userTime).first();

  const totalResult = await db.prepare(
    `SELECT COUNT(*) as count FROM ${table} WHERE puzzle_id = ?1`
  ).bind(puzzleId).first();

  const fasterCount = fasterResult?.count ?? 0;
  const total = totalResult?.count ?? 1;
  const rank = fasterCount + 1;
  const percentile = Math.floor(((total - rank) / Math.max(total, 1)) * 100);

  return { rank, percentile, total };
}
