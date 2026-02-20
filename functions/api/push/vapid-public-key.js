// GET /api/push/vapid-public-key
// Returns the VAPID public key so the client can subscribe.
// Safe to expose publicly — only the private key must stay secret.

import { handleOptions, methodNotAllowed, jsonOk, validateEnv } from '../../_shared/api-helpers.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'GET') return methodNotAllowed('GET');

  if (!env.VAPID_PUBLIC_KEY) {
    return jsonOk({ publicKey: null });
  }

  return jsonOk({ publicKey: env.VAPID_PUBLIC_KEY });
}
