// GET /api/medals/leaderboard?puzzleId=YYYY-MM-DD&scope=everyone|friends&gameId=&full=1
// Default: top 3 per game. full=1 + gameId: all entries for one game (for expanded view).

import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';
import { validatePuzzleId } from '../../_shared/validation-helpers.js';
import { getSessionUser, getFriendUserIds, getFriendAnonIds } from '../../_shared/auth-helpers.js';
import { dedupedScoresSelect, dedupedSolverCountSelect } from '../../_shared/score-identity.js';

const GAME_TABLES = [
  { id: 'bits',       table: 'bits_scores',       name: 'Bits'       },
  { id: 'hashi',      table: 'hashi_scores',       name: 'Bridges' },
  { id: 'snake',      table: 'snake_scores',       name: 'Snake'      },
  { id: 'shikaku',    table: 'shikaku_scores',     name: 'Parcel'     },
  { id: 'pathways',   table: 'pathways_scores',    name: 'Pathways'   },
  { id: 'lattice',    table: 'lattice_scores',     name: 'Logice'     },
  { id: 'conduit',    table: 'conduit_scores',     name: 'Conduit'    },
  { id: 'perimeter',  table: 'perimeter_scores',   name: 'Perimeter'  },
  { id: 'polyfit',    table: 'polyfit_scores',     name: 'Polyfit'    },
  { id: 'tiles',      table: 'tiles_scores',       name: 'Tiles'      },
  { id: 'harbor',     table: 'harbor_scores',      name: 'BlindSlide' },
];

const GAME_BY_ID = Object.fromEntries(GAME_TABLES.map((g) => [g.id, g]));

function buildInClause(values, startIndex = 1) {
  if (!values.length) return { clause: 'NULL', binds: [] };
  const clause = values.map((_, i) => `?${startIndex + i}`).join(', ');
  return { clause, binds: values };
}

async function resolveFriendsFilter(db, userId) {
  const friendUserIds = await getFriendUserIds(db, userId);
  const friendAnonIds = await getFriendAnonIds(db, userId);

  const userIds = [...new Set([...friendUserIds, userId])];

  const selfAnonResult = await db.prepare(
    `SELECT anon_id AS anonId FROM user_anon_links WHERE user_id = ?1`
  ).bind(userId).all();
  const selfAnonIds = (selfAnonResult.results || []).map((r) => r.anonId);
  const anonIds = [...new Set([...friendAnonIds, ...selfAnonIds])];

  return { friendUserIds: userIds, friendAnonIds: anonIds };
}

function mapEntryRows(rows) {
  return (rows || []).map((row, idx) => ({
    rank: idx + 1,
    timeMs: row.time_ms,
    initials: row.initials || null,
    anonId: row.anon_id,
    userId: row.user_id || null
  }));
}

async function fetchGameLeaderboard(db, { id, table, name }, puzzleId, friendsFilter, { entryLimit = 3 } = {}) {
  try {
    const limitSql = entryLimit ? `LIMIT ${Number(entryLimit)}` : '';

    if (friendsFilter) {
      const { friendUserIds, friendAnonIds } = friendsFilter;

      const userIn = buildInClause(friendUserIds, 2);
      const anonIn = buildInClause(friendAnonIds, 2 + userIn.binds.length);
      const conditions = [];
      const binds = [puzzleId];
      if (friendUserIds.length) {
        conditions.push(`user_id IN (${userIn.clause})`);
        binds.push(...userIn.binds);
      }
      if (friendAnonIds.length) {
        conditions.push(`anon_id IN (${anonIn.clause})`);
        binds.push(...anonIn.binds);
      }

      const whereExtra = conditions.length ? ` AND (${conditions.join(' OR ')})` : '';
      const topResult = await db.prepare(
        `SELECT time_ms, initials, anon_id, user_id
         FROM (${dedupedScoresSelect(table, '?1', whereExtra)}) deduped
         ORDER BY time_ms ASC
         ${limitSql}`
      ).bind(...binds).all();

      const countRow = await db.prepare(
        dedupedSolverCountSelect(table, '?1', whereExtra)
      ).bind(...binds).first();

      return {
        id,
        name,
        entries: mapEntryRows(topResult.results),
        totalSolvers: Number(countRow?.total || 0)
      };
    }

    const [topResult, countResult] = await Promise.all([
      db.prepare(
        `SELECT time_ms, initials, anon_id, user_id
         FROM (${dedupedScoresSelect(table, '?1')}) deduped
         ORDER BY time_ms ASC
         ${limitSql}`
      ).bind(puzzleId).all(),
      db.prepare(
        dedupedSolverCountSelect(table, '?1')
      ).bind(puzzleId).first()
    ]);

    return {
      id,
      name,
      entries: mapEntryRows(topResult.results),
      totalSolvers: Number(countResult?.total || 0)
    };
  } catch {
    return { id, name, entries: [], totalSolvers: 0 };
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'GET') return methodNotAllowed('GET');

  try {
    validateEnv(env);

    const url = new URL(request.url);
    const puzzleId = url.searchParams.get('puzzleId');
    const scope = url.searchParams.get('scope') || 'everyone';
    const gameId = url.searchParams.get('gameId');
    const full = url.searchParams.get('full') === '1';
    if (!validatePuzzleId(puzzleId)) return jsonError('Invalid or missing puzzleId');

    let friendsFilter = null;
    if (scope === 'friends') {
      const session = await getSessionUser(env.DB, request);
      if (!session) return jsonError('Sign in required for friends leaderboard', 401);
      friendsFilter = await resolveFriendsFilter(env.DB, session.userId);
    }

    const entryLimit = full ? null : 3;

    if (gameId) {
      const game = GAME_BY_ID[gameId];
      if (!game) return jsonError('Invalid gameId', 400);
      const result = await fetchGameLeaderboard(env.DB, game, puzzleId, friendsFilter, { entryLimit });
      return jsonOk({ puzzleId, scope, games: result.entries.length ? [result] : [] });
    }

    const gameResults = await Promise.all(
      GAME_TABLES.map((game) => fetchGameLeaderboard(env.DB, game, puzzleId, friendsFilter, { entryLimit }))
    );

    const gamesWithData = gameResults.filter((g) => g.entries.length > 0);

    return jsonOk({ puzzleId, scope, games: gamesWithData });
  } catch (err) {
    return internalError(err, 'Medals leaderboard');
  }
}
