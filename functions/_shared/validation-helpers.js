// Shared validation helpers for Cloudflare Function API handlers

const PUZZLE_ID_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validatePuzzleId(id) {
  return typeof id === 'string' && PUZZLE_ID_RE.test(id);
}

export function validateTimeMs(ms) {
  return typeof ms === 'number' && Number.isFinite(ms) && ms >= 3000 && ms <= 3600000;
}

export function validateUUID(uuid) {
  return typeof uuid === 'string' && UUID_RE.test(uuid);
}

export function validateInitials(str) {
  return typeof str === 'string' && /^[A-Z]{1,3}$/.test(str);
}
