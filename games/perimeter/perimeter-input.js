export class PerimeterInput {
  constructor(canvas, engine, renderer, callbacks = {}) {
    this.canvas = canvas;
    this.engine = engine;
    this.renderer = renderer;
    this.onEdgeChange = callbacks.onEdgeChange;
    this.onInteraction = callbacks.onInteraction;
    this.getMarkMode = callbacks.getMarkMode || (() => 'line');
    this.dragging = false;
    this.changed = new Set();

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

  _setEdge(edge, mode) {
    if (!edge) return false;
    const [a,b] = edge;
    const key = (a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]))
      ? `${a[0]},${a[1]}-${b[0]},${b[1]}`
      : `${b[0]},${b[1]}-${a[0]},${a[1]}`;
    if (this.changed.has(key)) return false;
    this.changed.add(key);
    const norm = this.engine.toggleEdge(a, b); // cycles
    if (!norm) return false;
    const desired = mode === 'x' ? -1 : 1;
    let guard = 0;
    while ((this.engine.edgeStates.get(key) || 0) !== desired && guard < 3) {
      this.engine.toggleEdge(a,b);
      guard += 1;
    }
    this.onEdgeChange?.();
    this.onInteraction?.();
    return true;
  }

  handlePointerDown(event) {
    if (event.button && event.button !== 0) return;
    event.preventDefault();
    this.dragging = true;
    this.changed.clear();
    const edge = this.renderer.getNearestEdge(event.clientX, event.clientY);
    const mode = event.button === 2 ? 'x' : this.getMarkMode();
    this._setEdge(edge, mode);
  }

  handlePointerMove(event) {
    const edge = this.renderer.getNearestEdge(event.clientX, event.clientY);
    this.renderer.setHoverEdge(edge);
    if (this.dragging) {
      this._setEdge(edge, this.getMarkMode());
    }
    this.renderer.render();
  }

  handlePointerUp() {
    this.dragging = false;
    this.changed.clear();
  }
}
