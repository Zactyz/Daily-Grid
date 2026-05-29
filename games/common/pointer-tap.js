/**
 * Prevent duplicate gameplay actions from touch + synthetic mouse pointer events
 * and from rapid double-taps on the same target.
 */

const recentTapByKey = new Map();
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

/**
 * @param {string} key - Stable id for the tap target (cell, edge, piece, etc.)
 * @param {number} [cooldownMs=280]
 * @returns {true} if this tap should be ignored
 */
export function isDuplicateGameplayTap(key, cooldownMs = 280) {
  const now = performance.now();
  const prev = recentTapByKey.get(key);
  if (prev != null && now - prev < cooldownMs) return true;
  recentTapByKey.set(key, now);
  return false;
}

/**
 * @param {PointerEvent} event
 * @param {() => void} handler
 * @param {{ key?: string, getKey?: (event: PointerEvent) => string, cooldownMs?: number }} [opts]
 */
export function onGameplayPointerDown(event, handler, opts = {}) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  if (isSyntheticMousePointer(event)) return;

  const key = opts.getKey?.(event) ?? opts.key;
  if (key != null && isDuplicateGameplayTap(key, opts.cooldownMs ?? 280)) return;

  event.preventDefault();
  handler(event);
}
