// POST /api/friends/request  { friendCode }
import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';
import {
  getSessionUser,
  resolveUserIdFromFriendCode,
  canonicalFriendPair,
  friendCodeFromUserId
} from '../../_shared/auth-helpers.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return methodNotAllowed('POST');

  try {
    validateEnv(env);
    const session = await getSessionUser(env.DB, request);
    if (!session) return jsonError('Not signed in', 401);

    const { friendCode } = await request.json();
    const targetId = await resolveUserIdFromFriendCode(env.DB, friendCode);
    if (!targetId) return jsonError('Invalid friend code', 400);
    if (targetId === session.userId) return jsonError('Cannot add yourself', 400);

    const [userIdA, userIdB] = canonicalFriendPair(session.userId, targetId);
    await env.DB.prepare(
      `INSERT INTO friendships (user_id_a, user_id_b, status)
       VALUES (?1, ?2, 'accepted')
       ON CONFLICT(user_id_a, user_id_b) DO UPDATE SET status = 'accepted'`
    ).bind(userIdA, userIdB).run();

    const target = await env.DB.prepare(
      `SELECT id, display_initials AS displayInitials FROM users WHERE id = ?1`
    ).bind(targetId).first();

    return jsonOk({
      success: true,
      friend: {
        userId: target.id,
        displayInitials: target.displayInitials || null,
        friendCode: friendCodeFromUserId(target.id)
      }
    });
  } catch (err) {
    return internalError(err, 'Friends request');
  }
}
