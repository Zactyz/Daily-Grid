// Shared claim-initials helper for Cloudflare Function API handlers

/**
 * Claim initials for an existing score row.
 * Validates ownership via anonId and enforces a 10-minute claim window.
 * @param {D1Database} db
 * @param {string} table - e.g. 'snake_scores'
 * @param {string} puzzleId
 * @param {string} anonId
 * @param {string} initials - already validated uppercase 1-3 chars
 * @returns {{ success: true } | { error: string, status: number }}
 */
export async function claimInitials(db, table, puzzleId, anonId, initials) {
  const scoreCheck = await db.prepare(
    `SELECT created_at FROM ${table} WHERE puzzle_id = ?1 AND anon_id = ?2`
  ).bind(puzzleId, anonId).first();

  if (!scoreCheck) {
    return { error: 'Score not found', status: 404 };
  }

  const scoreTime = new Date(scoreCheck.created_at).getTime();
  if (Date.now() - scoreTime > 600_000) {
    return { error: 'Claim window expired (10 minutes)', status: 403 };
  }

  const result = await db.prepare(
    `UPDATE ${table} SET initials = ?1 WHERE puzzle_id = ?2 AND anon_id = ?3`
  ).bind(initials, puzzleId, anonId).run();

  if (result.meta.changes === 0) {
    return { error: 'Failed to update initials', status: 500 };
  }

  return { success: true };
}
