// POST /api/auth/request-code  { email }
import { handleOptions, methodNotAllowed, jsonOk, jsonError, internalError, validateEnv } from '../../_shared/api-helpers.js';
import { isAuthConfigured, sendAuthEmail } from '../../_shared/resend.js';
import {
  normalizeEmail,
  isValidEmail,
  generateOtpCode,
  hashString,
  codeExpiryIso,
  upsertAuthCode
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

    const { email: rawEmail } = await request.json();
    const email = normalizeEmail(rawEmail);
    if (!isValidEmail(email)) return jsonError('Invalid email address');

    const recent = await env.DB.prepare(
      `SELECT created_at FROM auth_codes WHERE email = ?1 AND created_at > datetime('now', '-1 minute')`
    ).bind(email).first();
    if (recent) {
      return jsonError('Please wait a minute before requesting another code', 429);
    }

    const code = generateOtpCode();
    const codeHash = await hashString(code);
    await upsertAuthCode(env.DB, email, codeHash, codeExpiryIso());

    await sendAuthEmail(env, {
      to: email,
      subject: 'Your Daily Grid sign-in code',
      html: `<p>Your sign-in code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:0.2em">${code}</p><p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>`
    });

    return jsonOk({ success: true });
  } catch (err) {
    if (err?.statusCode === 403) {
      return jsonError(
        'Email could not be sent. With the test sender (onboarding@resend.dev), use the exact email on your Resend account, or verify dailygrid.app in Resend first.',
        400
      );
    }
    return internalError(err, 'Auth request-code');
  }
}
