// Shared leaderboard query helper for Cloudflare Function API handlers

/**
 * Fetch the top 10 scores for a puzzle.
 * @param {D1Database} db
 * @param {string} table - e.g. 'snake_scores'
 * @param {string} puzzleId
 * @returns {{ top10: Array, total: number }}
 */
export async function fetchLeaderboard(db, table, puzzleId) {
  const top10Result = await db.prepare(
    `SELECT time_ms, initials, hints_used FROM ${table} WHERE puzzle_id = ?1 ORDER BY time_ms ASC LIMIT 10`
  ).bind(puzzleId).all();

  const totalResult = await db.prepare(
    `SELECT COUNT(*) as count FROM ${table} WHERE puzzle_id = ?1`
  ).bind(puzzleId).first();

  const top10 = (top10Result.results || []).map((row, idx) => ({
    rank: idx + 1,
    timeMs: row.time_ms,
    initials: row.initials || null,
    hintsUsed: row.hints_used,
  }));

  return { top10, total: totalResult?.count ?? 0 };
}
