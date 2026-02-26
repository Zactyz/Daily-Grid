// POST /api/push/unsubscribe
// Removes a Web Push subscription from D1.
// Body: { endpoint }

import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return methodNotAllowed('POST');

  try {
    validateEnv(env);

    const { endpoint } = await request.json();
    if (!endpoint || typeof endpoint !== 'string') return jsonError('Missing endpoint');

    await env.DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?1`)
      .bind(endpoint).run();

    return jsonOk({ success: true });
  } catch (err) {
    return internalError(err, 'Push unsubscribe');
  }
}
