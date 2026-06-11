/**
 * Shared helpers for square drag canvases (Snake, Pathways).
 * Keeps CSS display size, bitmap size, and pointer hit-testing aligned on desktop.
 */

/** @returns {number} CSS pixel side length for a square canvas */
export function measureSquareCanvasSide(canvas, maxPx = 720, vhRatio = 0.78) {
  const parentW = canvas.parentElement?.getBoundingClientRect().width
    ?? canvas.getBoundingClientRect().width;
  const maxH = Math.min(window.innerHeight * vhRatio, maxPx);
  const side = Math.min(parentW || 0, maxH);
  return side > 0 ? side : 0;
}

/** Lock square canvas display box so desktop max-height rules can't squash it */
export function applySquareCanvasDisplay(canvas, side) {
  if (side <= 0) return;
  canvas.style.width = `${side}px`;
  canvas.style.height = `${side}px`;
  canvas.style.maxHeight = 'none';
  canvas.style.aspectRatio = 'auto';
  canvas.style.display = 'block';
  canvas.style.marginLeft = 'auto';
  canvas.style.marginRight = 'auto';
}

/** Map screen coords into renderer layout space (displayWidth × displayHeight) */
export function pointerToDisplayCoords(canvas, clientX, clientY, displayWidth, displayHeight) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height || !displayWidth || !displayHeight) return null;
  return {
    x: ((clientX - rect.left) / rect.width) * displayWidth,
    y: ((clientY - rect.top) / rect.height) * displayHeight,
  };
}

export function attachCanvasResizeObserver(canvas, callback) {
  if (typeof ResizeObserver === 'undefined') return null;
  const ro = new ResizeObserver(() => callback());
  ro.observe(canvas);
  if ( canvas.parentElement) ro.observe(canvas.parentElement);
  return ro;
}
