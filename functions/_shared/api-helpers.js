// Shared helpers for Cloudflare Function API handlers

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function handleOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function methodNotAllowed(allowed = 'POST') {
  return jsonError('Method not allowed', 405, { Allow: allowed });
}

export function jsonError(message, status = 400, extra = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extra },
  });
}

export function jsonOk(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export function internalError(err, label = 'API') {
  console.error(`${label} error:`, err);
  return jsonError('Internal server error', 500);
}

export function validateEnv(env) {
  if (!env.DB) throw new Error('Database binding (DB) not configured');
}
