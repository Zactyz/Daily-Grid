export class SnakeInput {
  constructor(canvas, engine, renderer, onUpdate) {
    this.canvas = canvas;
    this.engine = engine;
    this.renderer = renderer;
    this.onUpdate = onUpdate;
    
    this.setupListeners();
  }
  
  setupListeners() {
    this.canvas.style.touchAction = 'none';
    
    this.canvas.addEventListener('pointerdown', this.handlePointerDown.bind(this));
    this.canvas.addEventListener('pointermove', this.handlePointerMove.bind(this));
    this.canvas.addEventListener('pointerup', this.handlePointerUp.bind(this));
    this.canvas.addEventListener('pointercancel', this.handlePointerUp.bind(this));
  }
  
  handlePointerDown(e) {
    if (this.engine.state.isPaused || this.engine.state.isComplete) return;
    
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    
    const cell = this.renderer.getCellFromPointer(e.clientX, e.clientY);
    if (!cell) return;
    
    const [x, y] = cell;
    
    const existingIdx = this.engine.state.path.findIndex(([px, py]) => px === x && py === y);
    if (existingIdx !== -1) {
      this.engine.undoToCell(x, y);
      this.engine.state.isDragging = true;
      this.onUpdate();
      return;
    }
    
    if (this.engine.addCell(x, y)) {
      this.engine.state.isDragging = true;
      this.onUpdate();
    }
  }
  
  handlePointerMove(e) {
    if (!this.engine.state.isDragging) return;
    if (this.engine.state.isPaused || this.engine.state.isComplete) return;
    
    e.preventDefault();
    
    const cell = this.renderer.getCellFromPointer(e.clientX, e.clientY);
    if (!cell) return;
    
    const [x, y] = cell;
    const lastCell = this.engine.state.path[this.engine.state.path.length - 1];
    
    if (lastCell && lastCell[0] === x && lastCell[1] === y) return;
    
    const existingIdx = this.engine.state.path.findIndex(([px, py]) => px === x && py === y);
    if (existingIdx !== -1) {
      this.engine.undoToCell(x, y);
      this.onUpdate();
      return;
    }
    
    if (this.engine.addCell(x, y)) {
      this.onUpdate();
    }
  }
  
  handlePointerUp(e) {
    this.engine.state.isDragging = false;
    try {
      this.canvas.releasePointerCapture?.(e.pointerId);
    } catch {}
  }
}
