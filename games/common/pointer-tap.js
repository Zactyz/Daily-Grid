/**
 * Shared touch/pointer deduplication for all Daily Grid games.
 *
 * iOS/WebKit fires pointerdown (touch) then a synthetic pointerdown (mouse)
 * for the same tap. We record real touches and ignore only the follow-up ghost.
 * Real taps (touch or desktop mouse) are never rate-limited.
 */

const ghostTapAt = new Map();
let lastTouchPointerUpAt = 0;

/** Skip ghost mouse events that follow a touch on iOS/WebKit. */
export function isSyntheticMousePointer(event) {
  return event.pointerType === 'mouse' && (performance.now() - lastTouchPointerUpAt) < 500;
}

export function noteTouchPointerUp(event) {
  if (event.pointerType === 'touch') {
    lastTouchPointerUpAt = performance.now();
  }
}

function ghostKey(key) {
  return `ghost:${key}`;
}

/**
 * Call at the start of any gameplay pointer handler that mutates state.
 * @returns {true} if this event should be ignored
 */
export function shouldIgnoreGhostPointer(event, key) {
  if (!key) return false;

  const gk = ghostKey(key);

  if (event.pointerType === 'touch') {
    ghostTapAt.set(gk, performance.now());
    return false;
  }

  if (event.pointerType === 'mouse' && event.button !== 0) return false;
  if (!isSyntheticMousePointer(event)) return false;

  const prev = ghostTapAt.get(gk);
  if (prev != null && performance.now() - prev < 450) return true;
  ghostTapAt.set(gk, performance.now());
  return false;
}

/**
 * @deprecated Use shouldIgnoreGhostPointer, kept for callers migrating gradually.
 */
export function isDuplicateGameplayTap(key, cooldownMs = 280) {
  const gk = ghostKey(key);
  const now = performance.now();
  const prev = ghostTapAt.get(gk);
  if (prev != null && now - prev < cooldownMs) return true;
  ghostTapAt.set(gk, now);
  return false;
}
