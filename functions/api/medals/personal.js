// GET /api/medals/personal?anonId=<uuid> OR ?userId=<uuid>
// Returns dynamic medal counts computed from current leaderboard positions (live rank policy).

import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';
import { validateUUID } from '../../_shared/validation-helpers.js';
import { personalMedalsRankSql } from '../../_shared/score-identity.js';

const GAME_TABLES = [
  { id: 'bits', table: 'bits_scores' },
  { id: 'hashi', table: 'hashi_scores' },
  { id: 'snake', table: 'snake_scores' },
  { id: 'shikaku', table: 'shikaku_scores' },
  { id: 'pathways', table: 'pathways_scores' },
  { id: 'lattice', table: 'lattice_scores' },
  { id: 'conduit', table: 'conduit_scores' },
  { id: 'perimeter', table: 'perimeter_scores' },
  { id: 'polyfit', table: 'polyfit_scores' },
  { id: 'tiles', table: 'tiles_scores' },
  { id: 'harbor', table: 'harbor_scores' }
];

async function countMedalsForIdentity(db, { userId, anonId }) {
  const counts = { gold: 0, silver: 0, bronze: 0, top10: 0 };

  const identityWhere = userId
    ? `(d.user_id = ?1 OR d.anon_id IN (SELECT anon_id FROM user_anon_links WHERE user_id = ?1))`
    : `d.anon_id = ?1`;
  const bindValue = userId || anonId;

  await Promise.all(
    GAME_TABLES.map(async ({ table }) => {
      try {
        const result = await db.prepare(
          personalMedalsRankSql(table, identityWhere)
        ).bind(bindValue).all();

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

  return counts;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'GET') return methodNotAllowed('GET');

  try {
    validateEnv(env);

    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const anonId = url.searchParams.get('anonId');

    if (userId) {
      if (!validateUUID(userId)) return jsonError('Invalid userId');
      const counts = await countMedalsForIdentity(env.DB, { userId });
      return jsonOk({ userId, counts });
    }

    if (!validateUUID(anonId)) return jsonError('Invalid or missing anonId');
    const counts = await countMedalsForIdentity(env.DB, { anonId });
    return jsonOk({ anonId, counts });
  } catch (err) {
    return internalError(err, 'Medals personal');
  }
}
