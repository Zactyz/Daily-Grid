/**
 * Send transactional email via Resend HTTP API.
 * Requires env.RESEND_API_KEY and env.AUTH_FROM_EMAIL.
 */
export async function sendAuthEmail(env, { to, subject, html, text }) {
  if (!env?.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY not configured');
  }
  if (!env?.AUTH_FROM_EMAIL) {
    throw new Error('AUTH_FROM_EMAIL not configured');
  }

  const body = {
    from: env.AUTH_FROM_EMAIL,
    to: [to],
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, '')
  };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Resend API ${res.status}: ${errText}`);
  }

  return res.json();
}

export function isAuthConfigured(env) {
  return Boolean(env?.RESEND_API_KEY && env?.AUTH_FROM_EMAIL && env?.AUTH_SESSION_SECRET);
}
