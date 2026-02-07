export class PerimeterInput {
  constructor(canvas, engine, renderer, callbacks = {}) {
    this.canvas = canvas;
    this.engine = engine;
    this.renderer = renderer;
    this.onEdgeChange = callbacks.onEdgeChange;
    this.onInteraction = callbacks.onInteraction;
    this.pointerDownNode = null;

    this.canvas.style.touchAction = 'none';
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);

    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
  }

  handlePointerDown(event) {
    if (event.button && event.button !== 0) return;
    event.preventDefault();
    const node = this.renderer.getNearestDot(event.clientX, event.clientY);
    if (!node) return;
    this.pointerDownNode = node;
  }

  handlePointerUp(event) {
    if (!this.pointerDownNode) return;
    if (event.button && event.button !== 0) {
      this.pointerDownNode = null;
      return;
    }
    event.preventDefault();
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
    const toggled = this.engine.toggleEdge(this.pointerDownNode, endNode);
    if (toggled) {
      this.onEdgeChange?.();
      this.onInteraction?.();
    }
    this.pointerDownNode = null;
  }

  handlePointerLeave() {
    this.pointerDownNode = null;
  }

  handleContextMenu(event) {
    event.preventDefault();
  }
}
