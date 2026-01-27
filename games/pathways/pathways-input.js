export class PathwaysInput {
  constructor(canvas, engine, renderer, onUpdate) {
    this.canvas = canvas;
    this.engine = engine;
    this.renderer = renderer;
    this.onUpdate = onUpdate;
    
    this.isDragging = false;
    this.dragColor = null;
    
    this.setupListeners();
  }
  
  setupListeners() {
    this.canvas.style.touchAction = 'none';
    
    this.canvas.addEventListener('pointerdown', this.handlePointerDown.bind(this));
    this.canvas.addEventListener('pointermove', this.handlePointerMove.bind(this));
    this.canvas.addEventListener('pointerup', this.handlePointerUp.bind(this));
    this.canvas.addEventListener('pointercancel', this.handlePointerUp.bind(this));
    this.canvas.addEventListener('pointerleave', this.handlePointerUp.bind(this));
  }
  
  handlePointerDown(e) {
    if (this.engine.state.isPaused || this.engine.state.isComplete) return;
    
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    
    const cell = this.renderer.getCellFromPointer(e.clientX, e.clientY);
    if (!cell) return;
    
    const [x, y] = cell;
    
    // Check what's at this cell
    const endpointColor = this.engine.isEndpoint(x, y);
    const pathColor = this.engine.getCellColor(x, y);
    
    // Priority: endpoint > existing path
    let color = endpointColor !== null ? endpointColor : pathColor;
    
    if (color === null) return; // Clicked on empty cell with nothing - ignore
    
    this.isDragging = true;
    this.dragColor = color;
    
    const path = this.engine.state.paths[color] || [];
    
    // If clicking on an endpoint
    if (endpointColor !== null) {
      const pair = this.engine.getPair(color);
      const isStartEndpoint = pair.start[0] === x && pair.start[1] === y;
      const isEndEndpoint = pair.end[0] === x && pair.end[1] === y;
      
      // Check if path exists and where it starts/ends
      if (path.length > 0) {
        const pathStart = path[0];
        const pathEnd = path[path.length - 1];
        const pathStartsHere = pathStart[0] === x && pathStart[1] === y;
        const pathEndsHere = pathEnd[0] === x && pathEnd[1] === y;
        
        if (pathStartsHere) {
          // Clicked on the start of existing path - clear path to draw fresh
          this.engine.clearPath(color);
          this.engine.addCell(color, x, y);
        } else if (pathEndsHere) {
          // Clicked on the end of existing path - can continue from here (already set up)
          // Nothing to do, path is ready to extend
        } else {
          // Path exists but doesn't touch this endpoint - clear and start fresh
          this.engine.clearPath(color);
          this.engine.addCell(color, x, y);
        }
      } else {
        // No path yet - start one from this endpoint
        this.engine.addCell(color, x, y);
      }
    } else if (pathColor !== null) {
      // Clicked on an existing path cell (not endpoint) - undo to this point
      const existingIdx = path.findIndex(([px, py]) => px === x && py === y);
      if (existingIdx !== -1) {
        this.engine.undoToCell(color, x, y);
      }
    }
    
    this.onUpdate();
  }
  
  handlePointerMove(e) {
    if (!this.isDragging || this.dragColor === null) return;
    if (this.engine.state.isPaused || this.engine.state.isComplete) return;
    
    e.preventDefault();
    
    const cell = this.renderer.getCellFromPointer(e.clientX, e.clientY);
    if (!cell) return;
    
    const [x, y] = cell;
    const color = this.dragColor;
    const path = this.engine.state.paths[color] || [];
    
    if (path.length === 0) return;
    
    const lastCell = path[path.length - 1];
    
    // Same cell - ignore
    if (lastCell[0] === x && lastCell[1] === y) return;
    
    // Check if dragging back onto the path (undo)
    const existingIdx = path.findIndex(([px, py]) => px === x && py === y);
    if (existingIdx !== -1 && existingIdx < path.length - 1) {
      // Dragging back onto path - undo to this cell
      this.engine.undoToCell(color, x, y);
      this.onUpdate();
      return;
    }
    
    // Check if adjacent to last cell
    const isAdjacent = (Math.abs(x - lastCell[0]) === 1 && y === lastCell[1]) ||
                       (Math.abs(y - lastCell[1]) === 1 && x === lastCell[0]);
    
    if (!isAdjacent) return;
    
    // Try to add cell
    if (this.engine.canAddCell(color, x, y)) {
      this.engine.addCell(color, x, y);
      this.onUpdate();
    }
  }
  
  handlePointerUp(e) {
    this.isDragging = false;
    this.dragColor = null;
    try {
      this.canvas.releasePointerCapture?.(e.pointerId);
    } catch {}
  }
}
