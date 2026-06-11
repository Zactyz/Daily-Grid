import { validateUUID } from './validation-helpers.js';

export const SESSION_COOKIE = 'dg_session';
export const SESSION_DAYS = 30;
export const CODE_TTL_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return EMAIL_RE.test(normalizeEmail(email));
}

export function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function hashString(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateUuid() {
  return crypto.randomUUID();
}

export function sessionExpiryIso(days = SESSION_DAYS) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export function codeExpiryIso(minutes = CODE_TTL_MINUTES) {
  const d = new Date();
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  });
  return out;
}

export function sessionCookieHeader(sessionId, { maxAgeDays = SESSION_DAYS } = {}) {
  const maxAge = maxAgeDays * 24 * 60 * 60;
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function getSessionUser(db, request) {
  const cookies = parseCookies(request);
  const sessionId = cookies[SESSION_COOKIE];
  if (!sessionId || !validateUUID(sessionId)) return null;

  const row = await db.prepare(
    `SELECT s.id AS sessionId, s.user_id AS userId, u.email, u.display_initials AS displayInitials
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ?1 AND s.expires_at > datetime('now')`
  ).bind(sessionId).first();

  return row || null;
}

export async function createSession(db, userId) {
  const sessionId = generateUuid();
  const expiresAt = sessionExpiryIso();
  await db.prepare(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES (?1, ?2, ?3)`
  ).bind(sessionId, userId, expiresAt).run();
  return sessionId;
}

export async function deleteSession(db, sessionId) {
  if (!sessionId) return;
  await db.prepare(`DELETE FROM sessions WHERE id = ?1`).bind(sessionId).run();
}

export async function upsertAuthCode(db, email, codeHash, expiresAt) {
  await db.prepare(
    `INSERT INTO auth_codes (email, code_hash, expires_at, attempts)
     VALUES (?1, ?2, ?3, 0)
     ON CONFLICT(email) DO UPDATE SET
       code_hash = excluded.code_hash,
       expires_at = excluded.expires_at,
       attempts = 0,
       created_at = datetime('now')`
  ).bind(email, codeHash, expiresAt).run();
}

export async function verifyAuthCode(db, email, code) {
  const row = await db.prepare(
    `SELECT code_hash, expires_at, attempts FROM auth_codes WHERE email = ?1`
  ).bind(email).first();

  if (!row) return { ok: false, reason: 'no_code' };
  if (Number(row.attempts) >= MAX_CODE_ATTEMPTS) return { ok: false, reason: 'locked' };

  const expires = new Date(String(row.expires_at).replace(' ', 'T') + 'Z');
  if (Number.isNaN(expires.getTime()) || expires <= new Date()) {
    return { ok: false, reason: 'expired' };
  }

  const hash = await hashString(code);
  if (hash !== row.code_hash) {
    await db.prepare(
      `UPDATE auth_codes SET attempts = attempts + 1 WHERE email = ?1`
    ).bind(email).run();
    return { ok: false, reason: 'invalid' };
  }

  await db.prepare(`DELETE FROM auth_codes WHERE email = ?1`).bind(email).run();
  return { ok: true };
}

export async function getOrCreateUser(db, email, { marketingOptIn = false } = {}) {
  let user = await db.prepare(
    `SELECT id, email, display_initials AS displayInitials, marketing_opt_in AS marketingOptIn
     FROM users WHERE email = ?1`
  ).bind(email).first();

  if (user) {
    if (marketingOptIn) {
      await db.prepare(
        `UPDATE users SET last_login_at = datetime('now'), marketing_opt_in = 1, marketing_opt_in_at = datetime('now') WHERE id = ?1`
      ).bind(user.id).run();
      user.marketingOptIn = 1;
    } else {
      await db.prepare(
        `UPDATE users SET last_login_at = datetime('now') WHERE id = ?1`
      ).bind(user.id).run();
    }
    return user;
  }

  const id = generateUuid();
  await db.prepare(
    `INSERT INTO users (id, email, last_login_at, marketing_opt_in, marketing_opt_in_at)
     VALUES (?1, ?2, datetime('now'), ?3, CASE WHEN ?3 = 1 THEN datetime('now') ELSE NULL END)`
  ).bind(id, email, marketingOptIn ? 1 : 0).run();

  return { id, email, displayInitials: null, marketingOptIn: marketingOptIn ? 1 : 0 };
}

export async function setMarketingOptIn(db, userId, optIn) {
  await db.prepare(
    `UPDATE users SET marketing_opt_in = ?1, marketing_opt_in_at = CASE WHEN ?1 = 1 THEN datetime('now') ELSE marketing_opt_in_at END WHERE id = ?2`
  ).bind(optIn ? 1 : 0, userId).run();
}

const SCORE_TABLES = [
  'bits_scores', 'hashi_scores', 'snake_scores', 'shikaku_scores', 'pathways_scores',
  'lattice_scores', 'conduit_scores', 'perimeter_scores', 'polyfit_scores', 'tiles_scores', 'harbor_scores'
];

export async function linkAnonToUser(db, userId, anonId) {
  if (!validateUUID(anonId)) throw new Error('Invalid anon ID');

  await db.prepare(
    `INSERT INTO user_anon_links (user_id, anon_id, linked_at)
     VALUES (?1, ?2, datetime('now'))
     ON CONFLICT(anon_id) DO UPDATE SET user_id = excluded.user_id, linked_at = excluded.linked_at`
  ).bind(userId, anonId).run();

  for (const table of SCORE_TABLES) {
    try {
      await db.prepare(
        `UPDATE ${table} SET user_id = ?1 WHERE anon_id = ?2 AND (user_id IS NULL OR user_id = ?1)`
      ).bind(userId, anonId).run();
    } catch {
      // table or column may not exist yet in some environments
    }
  }
}

export function maskEmail(email) {
  const [local, domain] = normalizeEmail(email).split('@');
  if (!local || !domain) return email;
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

export function friendCodeFromUserId(userId) {
  return String(userId || '').replace(/-/g, '').slice(0, 12).toUpperCase();
}

export async function resolveUserIdFromFriendCode(db, code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!/^[0-9A-F]{8,32}$/.test(normalized)) return null;
  const result = await db.prepare(
    `SELECT id FROM users WHERE upper(replace(id, '-', '')) LIKE ?1 || '%'`
  ).bind(normalized).all();
  const matches = result.results || [];
  if (matches.length !== 1) return null;
  return matches[0].id;
}

export function canonicalFriendPair(userIdA, userIdB) {
  return userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];
}

export async function getFriendUserIds(db, userId) {
  const result = await db.prepare(
    `SELECT user_id_a AS a, user_id_b AS b FROM friendships
     WHERE status = 'accepted' AND (user_id_a = ?1 OR user_id_b = ?1)`
  ).bind(userId).all();
  return (result.results || []).map((row) => (row.a === userId ? row.b : row.a));
}

export async function getFriendAnonIds(db, userId) {
  const friendIds = await getFriendUserIds(db, userId);
  if (!friendIds.length) return [];
  const placeholders = friendIds.map((_, i) => `?${i + 1}`).join(', ');
  const result = await db.prepare(
    `SELECT anon_id AS anonId FROM user_anon_links WHERE user_id IN (${placeholders})`
  ).bind(...friendIds).all();
  return (result.results || []).map((r) => r.anonId);
}
