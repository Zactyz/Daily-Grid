import { STORAGE_KEYS } from './pathways-utils.js';

export class PathwaysEngine {
  constructor(puzzle, storageKey) {
    this.puzzle = puzzle;
    this.storageKey = storageKey || STORAGE_KEYS.PATHWAYS_PROGRESS;
    this.state = {
      paths: {}, // { color: [[x,y], ...] }
      activeColor: null,
      timeMs: 0,
      hintsUsed: 0,
      isComplete: false,
      isPaused: false,
      isDragging: false,
      timerStarted: false
    };
    
    // Initialize paths with empty arrays for each color
    for (const pair of puzzle.pairs) {
      this.state.paths[pair.color] = [];
    }
    
    // Store blocked cells as a Set for fast lookup
    this.blockedCells = new Set();
    if (puzzle.blockedCells) {
      for (const [x, y] of puzzle.blockedCells) {
        this.blockedCells.add(`${x},${y}`);
      }
    }
    
    // Store corridors as a Map: cell key -> open directions
    this.corridorMap = new Map();
    if (puzzle.corridors) {
      for (const corridor of puzzle.corridors) {
        const [x, y] = corridor.cell;
        this.corridorMap.set(`${x},${y}`, corridor.open);
      }
    }
    
    // Store required cells as a Map: cell key -> required color
    this.requiredCellMap = new Map();
    if (puzzle.requiredCells) {
      for (const req of puzzle.requiredCells) {
        const [x, y] = req.cell;
        this.requiredCellMap.set(`${x},${y}`, req.color);
      }
    }
    
    this.lastSaveTime = 0;
    this.saveThrottleMs = 5000;
    
    this.loadProgress();
  }
  
