// POST /api/auth/verify-code  { email, code }
import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';
import { isAuthConfigured } from '../../_shared/resend.js';
import {
  normalizeEmail,
  isValidEmail,
  verifyAuthCode,
  getOrCreateUser,
  createSession,
  sessionCookieHeader,
  maskEmail
} from '../../_shared/auth-helpers.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return methodNotAllowed('POST');

  try {
    validateEnv(env);
    if (!isAuthConfigured(env)) {
      return jsonError('Account sign-in is not configured yet', 503);
    }

    const { email: rawEmail, code, marketingOptIn, termsAccepted } = await request.json();
    const email = normalizeEmail(rawEmail);
    const otp = String(code || '').trim();
    if (!isValidEmail(email)) return jsonError('Invalid email address');
    if (!/^\d{6}$/.test(otp)) return jsonError('Invalid code');
    if (!termsAccepted) return jsonError('You must agree to the Terms of Service and Privacy Policy', 400);

    const result = await verifyAuthCode(env.DB, email, otp);
    if (!result.ok) {
      if (result.reason === 'expired') return jsonError('Code expired. Request a new one.', 400);
      if (result.reason === 'locked') return jsonError('Too many attempts. Request a new code.', 429);
      return jsonError('Invalid code', 401);
    }

    const user = await getOrCreateUser(env.DB, email, { marketingOptIn: Boolean(marketingOptIn) });
    const sessionId = await createSession(env.DB, user.id);

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        email: maskEmail(user.email),
        displayInitials: user.displayInitials || null
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Set-Cookie': sessionCookieHeader(sessionId)
      }
    });
  } catch (err) {
    return internalError(err, 'Auth verify-code');
  }
}