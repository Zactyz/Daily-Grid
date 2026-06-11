// POST /api/auth/logout
import { handleOptions, methodNotAllowed, jsonOk, internalError, validateEnv } from '../../_shared/api-helpers.js';
import {
  parseCookies,
  SESSION_COOKIE,
  deleteSession,
  clearSessionCookieHeader
} from '../../_shared/auth-helpers.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return methodNotAllowed('POST');

  try {
    validateEnv(env);
    const cookies = parseCookies(request);
    const sessionId = cookies[SESSION_COOKIE];
    if (sessionId) await deleteSession(env.DB, sessionId);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Set-Cookie': clearSessionCookieHeader()
      }
    });
  } catch (err) {
    return internalError(err, 'Auth logout');
  }
}
