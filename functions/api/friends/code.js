// GET /api/friends/code
import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';
import { getSessionUser, friendCodeFromUserId } from '../../_shared/auth-helpers.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'GET') return methodNotAllowed('GET');

  try {
    validateEnv(env);
    const session = await getSessionUser(env.DB, request);
    if (!session) return jsonError('Not signed in', 401);

    return jsonOk({
      friendCode: friendCodeFromUserId(session.userId),
      userId: session.userId
    });
  } catch (err) {
    return internalError(err, 'Friends code');
  }
}
