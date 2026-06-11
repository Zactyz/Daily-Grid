// GET /api/friends/list
import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';
import { getSessionUser, getFriendUserIds, friendCodeFromUserId } from '../../_shared/auth-helpers.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'GET') return methodNotAllowed('GET');

  try {
    validateEnv(env);
    const session = await getSessionUser(env.DB, request);
    if (!session) return jsonError('Not signed in', 401);

    const friendIds = await getFriendUserIds(env.DB, session.userId);
    if (!friendIds.length) return jsonOk({ friends: [] });

    const placeholders = friendIds.map((_, i) => `?${i + 1}`).join(', ');
    const rows = await env.DB.prepare(
      `SELECT id, display_initials AS displayInitials FROM users WHERE id IN (${placeholders})`
    ).bind(...friendIds).all();

    const friends = (rows.results || []).map((row) => ({
      userId: row.id,
      displayInitials: row.displayInitials || null,
      friendCode: friendCodeFromUserId(row.id)
    }));

    return jsonOk({ friends });
  } catch (err) {
    return internalError(err, 'Friends list');
  }
}
