export class PathwaysInput {
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
    
    // Get cell under pointer
    const cell = this.renderer.getCellFromPointer(e.clientX, e.clientY);
    if (!cell) return;
    
    const [x, y] = cell;
    
    // Check if clicking on an endpoint or existing path to select/change color
    const clickedColor = this.renderer.getColorFromPointer(e.clientX, e.clientY);
    
    if (clickedColor !== null) {
      // Clicked on an endpoint or path - select this color
      this.engine.setActiveColor(clickedColor);
      const path = this.engine.state.paths[clickedColor] || [];
      
      // Check if clicking on existing path cell (undo to that position)
      const existingIdx = path.findIndex(([px, py]) => px === x && py === y);
      if (existingIdx !== -1 && existingIdx < path.length - 1) {
        this.engine.undoToCell(clickedColor, x, y);
        this.engine.state.isDragging = true;
        this.onUpdate();
        return;
      }
      
      // Try to add cell (starting from endpoint or extending path)
      if (this.engine.addCell(clickedColor, x, y)) {
        this.engine.state.isDragging = true;
        this.onUpdate();
      } else {
        // Just update to show the active color selection
        this.onUpdate();
      }
    } else if (this.engine.state.activeColor !== null) {
      // Clicked on empty cell with an active color - try to extend path
      const activeColor = this.engine.state.activeColor;
      if (this.engine.addCell(activeColor, x, y)) {
        this.engine.state.isDragging = true;
        this.onUpdate();
      }
    }
  }
  
  handlePointerMove(e) {
    if (!this.engine.state.isDragging) return;
    if (this.engine.state.isPaused || this.engine.state.isComplete) return;
    
    e.preventDefault();
    
    if (this.engine.state.activeColor === null) return;
    
    const cell = this.renderer.getCellFromPointer(e.clientX, e.clientY);
    if (!cell) return;
    
    const [x, y] = cell;
    const activeColor = this.engine.state.activeColor;
    const path = this.engine.state.paths[activeColor] || [];
    const lastCell = path[path.length - 1];
    
    if (lastCell && lastCell[0] === x && lastCell[1] === y) return;
    
    // Check if clicking on existing path (undo)
    const existingIdx = path.findIndex(([px, py]) => px === x && py === y);
    if (existingIdx !== -1) {
      // Only allow undo if it's the immediately preceding cell (back 1 step)
      if (existingIdx === path.length - 2) {
        this.engine.undoToCell(activeColor, x, y);
        this.onUpdate();
      }
      return;
    }
    
    // Try to add cell
    if (this.engine.addCell(activeColor, x, y)) {
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