  saveProgress() {
    const progress = {
      puzzleId: this.puzzle.id,
      paths: this.state.paths,
      activeColor: this.state.activeColor,
      timeMs: this.state.timeMs,
      hintsUsed: this.state.hintsUsed,
      isComplete: this.state.isComplete,
      timerStarted: this.state.timerStarted
    };
    
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(progress));
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.warn('localStorage quota exceeded, clearing old data');
        try {
          localStorage.removeItem(this.storageKey);
          localStorage.setItem(this.storageKey, JSON.stringify(progress));
        } catch (retryError) {
          console.error('Failed to save progress:', retryError);
        }
      } else {
        console.error('Failed to save progress:', error);
      }
    }
  }
  
  loadProgress() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (!saved) return false;
      
      const progress = JSON.parse(saved);
      if (progress.puzzleId === this.puzzle.id) {
        this.state.paths = progress.paths || {};
        this.state.activeColor = progress.activeColor || null;
        this.state.timeMs = progress.timeMs || 0;
        this.state.hintsUsed = progress.hintsUsed || 0;
        this.state.isComplete = progress.isComplete || false;
        this.state.isPaused = this.state.isComplete;
        this.state.timerStarted = progress.timerStarted || this.hasAnyProgress();
        return this.state.timerStarted;
      }
    } catch (e) {
      console.warn('Failed to load progress:', e);
    }
    return false;
  }
  
  hasAnyProgress() {
    for (const path of Object.values(this.state.paths)) {
      if (path && path.length > 0) return true;
    }
    return this.state.timeMs > 0;
  }
  
  clearProgress() {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (e) {
      console.warn('Failed to clear progress:', e);
    }
  }
  
  // Get the pair for a color
  getPair(color) {
    return this.puzzle.pairs.find(p => p.color === color);
  }
  
  // Check if movement direction is allowed by corridor constraints
  // Checks both source (exit) and destination (entry) corridors
  isDirectionAllowed(fromX, fromY, toX, toY) {
    // Determine direction of movement
    const dx = toX - fromX;
    const dy = toY - fromY;
    
    let direction;
    if (dx === 1 && dy === 0) direction = 'east';
    else if (dx === -1 && dy === 0) direction = 'west';
    else if (dx === 0 && dy === 1) direction = 'south';
    else if (dx === 0 && dy === -1) direction = 'north';
    else return false; // Not a valid adjacent move
    
    // Check if source cell (from) allows exit in this direction
    const fromKey = `${fromX},${fromY}`;
    const fromOpenDirs = this.corridorMap.get(fromKey);
    if (fromOpenDirs && !fromOpenDirs.includes(direction)) {
      return false; // Can't exit from source corridor in this direction
    }
    
    // Check if destination cell (to) allows entry from opposite direction
    const toKey = `${toX},${toY}`;
    const toOpenDirs = this.corridorMap.get(toKey);
    if (toOpenDirs) {
      // Need opposite direction for entry
      const oppositeDir = direction === 'east' ? 'west' : 
                         direction === 'west' ? 'east' :
                         direction === 'north' ? 'south' : 'north';
      if (!toOpenDirs.includes(oppositeDir)) {
        return false; // Can't enter destination corridor from this direction
      }
    }
    
    return true;
  }
  
  // Check if a cell can be added to a color's path
  canAddCell(color, x, y) {
    if (x < 0 || x >= this.puzzle.width || y < 0 || y >= this.puzzle.height) {
      return false;
    }
    
    // Check if cell is blocked
    if (this.blockedCells.has(`${x},${y}`)) {
      return false;
    }
    
    const pair = this.getPair(color);
    if (!pair) return false;
    
    const path = this.state.paths[color] || [];
    const cellKey = `${x},${y}`;
    
    // Check if cell is already in this path (allow if it's the last cell for undo)
    const idx = path.findIndex(([px, py]) => px === x && py === y);
    if (idx !== -1 && idx !== path.length - 1) {
      return false; // Can only undo to cells already in path
    }
    
    // Check if cell is occupied by another color's path
    for (const [otherColor, otherPath] of Object.entries(this.state.paths)) {
      if (otherColor !== color && otherPath) {
        const occupied = otherPath.some(([px, py]) => px === x && py === y);
        if (occupied) return false;
      }
    }
    
    // If path is empty, can start at EITHER endpoint (start or end)
    if (path.length === 0) {
      const isStart = pair.start[0] === x && pair.start[1] === y;
      const isEnd = pair.end[0] === x && pair.end[1] === y;
      return isStart || isEnd;
    }
    
    // If path is already complete (reached target endpoint), don't allow more cells
    if (this.isPathComplete(color)) {
      return false;
    }
    
    // Must be adjacent to last cell in path
    const [lastX, lastY] = path[path.length - 1];
    const isAdjacent = (Math.abs(x - lastX) === 1 && y === lastY) ||
                      (Math.abs(y - lastY) === 1 && x === lastX);
    if (!isAdjacent) return false;
    
    // Check if corridor allows this movement direction (checks both source and destination)
    if (!this.isDirectionAllowed(lastX, lastY, x, y)) {
      return false;
    }
    
    // Determine which endpoint we started from and which is the target
    const [firstX, firstY] = path[0];
    const startedFromStart = firstX === pair.start[0] && firstY === pair.start[1];
    const targetEndpoint = startedFromStart ? pair.end : pair.start;
    
    // Can end at the OTHER endpoint (the one we didn't start from)
    if (targetEndpoint[0] === x && targetEndpoint[1] === y) {
      return true;
    }
    
    // Otherwise cell must be empty (not an endpoint of another pair, and not our own starting endpoint)
    for (const otherPair of this.puzzle.pairs) {
      if (otherPair.color !== color) {
        if ((otherPair.start[0] === x && otherPair.start[1] === y) ||
            (otherPair.end[0] === x && otherPair.end[1] === y)) {
          return false; // Can't use another pair's endpoint
        }
      }
    }
    
    return true;
  }
  
  // Add a cell to a color's path
  addCell(color, x, y) {
    if (!this.canAddCell(color, x, y)) return false;
    
    const path = this.state.paths[color] || [];
    const cellKey = `${x},${y}`;
    
    // Check if undoing (clicking on existing path cell)
    const idx = path.findIndex(([px, py]) => px === x && py === y);
    if (idx !== -1 && idx < path.length - 1) {
      // Undo to this cell
      this.state.paths[color] = path.slice(0, idx + 1);
      this.state.isComplete = false;
      this.saveProgress();
      return true;
    }
    
    // Add new cell
    this.state.paths[color] = [...path, [x, y]];
    
    if (!this.state.timerStarted) {
      this.state.timerStarted = true;
    }
    
    this.checkWinCondition();
    this.saveProgress();
    return true;
  }
  
  // Undo path back to a specific cell
  undoToCell(color, x, y) {
    const path = this.state.paths[color] || [];
    const idx = path.findIndex(([px, py]) => px === x && py === y);
    if (idx === -1) return false;
    
    this.state.paths[color] = path.slice(0, idx + 1);
    this.state.isComplete = false;
    this.saveProgress();
    return true;
  }
  
  // Clear entire path for a color
  clearPath(color) {
    this.state.paths[color] = [];
    this.state.isComplete = false;
    this.saveProgress();
  }
  
  // Set active color (for drawing)
  setActiveColor(color) {
    this.state.activeColor = color;
  }
  
  reset(keepTimer = false) {
    for (const pair of this.puzzle.pairs) {
      this.state.paths[pair.color] = [];
    }
    this.state.activeColor = null;
    if (!keepTimer) {
      this.state.timeMs = 0;
    }
    this.state.hintsUsed = 0;
    this.state.isComplete = false;
    this.state.isPaused = false;
    this.state.timerStarted = false;
    this.clearProgress();
  }
  
  checkWinCondition() {
    // All pairs must be connected (path connecting both endpoints)
    for (const pair of this.puzzle.pairs) {
      const path = this.state.paths[pair.color] || [];
      if (path.length === 0) {
        this.state.isComplete = false;
        return false;
      }
      
      const pathStart = path[0];
      const pathEnd = path[path.length - 1];
      
      // Path can go in either direction: start->end OR end->start
      const startsAtStart = pathStart[0] === pair.start[0] && pathStart[1] === pair.start[1];
      const startsAtEnd = pathStart[0] === pair.end[0] && pathStart[1] === pair.end[1];
      const endsAtStart = pathEnd[0] === pair.start[0] && pathEnd[1] === pair.start[1];
      const endsAtEnd = pathEnd[0] === pair.end[0] && pathEnd[1] === pair.end[1];
      
      const validPath = (startsAtStart && endsAtEnd) || (startsAtEnd && endsAtStart);
      
      if (!validPath) {
        this.state.isComplete = false;
        return false;
      }
    }
    
    // All non-blocked cells must be filled
    const totalCells = this.puzzle.width * this.puzzle.height;
    const blockedCount = this.blockedCells.size;
    const expectedFilledCells = totalCells - blockedCount;
    const filledCells = new Set();
    
    for (const path of Object.values(this.state.paths)) {
      for (const [x, y] of path) {
        filledCells.add(`${x},${y}`);
      }
    }
    
    if (filledCells.size !== expectedFilledCells) {
      this.state.isComplete = false;
      return false;
    }
    
    // Check that all required cells are covered by the correct color
    for (const [cellKey, requiredColor] of this.requiredCellMap) {
      const [x, y] = cellKey.split(',').map(Number);
      const actualColor = this.getCellColor(x, y);
      if (actualColor !== requiredColor) {
        this.state.isComplete = false;
        return false;
      }
    }
    
    // Win!
    this.state.isComplete = true;
    this.state.isPaused = true;
    this.saveCompletedState();
    return true;
  }
  
  // Save completed state separately (doesn't get cleared by reset)
  saveCompletedState() {
    const completedKey = `${this.storageKey}_completed`;
    const completedData = {
      puzzleId: this.puzzle.id,
      paths: this.state.paths,
      timeMs: this.state.timeMs
    };
    try {
      localStorage.setItem(completedKey, JSON.stringify(completedData));
    } catch (e) {
      console.warn('Failed to save completed state:', e);
    }
  }
  
  // Load completed state
  loadCompletedState() {
    const completedKey = `${this.storageKey}_completed`;
    try {
      const saved = localStorage.getItem(completedKey);
      if (!saved) return false;
      
      const completedData = JSON.parse(saved);
      if (completedData.puzzleId === this.puzzle.id) {
        this.state.paths = completedData.paths || {};
        this.state.timeMs = completedData.timeMs || 0;
        this.state.isComplete = true;
        this.state.isPaused = true;
        this.state.timerStarted = true;
        return true;
      }
    } catch (e) {
      console.warn('Failed to load completed state:', e);
    }
    return false;
  }
  
  pause() {
    this.state.isPaused = true;
  }
  
  resume() {
    this.state.isPaused = false;
  }
  
  startTimer() {
    if (!this.state.timerStarted) {
      this.state.timerStarted = true;
      this.saveProgress();
    }
  }
  
  updateTime(deltaMs) {
    if (!this.state.timerStarted || this.state.isPaused || this.state.isComplete) {
      return;
    }
    
    this.state.timeMs += deltaMs;
    
    const now = Date.now();
    if (now - this.lastSaveTime > this.saveThrottleMs) {
      this.saveProgress();
      this.lastSaveTime = now;
    }
  }
  
  // Get cell color (which color occupies this cell)
  getCellColor(x, y) {
    for (const [colorStr, path] of Object.entries(this.state.paths)) {
      if (path && path.some(([px, py]) => px === x && py === y)) {
        const color = parseInt(colorStr, 10);
        return isNaN(color) ? null : color;
      }
    }
    return null;
  }
  
  // Check if a cell is an endpoint
  isEndpoint(x, y) {
    for (const pair of this.puzzle.pairs) {
      if ((pair.start[0] === x && pair.start[1] === y) ||
          (pair.end[0] === x && pair.end[1] === y)) {
        return pair.color;
      }
    }
    return null;
  }
  
  // Check if a specific color's path is complete (connects both endpoints)
  isPathComplete(color) {
    const pair = this.getPair(color);
    if (!pair) return false;
    
    const path = this.state.paths[color] || [];
    if (path.length < 2) return false;
    
    const pathStart = path[0];
    const pathEnd = path[path.length - 1];
    
    // Check if path connects both endpoints (in either direction)
    const startsAtStart = pathStart[0] === pair.start[0] && pathStart[1] === pair.start[1];
    const startsAtEnd = pathStart[0] === pair.end[0] && pathStart[1] === pair.end[1];
    const endsAtStart = pathEnd[0] === pair.start[0] && pathEnd[1] === pair.start[1];
    const endsAtEnd = pathEnd[0] === pair.end[0] && pathEnd[1] === pair.end[1];
    
    return (startsAtStart && endsAtEnd) || (startsAtEnd && endsAtStart);
  }
}
