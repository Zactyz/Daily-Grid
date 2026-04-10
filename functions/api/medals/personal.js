// GET /api/medals/personal?anonId=<uuid>
// Returns dynamic medal counts computed from current leaderboard positions.

import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';
import { validateUUID } from '../../_shared/validation-helpers.js';

const GAME_TABLES = [
  { id: 'bits', table: 'bits_scores' },
  { id: 'hashi', table: 'hashi_scores' },
  { id: 'snake', table: 'snake_scores' },
  { id: 'shikaku', table: 'shikaku_scores' },
  { id: 'pathways', table: 'pathways_scores' },
  { id: 'lattice', table: 'lattice_scores' },
  { id: 'conduit', table: 'conduit_scores' },
  { id: 'perimeter', table: 'perimeter_scores' },
  { id: 'polyfit', table: 'polyfit_scores' }
];

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'GET') return methodNotAllowed('GET');

  try {
    validateEnv(env);

    const url = new URL(request.url);
    const anonId = url.searchParams.get('anonId');
    if (!validateUUID(anonId)) return jsonError('Invalid or missing anonId');

    const counts = { gold: 0, silver: 0, bronze: 0, top10: 0 };

    await Promise.all(
      GAME_TABLES.map(async ({ table }) => {
        try {
          const result = await env.DB.prepare(
            `SELECT
               s.puzzle_id AS puzzleId,
               1 + (
                 SELECT COUNT(*)
                 FROM ${table} t2
                 WHERE t2.puzzle_id = s.puzzle_id
                   AND t2.time_ms < s.time_ms
               ) AS rank
             FROM ${table} s
             WHERE s.anon_id = ?1`
          ).bind(anonId).all();

          for (const row of result.results || []) {
            const rank = Number(row.rank);
            if (!Number.isFinite(rank)) continue;
            if (rank === 1) counts.gold += 1;
            else if (rank === 2) counts.silver += 1;
            else if (rank === 3) counts.bronze += 1;
            if (rank <= 10) counts.top10 += 1;
          }
        } catch {
          // Table may not exist in some environments; ignore.
        }
      })
    );

    return jsonOk({ anonId, counts });
  } catch (err) {
    return internalError(err, 'Medals personal');
  }
}
