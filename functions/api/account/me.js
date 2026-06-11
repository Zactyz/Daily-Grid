// GET /api/account/me
import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';
import { getSessionUser, maskEmail } from '../../_shared/auth-helpers.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'GET') return methodNotAllowed('GET');

  try {
    validateEnv(env);
    const session = await getSessionUser(env.DB, request);
    if (!session) return jsonError('Not signed in', 401);

    const links = await env.DB.prepare(
      `SELECT anon_id AS anonId, linked_at AS linkedAt FROM user_anon_links WHERE user_id = ?1`
    ).bind(session.userId).all();

    return jsonOk({
      user: {
        id: session.userId,
        email: maskEmail(session.email),
        displayInitials: session.displayInitials || null
      },
      linkedAnonIds: (links.results || []).map((r) => r.anonId)
    });
  } catch (err) {
    return internalError(err, 'Account me');
  }
}
