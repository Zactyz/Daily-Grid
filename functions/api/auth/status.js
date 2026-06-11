// GET /api/auth/status
import { handleOptions, methodNotAllowed, jsonOk, internalError, validateEnv } from '../../_shared/api-helpers.js';
import { isAuthConfigured } from '../../_shared/resend.js';
import { getSessionUser } from '../../_shared/auth-helpers.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'GET') return methodNotAllowed('GET');

  try {
    validateEnv(env);
    const configured = isAuthConfigured(env);
    const session = configured ? await getSessionUser(env.DB, request) : null;
    return jsonOk({
      configured,
      signedIn: Boolean(session),
      user: session ? {
        id: session.userId,
        email: session.email,
        displayInitials: session.displayInitials || null
      } : null
    });
  } catch (err) {
    return internalError(err, 'Auth status');
  }
}
