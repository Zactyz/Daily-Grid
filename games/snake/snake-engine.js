import { normalizeWall, STORAGE_KEYS } from './snake-utils.js';

export class SnakeEngine {
  constructor(puzzle, storageKey) {
    this.puzzle = puzzle;
    this.storageKey = storageKey || STORAGE_KEYS.SNAKE_PROGRESS; // Default to main key if not provided
    this.state = {
      path: [],
      timeMs: 0,
      hintsUsed: 0,
      isComplete: false,
      isPaused: false,
      isDragging: false,
      timerStarted: false
    };
    
    this.wallSet = new Set(puzzle.walls || []);
    this.numberMap = puzzle.numbers || {};
    
    this.lastSaveTime = 0;
    this.saveThrottleMs = 5000;
    
    this.loadProgress();
  }
  
  saveProgress() {
    const progress = {
      puzzleId: this.puzzle.id,
      path: this.state.path,
      timeMs: this.state.timeMs,
      hintsUsed: this.state.hintsUsed,
      isComplete: this.state.isComplete
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
      if (!saved) return;
      
      const progress = JSON.parse(saved);
      if (progress.puzzleId === this.puzzle.id) {
        this.state.path = progress.path || [];
        this.state.timeMs = progress.timeMs || 0;
        this.state.hintsUsed = progress.hintsUsed || 0;
        this.state.isComplete = progress.isComplete || false;
        this.state.isPaused = this.state.isComplete; // Stay paused if completed
        this.state.timerStarted = this.state.path.length > 0;
      }
    } catch (e) {
      console.warn('Failed to load progress:', e);
    }
  }
  
  clearProgress() {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (e) {
      console.warn('Failed to clear progress:', e);
    }
  }
  
  canAddCell(x, y) {
    const cellKey = `${x},${y}`;
    
    if (x < 0 || x >= this.puzzle.width || y < 0 || y >= this.puzzle.height) {
      return false;
    }
    
    if (this.state.path.some(([px, py]) => px === x && py === y)) {
      return false;
    }
    
    if (this.state.path.length === 0) {
      return this.numberMap[cellKey] === 1;
    }
    
    const [lastX, lastY] = this.state.path[this.state.path.length - 1];
    const isAdjacent = (Math.abs(x - lastX) === 1 && y === lastY) ||
                      (Math.abs(y - lastY) === 1 && x === lastX);
    if (!isAdjacent) return false;
    
    const wallId = normalizeWall([lastX, lastY], [x, y]);
    if (this.wallSet.has(wallId)) return false;
    
    const cellNumber = this.numberMap[cellKey];
    if (cellNumber !== undefined) {
      const expectedNumber = this.getNextExpectedNumber();
      if (cellNumber !== expectedNumber) return false;
    }
    
    return true;
  }
  
  getNextExpectedNumber() {
    let maxSeen = 0;
    for (const [x, y] of this.state.path) {
      const num = this.numberMap[`${x},${y}`];
      if (num !== undefined && num > maxSeen) {
        maxSeen = num;
      }
    }
    return maxSeen + 1;
  }
  
  addCell(x, y) {
    if (!this.canAddCell(x, y)) return false;
    
    this.state.path.push([x, y]);
    
    if (!this.state.timerStarted) {
      this.state.timerStarted = true;
    }
    
    this.checkWinCondition();
    this.saveProgress();
    return true;
  }
  
  undoToCell(x, y) {
    const idx = this.state.path.findIndex(([px, py]) => px === x && py === y);
    if (idx === -1) return false;
    
    this.state.path = this.state.path.slice(0, idx + 1);
    this.state.isComplete = false;
    
    this.saveProgress();
    return true;
  }
  
  reset(keepTimer = false) {
    this.state.path = [];
    if (!keepTimer) {
        this.state.timeMs = 0;
    }
    this.state.hintsUsed = 0;
    this.state.isComplete = false;
    this.state.timerStarted = false;
    this.clearProgress();
  }
  
  checkWinCondition() {
    if (this.state.path.length !== this.puzzle.width * this.puzzle.height) {
      return false;
    }
    
    const visitedNumbers = [];
    for (const [x, y] of this.state.path) {
      const num = this.numberMap[`${x},${y}`];
      if (num !== undefined) {
        visitedNumbers.push(num);
      }
    }
    
    const expectedNumbers = Object.values(this.numberMap).sort((a, b) => a - b);
    const isCorrectOrder = visitedNumbers.length === expectedNumbers.length &&
                          visitedNumbers.every((num, i) => num === expectedNumbers[i]);
    
    if (isCorrectOrder) {
      this.state.isComplete = true;
      this.state.isPaused = true;
      this.saveCompletedState(); // Save completed state separately
      return true;
    }
    
    return false;
  }
  
  // Save completed state separately (doesn't get cleared by reset)
  saveCompletedState() {
    const completedKey = `${this.storageKey}_completed`;
    const completedData = {
      puzzleId: this.puzzle.id,
      path: this.state.path,
      timeMs: this.state.timeMs
    };
    try {
      localStorage.setItem(completedKey, JSON.stringify(completedData));
    } catch (e) {
      console.warn('Failed to save completed state:', e);
    }
  }
  
  // Load completed state (called when user already submitted but reset the puzzle)
  loadCompletedState() {
    const completedKey = `${this.storageKey}_completed`;
    try {
      const saved = localStorage.getItem(completedKey);
      if (!saved) return false;
      
      const completedData = JSON.parse(saved);
      if (completedData.puzzleId === this.puzzle.id) {
        this.state.path = completedData.path || [];
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
}
