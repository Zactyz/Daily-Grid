export class PerimeterInput {
  constructor(canvas, engine, renderer, callbacks = {}) {
    this.canvas = canvas;
    this.engine = engine;
    this.renderer = renderer;
    this.onEdgeChange = callbacks.onEdgeChange;
    this.onInteraction = callbacks.onInteraction;
    this.pointerDownNode = null;
    this.pointerDownEdge = null;

    this.canvas.style.touchAction = 'none';
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);

    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
  }

  setEngine(engine) {
    this.engine = engine;
  }

  setRenderer(renderer) {
    this.renderer = renderer;
  }

  toggleEdge(a, b) {
    const toggled = this.engine.toggleEdge(a, b);
    if (toggled) {
      this.onEdgeChange?.();
      this.onInteraction?.();
    }
  }

  handlePointerMove(event) {
    const edge = this.renderer.getNearestEdge(event.clientX, event.clientY);
    this.renderer.setHoverEdge(edge);
    this.renderer.render();
  }

  handlePointerDown(event) {
    if (event.button && event.button !== 0) return;
    event.preventDefault();

    const edge = this.renderer.getNearestEdge(event.clientX, event.clientY);
    if (edge) {
      this.pointerDownEdge = edge;
      this.pointerDownNode = null;
      return;
    }

    const node = this.renderer.getNearestDot(event.clientX, event.clientY);
    if (!node) return;
    this.pointerDownNode = node;
    this.pointerDownEdge = null;
  }

  handlePointerUp(event) {
    if (event.button && event.button !== 0) {
      this.pointerDownNode = null;
      this.pointerDownEdge = null;
      return;
    }
    event.preventDefault();

    if (this.pointerDownEdge) {
      this.toggleEdge(this.pointerDownEdge[0], this.pointerDownEdge[1]);
      this.pointerDownEdge = null;
      return;
    }

    if (!this.pointerDownNode) return;

    const endNode = this.renderer.getNearestDot(event.clientX, event.clientY);
    if (!endNode) {
      this.pointerDownNode = null;
      return;
    }

    const [ax, ay] = this.pointerDownNode;
    const [bx, by] = endNode;
    const manhattan = Math.abs(ax - bx) + Math.abs(ay - by);
    if (manhattan !== 1) {
      this.pointerDownNode = null;
      return;
    }

    this.toggleEdge(this.pointerDownNode, endNode);
    this.pointerDownNode = null;
  }

  handlePointerLeave() {
    this.pointerDownNode = null;
    this.pointerDownEdge = null;
    this.renderer.setHoverEdge(null);
    this.renderer.render();
  }

  handleContextMenu(event) {
    event.preventDefault();
  }
}
