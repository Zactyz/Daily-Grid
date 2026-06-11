// POST /api/account/link — link current browser anon_id to signed-in user
import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';
import { getSessionUser, linkAnonToUser } from '../../_shared/auth-helpers.js';
import { validateUUID } from '../../_shared/validation-helpers.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return methodNotAllowed('POST');

  try {
    validateEnv(env);
    const session = await getSessionUser(env.DB, request);
    if (!session) return jsonError('Not signed in', 401);

    const body = await request.json();
    const anonId = typeof body.anonId === 'string' ? body.anonId.trim() : '';
    if (!validateUUID(anonId)) return jsonError('Invalid anonId', 400);

    await linkAnonToUser(env.DB, session.userId, anonId);

    return jsonOk({ success: true, linkedAnonId: anonId });
  } catch (err) {
    return internalError(err, 'Account link');
  }
}
