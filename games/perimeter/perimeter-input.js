import { normalizeWall } from '../common/utils.js';

export class PerimeterInput {
  constructor(canvas, engine, renderer, callbacks = {}) {
    this.canvas = canvas;
    this.engine = engine;
    this.renderer = renderer;
    this.onEdgeChange = callbacks.onEdgeChange;
    this.onInteraction = callbacks.onInteraction;
    this.dragging = false;
    this.changed = new Set();
    this.dragMode = 'draw'; // draw | erase

    this.canvas.style.touchAction = 'none';
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleContextMenu = (e) => e.preventDefault();

    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
  }

  setEngine(engine) { this.engine = engine; }
  setRenderer(renderer) { this.renderer = renderer; }

  updateTouchBehavior(isComplete) {
    this.canvas.style.touchAction = isComplete ? 'auto' : 'none';
  }

  _setEdge(edge, state, dedupe = true) {
    if (!edge) return false;
    const [a, b] = edge;
    const key = normalizeWall(a, b);
    if (dedupe && this.changed.has(key)) return false;
    if (dedupe) this.changed.add(key);

    const current = this.engine.edgeStates.get(key) || 0;
    if (current === state) return false;

    this.engine.setEdgeState(key, state);
    this.engine.syncStatus();
    this.onEdgeChange?.();
    this.onInteraction?.();
    return true;
  }

  handlePointerDown(event) {
    if (this.engine?.isComplete || this.engine?.isPaused) return;
    if (event.button && event.button !== 0) return;
    event.preventDefault();

    const edge = this.renderer.getNearestEdge(event.clientX, event.clientY);
    if (!edge) return;

    this.dragging = true;
    this.changed.clear();

    const [a, b] = edge;
    const key = normalizeWall(a, b);
    const current = this.engine.edgeStates.get(key) || 0;

    // tap on path = turn off, tap off path = draw line
    this.dragMode = current === 1 ? 'erase' : 'draw';
    const targetState = this.dragMode === 'draw' ? 1 : 0;
    this._setEdge(edge, targetState, false);
  }

  handlePointerMove(event) {
    const edge = this.renderer.getNearestEdge(event.clientX, event.clientY);

    if (this.engine?.isComplete || this.engine?.isPaused) {
      this.renderer.setHoverEdge(null);
      this.dragging = false;
      this.changed.clear();
      this.renderer.render();
      return;
    }

    this.renderer.setHoverEdge(edge);

    if (this.dragging) {
      const targetState = this.dragMode === 'draw' ? 1 : 0;
      this._setEdge(edge, targetState, true);
    }

    this.renderer.render();
  }

  handlePointerUp() {
    this.dragging = false;
    this.changed.clear();
    this.renderer.setHoverEdge(null);
    this.renderer.render();
  }
}
