// Shared leaderboard query helper for Cloudflare Function API handlers

/**
 * Fetch the top 3 scores for a puzzle.
 * @param {D1Database} db
 * @param {string} table - e.g. 'snake_scores'
 * @param {string} puzzleId
 * @returns {{ top3: Array, total: number }}
 */
export async function fetchLeaderboard(db, table, puzzleId) {
  const top3Result = await db.prepare(
    `SELECT time_ms, initials, hints_used FROM ${table} WHERE puzzle_id = ?1 ORDER BY time_ms ASC LIMIT 3`
  ).bind(puzzleId).all();

  const totalResult = await db.prepare(
    `SELECT COUNT(*) as count FROM ${table} WHERE puzzle_id = ?1`
  ).bind(puzzleId).first();

  const top3 = (top3Result.results || []).map((row, idx) => ({
    rank: idx + 1,
    timeMs: row.time_ms,
    initials: row.initials || null,
    hintsUsed: row.hints_used,
  }));

  return { top3, total: totalResult?.count ?? 0 };
}
