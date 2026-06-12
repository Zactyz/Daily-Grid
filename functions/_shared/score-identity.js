/**
 * One canonical score per account per daily puzzle (first submission wins).
 * Account key: COALESCE(user_id, anon_id) — linked rows share user_id.
 */

export const SCORE_TABLES = [
  'bits_scores', 'hashi_scores', 'snake_scores', 'shikaku_scores', 'pathways_scores',
  'lattice_scores', 'conduit_scores', 'perimeter_scores', 'polyfit_scores', 'tiles_scores', 'harbor_scores',
];

/** SQL expression for the account identity column group. */
export const ACCOUNT_KEY_SQL = 'COALESCE(user_id, anon_id)';

/**
 * Inner subquery: one row per account (earliest created_at, then lowest id).
 * @param {string} table
 * @param {string} puzzleIdBind - e.g. '?1'
 * @param {string} [extraWhere] - e.g. " AND user_id IN (...)" (include leading space)
 */
export function dedupedScoresSelect(table, puzzleIdBind = '?1', extraWhere = '') {
  return `
    SELECT time_ms, initials, anon_id, user_id, hints_used, created_at, id
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY ${ACCOUNT_KEY_SQL}
          ORDER BY created_at ASC, id ASC
        ) AS _rn
      FROM ${table}
      WHERE puzzle_id = ${puzzleIdBind}${extraWhere}
    ) _dedup
    WHERE _rn = 1
  `;
}

/**
 * Count distinct accounts that solved a puzzle (deduped).
 */
export function dedupedSolverCountSelect(table, puzzleIdBind = '?1', extraWhere = '') {
  return `
    SELECT COUNT(*) AS total
    FROM (
      SELECT 1
      FROM (
        SELECT
          ROW_NUMBER() OVER (
            PARTITION BY ${ACCOUNT_KEY_SQL}
            ORDER BY created_at ASC, id ASC
          ) AS _rn
        FROM ${table}
        WHERE puzzle_id = ${puzzleIdBind}${extraWhere}
      ) _inner
      WHERE _rn = 1
    )
  `;
}

/**
 * Earliest submitted score for this account on a puzzle (any linked anon / user_id).
 */
export async function findAccountScore(db, table, puzzleId, { userId, anonId } = {}) {
  if (userId) {
    const row = await db.prepare(
      `SELECT id, time_ms, anon_id, user_id, created_at
       FROM ${table}
       WHERE puzzle_id = ?1
         AND (
           user_id = ?2
           OR anon_id IN (SELECT anon_id FROM user_anon_links WHERE user_id = ?2)
         )
       ORDER BY created_at ASC, id ASC
       LIMIT 1`
    ).bind(puzzleId, userId).first();
    if (row) return row;
  }

  if (anonId) {
    return db.prepare(
      `SELECT id, time_ms, anon_id, user_id, created_at
       FROM ${table}
       WHERE puzzle_id = ?1 AND anon_id = ?2`
    ).bind(puzzleId, anonId).first();
  }

  return null;
}

/**
 * Rank / percentile using deduped solvers for a puzzle.
 */
export async function computeDedupedRank(db, table, puzzleId, userTimeMs) {
  const dedupedSubquery = `
    SELECT time_ms
    FROM (
      SELECT time_ms,
        ROW_NUMBER() OVER (
          PARTITION BY ${ACCOUNT_KEY_SQL}
          ORDER BY created_at ASC, id ASC
        ) AS _rn
      FROM ${table}
      WHERE puzzle_id = ?1
    ) _dedup
    WHERE _rn = 1
  `;

  const fasterRow = await db.prepare(
    `SELECT COUNT(*) AS total FROM (${dedupedSubquery}) WHERE time_ms < ?2`
  ).bind(puzzleId, userTimeMs).first();

  const totalRow = await db.prepare(
    `SELECT COUNT(*) AS total FROM (${dedupedSubquery})`
  ).bind(puzzleId).first();

  const fasterCount = Number(fasterRow?.total ?? 0);
  const total = Math.max(Number(totalRow?.total ?? 0), 1);
  const rank = fasterCount + 1;
  const percentile = Math.floor(((total - rank) / total) * 100);

  return { rank, percentile, total };
}

/**
 * Remove duplicate rows for one user (keep earliest submission per puzzle).
 */
export async function dedupeScoresForUser(db, userId) {
  for (const table of SCORE_TABLES) {
    try {
      await db.prepare(
        `DELETE FROM ${table}
         WHERE id IN (
           SELECT id FROM (
             SELECT s.id,
               ROW_NUMBER() OVER (
                 PARTITION BY s.puzzle_id, ${ACCOUNT_KEY_SQL}
                 ORDER BY s.created_at ASC, s.id ASC
               ) AS rn
             FROM ${table} s
             WHERE s.user_id = ?1
                OR s.anon_id IN (SELECT anon_id FROM user_anon_links WHERE user_id = ?1)
           )
           WHERE rn > 1
         )`
      ).bind(userId, userId).run();
    } catch {
      // table or window fn may be unavailable in some environments
    }
  }
}

/**
 * Global one-time cleanup: drop duplicate account rows across all users.
 */
export async function dedupeAllScores(db) {
  for (const table of SCORE_TABLES) {
    try {
      await db.prepare(
        `DELETE FROM ${table}
         WHERE id IN (
           SELECT id FROM (
             SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY puzzle_id, ${ACCOUNT_KEY_SQL}
                 ORDER BY created_at ASC, id ASC
               ) AS rn
             FROM ${table}
           )
           WHERE rn > 1
         )`
      ).run();
    } catch {
      // ignore per-table failures
    }
  }
}

/**
 * SQL for personal medal ranks: one canonical row per account per puzzle, deduped global ranks.
 * @param {string} table
 * @param {string} identityWhereOnD - e.g. "d.anon_id = ?1" (uses alias d on canonical rows)
 */
export function personalMedalsRankSql(table, identityWhereOnD) {
  return `
    WITH deduped AS (
      SELECT puzzle_id, time_ms, user_id, anon_id,
        ROW_NUMBER() OVER (
          PARTITION BY puzzle_id, ${ACCOUNT_KEY_SQL}
          ORDER BY created_at ASC, id ASC
        ) AS _rn
      FROM ${table}
    ),
    canonical AS (
      SELECT puzzle_id, time_ms, user_id, anon_id
      FROM deduped
      WHERE _rn = 1
    ),
    mine AS (
      SELECT puzzle_id, time_ms
      FROM canonical d
      WHERE ${identityWhereOnD}
    )
    SELECT puzzle_id AS puzzleId,
      1 + (
        SELECT COUNT(*)
        FROM canonical c
        WHERE c.puzzle_id = mine.puzzle_id AND c.time_ms < mine.time_ms
      ) AS rank
    FROM mine
  `;
}
