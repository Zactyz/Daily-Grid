// GET /api/profile/summary?anonId= OR session cookie
import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';
import { validateUUID } from '../../_shared/validation-helpers.js';
import { getSessionUser } from '../../_shared/auth-helpers.js';
import { SCORE_TABLES, accountCompletionsCountSql } from '../../_shared/score-identity.js';

async function countDistinctCompletions(db, { userId, anonId }) {
  let total = 0;
  const identityWhere = userId
    ? `s.user_id = ?1 OR s.anon_id IN (SELECT anon_id FROM user_anon_links WHERE user_id = ?1)`
    : `s.anon_id = ?1`;
  const bindValue = userId || anonId;

  for (const table of SCORE_TABLES) {
    try {
      const row = await db.prepare(
        accountCompletionsCountSql(table, identityWhere)
      ).bind(bindValue).first();
      total += Number(row?.c || 0);
    } catch {
      // table may not exist
    }
  }
  return total;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'GET') return methodNotAllowed('GET');

  try {
    validateEnv(env);
    const session = await getSessionUser(env.DB, request);
    const url = new URL(request.url);
    const anonId = url.searchParams.get('anonId');

    if (session?.userId) {
      const serverCompleted = await countDistinctCompletions(env.DB, { userId: session.userId });
      const progressRow = await env.DB.prepare(
        `SELECT progress_json FROM user_progress WHERE user_id = ?1`
      ).bind(session.userId).first();

      let localAggregate = { totalCompleted: 0, totalStreak: 0 };
      if (progressRow?.progress_json) {
        try {
          const progress = JSON.parse(progressRow.progress_json);
          for (const data of Object.values(progress.games || {})) {
            localAggregate.totalCompleted += data?.stats?.totalCompleted || 0;
            localAggregate.totalStreak += data?.streak?.current || 0;
          }
        } catch { /* ignore */ }
      }

      return jsonOk({
        userId: session.userId,
        serverCompleted,
        syncedStats: localAggregate
      });
    }

    if (!validateUUID(anonId)) return jsonError('Invalid or missing anonId');
    const serverCompleted = await countDistinctCompletions(env.DB, { anonId });
    return jsonOk({ anonId, serverCompleted });
  } catch (err) {
    return internalError(err, 'Profile summary');
  }
}
