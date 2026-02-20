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
    const { endpoint, p256dh, auth, anonId } = body;

    if (!endpoint || typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
      return jsonError('Invalid endpoint');
    }
    if (!p256dh || typeof p256dh !== 'string') return jsonError('Missing p256dh');
    if (!auth || typeof auth !== 'string') return jsonError('Missing auth');
    if (!validateUUID(anonId)) return jsonError('Invalid anon ID');

    // Upsert subscription (update keys if endpoint already exists)
    await env.DB.prepare(`
      INSERT INTO push_subscriptions (anon_id, endpoint, p256dh, auth)
      VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(endpoint) DO UPDATE SET
        anon_id = excluded.anon_id,
        p256dh  = excluded.p256dh,
        auth    = excluded.auth,
        updated_at = datetime('now')
    `).bind(anonId, endpoint, p256dh, auth).run();

    return jsonOk({ success: true });
  } catch (err) {
    return internalError(err, 'Push subscribe');
  }
}
