// GET /api/push/runs?limit=50&type=daily|streak|winback|cleanup
// Returns recent push run telemetry rows.
// Requires header: x-push-secret

import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';

const ALLOWED_TYPES = new Set(['daily', 'streak', 'winback', 'cleanup']);

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'GET') return methodNotAllowed('GET');

  const secret = request.headers.get('x-push-secret');
  if (!env.PUSH_SECRET || secret !== env.PUSH_SECRET) {
    return jsonError('Unauthorized', 401);
  }

  try {
    validateEnv(env);

    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get('limit') || '50');
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 50;
    const type = (url.searchParams.get('type') || '').trim();

    if (type && !ALLOWED_TYPES.has(type)) {
      return jsonError('Invalid type filter');
    }

    let rows;
    if (type) {
      const result = await env.DB.prepare(
        `SELECT id, run_type, source, sent, failed, expired, skipped, eligible, details, created_at
         FROM push_runs
         WHERE run_type = ?1
         ORDER BY id DESC
         LIMIT ?2`
      ).bind(type, limit).all();
      rows = result.results || [];
    } else {
      const result = await env.DB.prepare(
        `SELECT id, run_type, source, sent, failed, expired, skipped, eligible, details, created_at
         FROM push_runs
         ORDER BY id DESC
         LIMIT ?1`
      ).bind(limit).all();
      rows = result.results || [];
    }

    return jsonOk({ count: rows.length, rows });
  } catch (err) {
    return internalError(err, 'Push runs');
  }
}
