// GET /api/medals/leaderboard?puzzleId=YYYY-MM-DD
// Returns the top 3 players per game for a given day, plus a global medals count
// for each anon_id (across all time).

import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';
import { validatePuzzleId } from '../../_shared/validation-helpers.js';

// All game tables that participate in the medals leaderboard
const GAME_TABLES = [
  { id: 'bits',       table: 'bits_scores',       name: 'Bits'       },
  { id: 'hashi',      table: 'hashi_scores',       name: 'Bridgeworks' },
  { id: 'snake',      table: 'snake_scores',       name: 'Snake'      },
  { id: 'shikaku',    table: 'shikaku_scores',     name: 'Parcel'     },
  { id: 'pathways',   table: 'pathways_scores',    name: 'Pathways'   },
  { id: 'lattice',    table: 'lattice_scores',     name: 'Logice'     },
  { id: 'conduit',    table: 'conduit_scores',     name: 'Conduit'    },
  { id: 'perimeter',  table: 'perimeter_scores',   name: 'Perimeter'  },
  { id: 'polyfit',    table: 'polyfit_scores',     name: 'Polyfit'    },
];

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'GET') return methodNotAllowed('GET');

  try {
    validateEnv(env);

    const url = new URL(request.url);
    const puzzleId = url.searchParams.get('puzzleId');
    if (!validatePuzzleId(puzzleId)) return jsonError('Invalid or missing puzzleId');

    // Fetch top 3 per game in parallel
    const gameResults = await Promise.all(
      GAME_TABLES.map(async ({ id, table, name }) => {
        try {
          const result = await env.DB.prepare(
            `SELECT time_ms, initials, anon_id
             FROM ${table}
             WHERE puzzle_id = ?1
             ORDER BY time_ms ASC
             LIMIT 3`
          ).bind(puzzleId).all();

          const entries = (result.results || []).map((row, idx) => ({
            rank: idx + 1,
            timeMs: row.time_ms,
            initials: row.initials || null,
            anonId: row.anon_id,
          }));

          return { id, name, entries };
        } catch {
          // Table may not exist yet — return empty
          return { id, name, entries: [] };
        }
      })
    );

    // Filter to games that have at least one entry
    const gamesWithData = gameResults.filter(g => g.entries.length > 0);

    return jsonOk({ puzzleId, games: gamesWithData });
  } catch (err) {
    return internalError(err, 'Medals leaderboard');
  }
}
