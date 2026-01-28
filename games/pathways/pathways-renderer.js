export class PathwaysRenderer {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.engine = engine;
    
    // Color palette - distinct, well-separated hues (no similar colors)
    this.colors = [
      { main: '#f08080', glow: 'rgba(240, 128, 128, 0.4)' },  // Coral Red
      { main: '#64b5f6', glow: 'rgba(100, 181, 246, 0.4)' },  // Blue
      { main: '#a5d6a7', glow: 'rgba(165, 214, 167, 0.4)' },  // Green
      { main: '#f0c674', glow: 'rgba(240, 198, 104, 0.4)' },  // Amber/Yellow
      { main: '#ce93d8', glow: 'rgba(206, 147, 216, 0.4)' },  // Purple
      { main: '#ff8a65', glow: 'rgba(255, 138, 101, 0.4)' },  // Orange
      { main: '#4dd0e1', glow: 'rgba(77, 208, 225, 0.4)' },   // Cyan
      { main: '#f48fb1', glow: 'rgba(244, 143, 177, 0.4)' },  // Pink
      { main: '#fff176', glow: 'rgba(255, 241, 118, 0.4)' },  // Yellow
      { main: '#90a4ae', glow: 'rgba(144, 164, 174, 0.4)' },  // Gray-Blue
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
    this.drawBlockedCells();
    this.drawCorridorWalls();
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
    
    // Skip blocked cells (drawn separately)
    if (this.engine.blockedCells && this.engine.blockedCells.has(`${x},${y}`)) {
      return;
    }
    
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
  
  drawBlockedCells() {
    if (!this.engine.blockedCells || this.engine.blockedCells.size === 0) return;
    
    const cornerRadius = Math.min(8, this.cellSize * 0.12);
    const blockedColor = '#3a3a4a'; // Dark gray-blue, distinct from empty cells
    const blockedPattern = '#2a2a3a'; // Even darker for pattern
    
    for (const cellKey of this.engine.blockedCells) {
      const [x, y] = cellKey.split(',').map(Number);
      const px = this.offsetX + x * (this.cellSize + this.gap);
      const py = this.offsetY + y * (this.cellSize + this.gap);
      
      // Draw blocked cell background
      this.ctx.fillStyle = blockedColor;
      this.roundRect(px, py, this.cellSize, this.cellSize, cornerRadius);
      this.ctx.fill();
      
      // Draw diagonal hatch pattern for "impassable" visual
      this.ctx.strokeStyle = blockedPattern;
      this.ctx.lineWidth = 1.5;
      const spacing = 4;
      for (let i = -this.cellSize; i < this.cellSize * 2; i += spacing) {
        this.ctx.beginPath();
        this.ctx.moveTo(px + i, py);
        this.ctx.lineTo(px + i + this.cellSize, py + this.cellSize);
        this.ctx.stroke();
      }
      
      // Border (darker)
      this.ctx.strokeStyle = '#1a1a2a';
      this.ctx.lineWidth = 1;
      this.roundRect(px, py, this.cellSize, this.cellSize, cornerRadius);
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
  
  drawCorridorWalls() {
    if (!this.engine.corridorMap || this.engine.corridorMap.size === 0) return;
    
    const wallColor = '#8b6914'; // Same as Snake walls for consistency
    const wallGlow = 'rgba(139, 105, 20, 0.6)';
    const wallWidth = 3;
    
    for (const [cellKey, openDirs] of this.engine.corridorMap) {
      const [x, y] = cellKey.split(',').map(Number);
      const px = this.offsetX + x * (this.cellSize + this.gap);
      const py = this.offsetY + y * (this.cellSize + this.gap);
      
      // Draw walls on closed sides
      this.ctx.strokeStyle = wallGlow;
      this.ctx.lineWidth = wallWidth + 2;
      this.ctx.lineCap = 'round';
      
      if (!openDirs.includes('north')) {
        // Wall on north side
        this.ctx.beginPath();
        this.ctx.moveTo(px + 4, py);
        this.ctx.lineTo(px + this.cellSize - 4, py);
        this.ctx.stroke();
      }
      if (!openDirs.includes('south')) {
        // Wall on south side
        this.ctx.beginPath();
        this.ctx.moveTo(px + 4, py + this.cellSize);
        this.ctx.lineTo(px + this.cellSize - 4, py + this.cellSize);
        this.ctx.stroke();
      }
      if (!openDirs.includes('east')) {
        // Wall on east side
        this.ctx.beginPath();
        this.ctx.moveTo(px + this.cellSize, py + 4);
        this.ctx.lineTo(px + this.cellSize, py + this.cellSize - 4);
        this.ctx.stroke();
      }
      if (!openDirs.includes('west')) {
        // Wall on west side
        this.ctx.beginPath();
        this.ctx.moveTo(px, py + 4);
        this.ctx.lineTo(px, py + this.cellSize - 4);
        this.ctx.stroke();
      }
      
      // Draw main wall lines
      this.ctx.strokeStyle = wallColor;
      this.ctx.lineWidth = wallWidth;
      
      if (!openDirs.includes('north')) {
        this.ctx.beginPath();
        this.ctx.moveTo(px + 4, py);
        this.ctx.lineTo(px + this.cellSize - 4, py);
        this.ctx.stroke();
      }
      if (!openDirs.includes('south')) {
        this.ctx.beginPath();
        this.ctx.moveTo(px + 4, py + this.cellSize);
        this.ctx.lineTo(px + this.cellSize - 4, py + this.cellSize);
        this.ctx.stroke();
      }
      if (!openDirs.includes('east')) {
        this.ctx.beginPath();
        this.ctx.moveTo(px + this.cellSize, py + 4);
        this.ctx.lineTo(px + this.cellSize, py + this.cellSize - 4);
        this.ctx.stroke();
      }
      if (!openDirs.includes('west')) {
        this.ctx.beginPath();
        this.ctx.moveTo(px, py + 4);
        this.ctx.lineTo(px, py + this.cellSize - 4);
        this.ctx.stroke();
      }
    }
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
