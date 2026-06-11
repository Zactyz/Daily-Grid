// POST /api/friends/accept  { userId } — reserved for pending flow; auto-accepts if row exists
import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';
import { getSessionUser, canonicalFriendPair } from '../../_shared/auth-helpers.js';
import { validateUUID } from '../../_shared/validation-helpers.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return methodNotAllowed('POST');

  try {
    validateEnv(env);
    const session = await getSessionUser(env.DB, request);
    if (!session) return jsonError('Not signed in', 401);

    const { userId: otherUserId } = await request.json();
    if (!validateUUID(otherUserId)) return jsonError('Invalid userId', 400);
    if (otherUserId === session.userId) return jsonError('Invalid request', 400);

    const [userIdA, userIdB] = canonicalFriendPair(session.userId, otherUserId);
    await env.DB.prepare(
      `UPDATE friendships SET status = 'accepted' WHERE user_id_a = ?1 AND user_id_b = ?2`
    ).bind(userIdA, userIdB).run();

    return jsonOk({ success: true });
  } catch (err) {
    return internalError(err, 'Friends accept');
  }
}
