// POST /api/push/cleanup
// Prunes old push run telemetry rows.
// Body: { days?: number }
// Requires header: x-push-secret

import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';

const DEFAULT_DAYS = 90;

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return methodNotAllowed('POST');

  const secret = request.headers.get('x-push-secret');
  if (!env.PUSH_SECRET || secret !== env.PUSH_SECRET) {
    return jsonError('Unauthorized', 401);
  }

  try {
    validateEnv(env);

    const body = await request.json().catch(() => ({}));
    const daysRaw = Number(body?.days ?? DEFAULT_DAYS);
    const days = Number.isFinite(daysRaw) ? Math.max(7, Math.min(365, Math.floor(daysRaw))) : DEFAULT_DAYS;
    const source = body?.source === 'cron' ? 'cron' : 'manual';

    const before = await env.DB.prepare(`SELECT COUNT(*) AS total FROM push_runs`).first();

    const del = await env.DB.prepare(
      `DELETE FROM push_runs WHERE created_at < datetime('now', ?1)`
    ).bind(`-${days} days`).run();

    const after = await env.DB.prepare(`SELECT COUNT(*) AS total FROM push_runs`).first();

    // Record cleanup run in telemetry (best-effort).
    await env.DB.prepare(
      `INSERT INTO push_runs (run_type, source, sent, failed, expired, skipped, eligible, details)
       VALUES ('cleanup', ?1, 0, 0, 0, 0, 0, ?2)`
    ).bind(source, JSON.stringify({ days, deleted: del.meta?.changes || 0, before: before?.total || 0, after: after?.total || 0 })).run()
      .catch(() => {});

    return jsonOk({
      days,
      deleted: del.meta?.changes || 0,
      before: before?.total || 0,
      after: after?.total || 0,
    });
  } catch (err) {
    return internalError(err, 'Push cleanup');
  }
}
