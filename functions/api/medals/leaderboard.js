// GET /api/medals/leaderboard?puzzleId=YYYY-MM-DD&scope=everyone|friends
// Returns the top 3 players per game for a given day, plus total solver count per game.

import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';
import { validatePuzzleId } from '../../_shared/validation-helpers.js';
import { getSessionUser, getFriendUserIds, getFriendAnonIds } from '../../_shared/auth-helpers.js';

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

function buildInClause(values, startIndex = 1) {
  if (!values.length) return { clause: 'NULL', binds: [] };
  const clause = values.map((_, i) => `?${startIndex + i}`).join(', ');
  return { clause, binds: values };
}

async function resolveFriendsFilter(db, userId) {
  const friendUserIds = await getFriendUserIds(db, userId);
  const friendAnonIds = await getFriendAnonIds(db, userId);
  return { friendUserIds, friendAnonIds };
}

async function fetchGameLeaderboard(db, { id, table, name }, puzzleId, friendsFilter) {
  try {
    if (friendsFilter) {
      const { friendUserIds, friendAnonIds } = friendsFilter;
      if (!friendUserIds.length && !friendAnonIds.length) {
        return { id, name, entries: [], totalSolvers: 0 };
      }

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

      const whereExtra = conditions.length ? `AND (${conditions.join(' OR ')})` : '';
      const topResult = await db.prepare(
        `SELECT time_ms, initials, anon_id, user_id
         FROM ${table}
         WHERE puzzle_id = ?1 ${whereExtra}
         ORDER BY time_ms ASC
         LIMIT 3`
      ).bind(...binds).all();

      const countRow = await db.prepare(
        `SELECT COUNT(*) AS total FROM ${table} WHERE puzzle_id = ?1 ${whereExtra}`
      ).bind(...binds).first();

      const entries = (topResult.results || []).map((row, idx) => ({
        rank: idx + 1,
        timeMs: row.time_ms,
        initials: row.initials || null,
        anonId: row.anon_id,
        userId: row.user_id || null
      }));

      return {
        id,
        name,
        entries,
        totalSolvers: Number(countRow?.total || 0)
      };
    }

    const [topResult, countResult] = await Promise.all([
      db.prepare(
        `SELECT time_ms, initials, anon_id, user_id
         FROM ${table}
         WHERE puzzle_id = ?1
         ORDER BY time_ms ASC
         LIMIT 3`
      ).bind(puzzleId).all(),
      db.prepare(
        `SELECT COUNT(*) AS total FROM ${table} WHERE puzzle_id = ?1`
      ).bind(puzzleId).first()
    ]);

    const entries = (topResult.results || []).map((row, idx) => ({
      rank: idx + 1,
      timeMs: row.time_ms,
      initials: row.initials || null,
      anonId: row.anon_id,
      userId: row.user_id || null
    }));

    return {
      id,
      name,
      entries,
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
    if (!validatePuzzleId(puzzleId)) return jsonError('Invalid or missing puzzleId');

    let friendsFilter = null;
    if (scope === 'friends') {
      const session = await getSessionUser(env.DB, request);
      if (!session) return jsonError('Sign in required for friends leaderboard', 401);
      friendsFilter = await resolveFriendsFilter(env.DB, session.userId);
    }

    const gameResults = await Promise.all(
      GAME_TABLES.map((game) => fetchGameLeaderboard(env.DB, game, puzzleId, friendsFilter))
    );

    const gamesWithData = scope === 'friends'
      ? gameResults.filter((g) => g.entries.length > 0)
      : gameResults.filter((g) => g.entries.length > 0);

    return jsonOk({ puzzleId, scope, games: gamesWithData });
  } catch (err) {
    return internalError(err, 'Medals leaderboard');
  }
}
