// POST /api/feedback/submit
import { handleOptions, methodNotAllowed, jsonError, jsonOk, internalError } from '../../_shared/api-helpers.js';
import { validateUUID } from '../../_shared/validation-helpers.js';

const MAX_MESSAGE_LEN = 2000;
const rateLimit = new Map();

function isRateLimited(anonId) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${anonId}:${day}`;
  const count = rateLimit.get(key) || 0;
  if (count >= 10) return true;
  rateLimit.set(key, count + 1);
  return false;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'POST') return methodNotAllowed('POST');

  const url = env.GOOGLE_SHEETS_FEEDBACK_URL;
  const secret = env.FEEDBACK_WEBHOOK_SECRET;
  if (!url || !secret) {
    return jsonError('Feedback is not configured yet', 503);
  }

  try {
    const body = await request.json();
    const message = String(body?.message || '').trim();
    const anonId = String(body?.anonId || '').trim();
    const page = String(body?.page || '').trim().slice(0, 200);

    if (!message || message.length > MAX_MESSAGE_LEN) {
      return jsonError(`Message must be 1–${MAX_MESSAGE_LEN} characters`);
    }
    if (anonId && !validateUUID(anonId)) {
      return jsonError('Invalid anonId');
    }
    if (anonId && isRateLimited(anonId)) {
      return jsonError('Too many submissions today. Try again tomorrow.', 429);
    }

    const payload = {
      secret,
      timestamp: new Date().toISOString(),
      anonId: anonId || '',
      message,
      page: page || '',
      userAgent: request.headers.get('User-Agent') || '',
      pwaMode: String(body?.pwaMode || '')
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[feedback] Sheets webhook failed:', res.status, text);
      return jsonError('Could not save feedback', 502);
    }

    return jsonOk({ ok: true });
  } catch (err) {
    return internalError(err, 'Feedback submit');
  }
}
