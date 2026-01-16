export class SnakeRenderer {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.engine = engine;
    
    // Modern, refined color palette
    this.colors = {
      bg: '#0a0a0f',
      cellEmpty: 'rgba(255, 255, 255, 0.15)',
      cellHover: 'rgba(255, 255, 255, 0.2)',
      cellPath: 'rgba(240, 198, 104, 0.12)',
      cellStart: 'rgba(240, 198, 104, 0.2)',
      cellEnd: 'rgba(240, 198, 104, 0.2)',
      gridLine: 'rgba(255, 255, 255, 0.2)',
      pathLine: '#f0c674',
      pathLineGlow: 'rgba(240, 198, 104, 0.4)',
      number: '#f0c674',
      numberVisited: 'rgba(240, 198, 104, 0.5)',
      wall: 'rgba(255, 255, 255, 0.25)',
      dot: '#f0c674'
    };
    
    this.resize();
  }
  
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    
    this.displayWidth = rect.width;
    this.displayHeight = rect.height;
    
    const puzzle = this.engine.puzzle;
    const maxDim = Math.max(puzzle.width, puzzle.height);
    const gap = 3;
    const padding = 24;
    
    const availableSpace = Math.min(this.displayWidth, this.displayHeight) - padding * 2;
    this.cellSize = (availableSpace - gap * (maxDim - 1)) / maxDim;
    this.gap = gap;
    
    // Center the grid
    const gridWidth = puzzle.width * this.cellSize + (puzzle.width - 1) * gap;
    const gridHeight = puzzle.height * this.cellSize + (puzzle.height - 1) * gap;
    this.offsetX = (this.displayWidth - gridWidth) / 2;
    this.offsetY = (this.displayHeight - gridHeight) / 2;
  }
  
  render() {
    // Clear with background
    this.ctx.fillStyle = this.colors.bg;
    this.ctx.fillRect(0, 0, this.displayWidth, this.displayHeight);
    
    this.drawCells();
    this.drawPath();
    this.drawWalls();
    this.drawNumbers();
  }
  
  drawCells() {
    const cornerRadius = Math.min(8, this.cellSize * 0.12);
    
    for (let y = 0; y < this.engine.puzzle.height; y++) {
      for (let x = 0; x < this.engine.puzzle.width; x++) {
        this.drawCell(x, y, cornerRadius);
      }
    }
  }
  
  drawCell(x, y, cornerRadius) {
    const cellKey = `${x},${y}`;
    const isInPath = this.engine.state.path.some(([px, py]) => px === x && py === y);
    const hasNumber = this.engine.numberMap[cellKey] !== undefined;
    const isStart = this.engine.numberMap[cellKey] === 1;
    const maxNum = Math.max(...Object.values(this.engine.numberMap));
    const isEnd = this.engine.numberMap[cellKey] === maxNum;
    
    const px = this.offsetX + x * (this.cellSize + this.gap);
    const py = this.offsetY + y * (this.cellSize + this.gap);
    
    // Determine fill color
    let fillColor = this.colors.cellEmpty;
    if (isInPath) {
      fillColor = this.colors.cellPath;
    }
    if (isStart || isEnd) {
      fillColor = isInPath ? this.colors.cellPath : (isStart ? this.colors.cellStart : this.colors.cellEnd);
    }
    
    // Draw rounded rectangle
    this.ctx.fillStyle = fillColor;
    this.roundRect(px, py, this.cellSize, this.cellSize, cornerRadius);
    this.ctx.fill();
    
    // Border - more visible for numbered cells
    if (hasNumber) {
      this.ctx.strokeStyle = 'rgba(240, 198, 104, 0.3)';
      this.ctx.lineWidth = 1.5;
    } else {
      this.ctx.strokeStyle = this.colors.gridLine;
      this.ctx.lineWidth = 1;
    }
    this.roundRect(px, py, this.cellSize, this.cellSize, cornerRadius);
    this.ctx.stroke();
  }
  
  roundRect(x, y, width, height, radius) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + width - radius, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.ctx.lineTo(x + width, y + height - radius);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.ctx.lineTo(x + radius, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
    this.ctx.closePath();
  }
  
  drawWalls() {
    this.ctx.strokeStyle = this.colors.wall;
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';
    
    for (const wallId of this.engine.wallSet) {
      const [cellA, cellB] = wallId.split('-').map(s => s.split(',').map(Number));
      const [ax, ay] = cellA;
      const [bx, by] = cellB;
      
      let x1, y1, x2, y2;
      
      if (ax === bx) {
        // Vertical wall (cells stacked vertically)
        const x = ax;
        const maxY = Math.max(ay, by);
        
        x1 = this.offsetX + x * (this.cellSize + this.gap);
        y1 = this.offsetY + maxY * (this.cellSize + this.gap) - this.gap / 2;
        x2 = x1 + this.cellSize;
        y2 = y1;
      } else {
        // Horizontal wall (cells side by side)
        const y = ay;
        const maxX = Math.max(ax, bx);
        
        x1 = this.offsetX + maxX * (this.cellSize + this.gap) - this.gap / 2;
        y1 = this.offsetY + y * (this.cellSize + this.gap);
        x2 = x1;
        y2 = y1 + this.cellSize;
      }
      
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
    }
  }
  
  drawPath() {
    if (this.engine.state.path.length === 0) return;
    
    // Draw path glow
    if (this.engine.state.path.length >= 2) {
      this.ctx.strokeStyle = this.colors.pathLineGlow;
      this.ctx.lineWidth = 12;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.drawPathLine();
    }
    
    // Draw main path line
    if (this.engine.state.path.length >= 2) {
      this.ctx.strokeStyle = this.colors.pathLine;
      this.ctx.lineWidth = 4;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.drawPathLine();
    }
    
    // Draw dots at each visited cell
    this.ctx.fillStyle = this.colors.dot;
    for (const [x, y] of this.engine.state.path) {
      const px = this.offsetX + x * (this.cellSize + this.gap) + this.cellSize / 2;
      const py = this.offsetY + y * (this.cellSize + this.gap) + this.cellSize / 2;
      
      this.ctx.beginPath();
      this.ctx.arc(px, py, 5, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
  
  drawPathLine() {
    this.ctx.beginPath();
    
    const [startX, startY] = this.engine.state.path[0];
    const startPx = this.offsetX + startX * (this.cellSize + this.gap) + this.cellSize / 2;
    const startPy = this.offsetY + startY * (this.cellSize + this.gap) + this.cellSize / 2;
    this.ctx.moveTo(startPx, startPy);
    
    for (let i = 1; i < this.engine.state.path.length; i++) {
      const [x, y] = this.engine.state.path[i];
      const px = this.offsetX + x * (this.cellSize + this.gap) + this.cellSize / 2;
      const py = this.offsetY + y * (this.cellSize + this.gap) + this.cellSize / 2;
      this.ctx.lineTo(px, py);
    }
    
    this.ctx.stroke();
  }
  
  drawNumbers() {
    const fontSize = Math.max(14, Math.min(24, this.cellSize * 0.4));
    this.ctx.font = `600 ${fontSize}px 'Space Grotesk', sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    
    for (const [cellKey, num] of Object.entries(this.engine.numberMap)) {
      const [x, y] = cellKey.split(',').map(Number);
      const px = this.offsetX + x * (this.cellSize + this.gap) + this.cellSize / 2;
      const py = this.offsetY + y * (this.cellSize + this.gap) + this.cellSize / 2;
      
      // Check if this cell has been visited
      const isVisited = this.engine.state.path.some(([pathX, pathY]) => pathX === x && pathY === y);
      
      this.ctx.fillStyle = isVisited ? this.colors.numberVisited : this.colors.number;
      this.ctx.fillText(num.toString(), px, py);
    }
  }
  
  getCellFromPointer(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    for (let cy = 0; cy < this.engine.puzzle.height; cy++) {
      for (let cx = 0; cx < this.engine.puzzle.width; cx++) {
        const px = this.offsetX + cx * (this.cellSize + this.gap);
        const py = this.offsetY + cy * (this.cellSize + this.gap);
        
        if (x >= px && x <= px + this.cellSize &&
            y >= py && y <= py + this.cellSize) {
          return [cx, cy];
        }
      }
    }
    
    return null;
  }
}
