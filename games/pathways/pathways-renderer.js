export class PathwaysRenderer {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.engine = engine;
    
    // Color palette - 8 maximally distinct colors
    // Chosen for maximum visual separation (no similar reds/oranges/pinks)
    this.colors = [
      { main: '#ef5350', glow: 'rgba(239, 83, 80, 0.4)' },    // Red
      { main: '#42a5f5', glow: 'rgba(66, 165, 245, 0.4)' },   // Blue
      { main: '#66bb6a', glow: 'rgba(102, 187, 106, 0.4)' },  // Green
      { main: '#ffca28', glow: 'rgba(255, 202, 40, 0.4)' },   // Yellow/Gold
      { main: '#ab47bc', glow: 'rgba(171, 71, 188, 0.4)' },   // Purple
      { main: '#26c6da', glow: 'rgba(38, 198, 218, 0.4)' },   // Cyan
      { main: '#ec407a', glow: 'rgba(236, 64, 122, 0.4)' },   // Magenta/Pink (distinct from red)
      { main: '#78909c', glow: 'rgba(120, 144, 156, 0.4)' },  // Blue-Gray
    ];
    
    this.bgColor = '#0a0a0f';
    this.cellEmpty = 'rgba(255, 255, 255, 0.15)';
    this.gridLine = 'rgba(255, 255, 255, 0.2)';
    
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
    this.ctx.fillStyle = this.bgColor;
    this.ctx.fillRect(0, 0, this.displayWidth, this.displayHeight);
    
    this.drawCells();
    this.drawWalls();
    this.drawRequiredCellMarkers();
    this.drawPaths();
    this.drawEndpoints();
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
    const cellColor = this.engine.getCellColor(x, y);
    const px = this.offsetX + x * (this.cellSize + this.gap);
    const py = this.offsetY + y * (this.cellSize + this.gap);
    
    // Determine fill color
    let fillColor = this.cellEmpty;
    if (cellColor !== null && this.colors[cellColor]) {
      fillColor = this.colors[cellColor].main + '33'; // Add transparency
    }
    
    // Draw rounded rectangle
    this.ctx.fillStyle = fillColor;
    this.roundRect(px, py, this.cellSize, this.cellSize, cornerRadius);
    this.ctx.fill();
    
    // Border
    this.ctx.strokeStyle = this.gridLine;
    this.ctx.lineWidth = 1;
    this.roundRect(px, py, this.cellSize, this.cellSize, cornerRadius);
    this.ctx.stroke();
  }
  
  drawWalls() {
    if (!this.engine.wallSet || this.engine.wallSet.size === 0) return;
    
    // Coral/rose color for Pathways walls (distinct from Snake's gold)
    const wallColor = '#e05555';
    const wallGlow = 'rgba(224, 85, 85, 0.5)';
    
    // Calculate wall coordinates once for both glow and main line
    const wallCoords = [];
    
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
      
      wallCoords.push({ x1, y1, x2, y2 });
    }
    
    // Draw wall glow (wider, semi-transparent)
    this.ctx.strokeStyle = wallGlow;
    this.ctx.lineWidth = 8;
    this.ctx.lineCap = 'round';
    
    for (const { x1, y1, x2, y2 } of wallCoords) {
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
    }
    
    // Draw main wall line (solid, prominent)
    this.ctx.strokeStyle = wallColor;
    this.ctx.lineWidth = 4;
    this.ctx.lineCap = 'round';
    
    for (const { x1, y1, x2, y2 } of wallCoords) {
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
    }
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
  
  drawRequiredCellMarkers() {
    if (!this.engine.requiredCellMap || this.engine.requiredCellMap.size === 0) return;
    
    for (const [cellKey, requiredColor] of this.engine.requiredCellMap) {
      const [x, y] = cellKey.split(',').map(Number);
      const px = this.offsetX + x * (this.cellSize + this.gap);
      const py = this.offsetY + y * (this.cellSize + this.gap);
      
      // Get the color data for the required color
      const colorData = this.colors[requiredColor];
      if (!colorData) continue;
      
      // Check if cell is currently filled with correct color
      const actualColor = this.engine.getCellColor(x, y);
      const isCorrect = actualColor === requiredColor;
      
      // Draw colored ring/glow around the cell
      const ringWidth = 4;
      const ringRadius = this.cellSize / 2 + ringWidth / 2;
      
      // Outer glow
      if (!isCorrect) {
        // If wrong color or empty, show pulsing glow
        const glowAlpha = 0.6 + Math.sin(Date.now() / 500) * 0.2; // Pulsing effect
        // Convert hex to rgba
        const hex = colorData.main.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        this.ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${glowAlpha})`;
      } else {
        // If correct, show subtle glow
        this.ctx.strokeStyle = colorData.glow;
      }
      this.ctx.lineWidth = ringWidth + 4;
      this.ctx.beginPath();
      this.ctx.arc(px + this.cellSize / 2, py + this.cellSize / 2, ringRadius, 0, Math.PI * 2);
      this.ctx.stroke();
      
      // Main ring
      this.ctx.strokeStyle = colorData.main;
      this.ctx.lineWidth = ringWidth;
      this.ctx.beginPath();
      this.ctx.arc(px + this.cellSize / 2, py + this.cellSize / 2, ringRadius, 0, Math.PI * 2);
      this.ctx.stroke();
      
      // If wrong color, add visual conflict indicator
      if (actualColor !== null && actualColor !== requiredColor) {
        // Draw X mark or red border flash
        this.ctx.strokeStyle = '#ff4444';
        this.ctx.lineWidth = 2;
        const centerX = px + this.cellSize / 2;
        const centerY = py + this.cellSize / 2;
        const crossSize = this.cellSize * 0.3;
        this.ctx.beginPath();
        this.ctx.moveTo(centerX - crossSize, centerY - crossSize);
        this.ctx.lineTo(centerX + crossSize, centerY + crossSize);
        this.ctx.moveTo(centerX + crossSize, centerY - crossSize);
        this.ctx.lineTo(centerX - crossSize, centerY + crossSize);
        this.ctx.stroke();
      }
    }
  }
  
  drawPaths() {
    // Draw each color's path
    for (const [colorStr, path] of Object.entries(this.engine.state.paths)) {
      if (!path || path.length < 2) continue;
      
      const color = parseInt(colorStr);
      const colorData = this.colors[color];
      if (!colorData) continue;
      
      // Draw path glow
      this.ctx.strokeStyle = colorData.glow;
      this.ctx.lineWidth = 12;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.drawPathLine(path);
      
      // Draw main path line
      this.ctx.strokeStyle = colorData.main;
      this.ctx.lineWidth = 4;
      this.drawPathLine(path);
    }
  }
  
  drawPathLine(path) {
    this.ctx.beginPath();
    
    const [startX, startY] = path[0];
    const startPx = this.offsetX + startX * (this.cellSize + this.gap) + this.cellSize / 2;
    const startPy = this.offsetY + startY * (this.cellSize + this.gap) + this.cellSize / 2;
    this.ctx.moveTo(startPx, startPy);
    
    for (let i = 1; i < path.length; i++) {
      const [x, y] = path[i];
      const px = this.offsetX + x * (this.cellSize + this.gap) + this.cellSize / 2;
      const py = this.offsetY + y * (this.cellSize + this.gap) + this.cellSize / 2;
      this.ctx.lineTo(px, py);
    }
    
    this.ctx.stroke();
  }
  
  drawEndpoints() {
    const endpointRadius = Math.min(12, this.cellSize * 0.25);
    
    for (const pair of this.engine.puzzle.pairs) {
      const colorData = this.colors[pair.color];
      if (!colorData) continue;
      
      // Draw start endpoint
      const [sx, sy] = pair.start;
      const startPx = this.offsetX + sx * (this.cellSize + this.gap) + this.cellSize / 2;
      const startPy = this.offsetY + sy * (this.cellSize + this.gap) + this.cellSize / 2;
      
      // Glow
      this.ctx.fillStyle = colorData.glow;
      this.ctx.beginPath();
      this.ctx.arc(startPx, startPy, endpointRadius + 4, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Main circle
      this.ctx.fillStyle = colorData.main;
      this.ctx.beginPath();
      this.ctx.arc(startPx, startPy, endpointRadius, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Border
      this.ctx.strokeStyle = this.bgColor;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
      
      // Draw end endpoint
      const [ex, ey] = pair.end;
      const endPx = this.offsetX + ex * (this.cellSize + this.gap) + this.cellSize / 2;
      const endPy = this.offsetY + ey * (this.cellSize + this.gap) + this.cellSize / 2;
      
      // Glow
      this.ctx.fillStyle = colorData.glow;
      this.ctx.beginPath();
      this.ctx.arc(endPx, endPy, endpointRadius + 4, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Main circle
      this.ctx.fillStyle = colorData.main;
      this.ctx.beginPath();
      this.ctx.arc(endPx, endPy, endpointRadius, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Border
      this.ctx.strokeStyle = this.bgColor;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
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
  
  getColorFromPointer(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    // Check if clicking on an endpoint
    for (const pair of this.engine.puzzle.pairs) {
      const [sx, sy] = pair.start;
      const startPx = this.offsetX + sx * (this.cellSize + this.gap) + this.cellSize / 2;
      const startPy = this.offsetY + sy * (this.cellSize + this.gap) + this.cellSize / 2;
      const distStart = Math.sqrt((x - startPx) ** 2 + (y - startPy) ** 2);
      
      const [ex, ey] = pair.end;
      const endPx = this.offsetX + ex * (this.cellSize + this.gap) + this.cellSize / 2;
      const endPy = this.offsetY + ey * (this.cellSize + this.gap) + this.cellSize / 2;
      const distEnd = Math.sqrt((x - endPx) ** 2 + (y - endPy) ** 2);
      
      const endpointRadius = Math.min(12, this.cellSize * 0.25) + 4;
      if (distStart < endpointRadius || distEnd < endpointRadius) {
        return pair.color;
      }
      
      // Check if clicking on path
      const path = this.engine.state.paths[pair.color] || [];
      for (const [px, py] of path) {
        const cellPx = this.offsetX + px * (this.cellSize + this.gap) + this.cellSize / 2;
        const cellPy = this.offsetY + py * (this.cellSize + this.gap) + this.cellSize / 2;
        const dist = Math.sqrt((x - cellPx) ** 2 + (y - cellPy) ** 2);
        if (dist < this.cellSize / 2) {
          return pair.color;
        }
      }
    }
    
    return null;
  }
}
