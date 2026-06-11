// GET/POST /api/account/progress — sync local streak/stats JSON for signed-in users
import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';
import { getSessionUser } from '../../_shared/auth-helpers.js';

function mergeProgress(existing, incoming) {
  const base = existing?.games ? { ...existing } : { games: {}, exportedAt: null };
  const merged = { games: { ...base.games }, exportedAt: incoming.exportedAt || new Date().toISOString() };

  for (const [gameId, data] of Object.entries(incoming.games || {})) {
    const prev = merged.games[gameId] || {};
    const prevStats = prev.stats || {};
    const nextStats = data.stats || {};
    const prevStreak = prev.streak || {};
    const nextStreak = data.streak || {};

    merged.games[gameId] = {
      stats: {
        totalCompleted: Math.max(prevStats.totalCompleted || 0, nextStats.totalCompleted || 0),
        totalTimeMs: Math.max(prevStats.totalTimeMs || 0, nextStats.totalTimeMs || 0),
        timeSamples: Math.max(prevStats.timeSamples || 0, nextStats.timeSamples || 0),
        lastRecordedDate: [prevStats.lastRecordedDate, nextStats.lastRecordedDate].filter(Boolean).sort().pop() || null
      },
      streak: {
        current: Math.max(prevStreak.current || 0, nextStreak.current || 0),
        best: Math.max(prevStreak.best || 0, nextStreak.best || 0),
        lastCompletedDate: [prevStreak.lastCompletedDate, nextStreak.lastCompletedDate].filter(Boolean).sort().pop() || null
      }
    };
  }

  return merged;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    validateEnv(env);
    const session = await getSessionUser(env.DB, request);
    if (!session) return jsonError('Not signed in', 401);

    if (request.method === 'GET') {
      const row = await env.DB.prepare(
        `SELECT progress_json AS progressJson, updated_at AS updatedAt FROM user_progress WHERE user_id = ?1`
      ).bind(session.userId).first();

      let progress = null;
      if (row?.progressJson) {
        try { progress = JSON.parse(row.progressJson); } catch { progress = null; }
      }
      return jsonOk({ progress, updatedAt: row?.updatedAt || null });
    }

    if (request.method === 'POST') {
      const incoming = await request.json();
      if (!incoming || typeof incoming !== 'object') return jsonError('Invalid progress payload', 400);

      const row = await env.DB.prepare(
        `SELECT progress_json FROM user_progress WHERE user_id = ?1`
      ).bind(session.userId).first();

      let existing = null;
      if (row?.progress_json) {
        try { existing = JSON.parse(row.progress_json); } catch { existing = null; }
      }

      const merged = mergeProgress(existing, incoming);
      await env.DB.prepare(
        `INSERT INTO user_progress (user_id, progress_json, updated_at)
         VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET progress_json = excluded.progress_json, updated_at = excluded.updated_at`
      ).bind(session.userId, JSON.stringify(merged)).run();

      return jsonOk({ success: true, progress: merged });
    }

    return methodNotAllowed('GET, POST');
  } catch (err) {
    return internalError(err, 'Account progress');
  }
}
