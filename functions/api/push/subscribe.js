// POST /api/push/subscribe
// Saves a Web Push subscription to D1.
// Body: { endpoint, p256dh, auth, anonId }

import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';
import { validateUUID } from '../../_shared/validation-helpers.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return methodNotAllowed('POST');

  try {
    validateEnv(env);

    const body = await request.json();
    const { endpoint, p256dh, auth, anonId, timezone } = body;

    if (!endpoint || typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
      return jsonError('Invalid endpoint');
    }
    if (!p256dh || typeof p256dh !== 'string') return jsonError('Missing p256dh');
    if (!auth || typeof auth !== 'string') return jsonError('Missing auth');
    if (!validateUUID(anonId)) return jsonError('Invalid anon ID');

    // Accept a timezone string from the client for future timezone-aware notifications.
    // Validate loosely: must be a non-empty string (IANA timezone, e.g. "America/New_York").
    const tz = typeof timezone === 'string' && timezone.length > 0 ? timezone : 'America/Los_Angeles';

    // Upsert subscription (update keys if endpoint already exists)
    await env.DB.prepare(`
      INSERT INTO push_subscriptions (anon_id, endpoint, p256dh, auth, timezone)
      VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(endpoint) DO UPDATE SET
        anon_id    = excluded.anon_id,
        p256dh     = excluded.p256dh,
        auth       = excluded.auth,
        timezone   = excluded.timezone,
        updated_at = datetime('now')
    `).bind(anonId, endpoint, p256dh, auth, tz).run();

    return jsonOk({ success: true });
  } catch (err) {
    return internalError(err, 'Push subscribe');
  }
}
