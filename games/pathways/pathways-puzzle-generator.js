// Deterministic puzzle generator for Pathways (Flow) game
// Generates puzzles with colored pairs that need to be connected

import { createSeededRandom, hashString } from './pathways-utils.js';

// Generate a complete grid filling with non-crossing paths
// Uses a greedy approach: place paths one at a time, ensuring they don't conflict
function generateSolvedGrid(width, height, numColors, random) {
  const grid = Array(height).fill(null).map(() => Array(width).fill(null));
  const pairs = [];
  
  // Select endpoint pairs first
  const allCells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      allCells.push([x, y]);
    }
  }
  
  // Shuffle for random endpoint selection
  const shuffledCells = [...allCells];
  for (let i = shuffledCells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffledCells[i], shuffledCells[j]] = [shuffledCells[j], shuffledCells[i]];
  }
  
  // Select endpoint pairs
  const endpoints = [];
  for (let color = 0; color < numColors && shuffledCells.length >= 2; color++) {
    const start = shuffledCells.pop();
    const end = shuffledCells.pop();
    endpoints.push({ color, start, end });
    grid[start[1]][start[0]] = color;
    grid[end[1]][end[0]] = color;
  }
  
  // Try to connect endpoints with paths using a simple pathfinding approach
  const paths = [];
  for (const { color, start, end } of endpoints) {
    const path = findSimplePath(grid, start, end, width, height, color, random);
    if (path && path.length > 1) {
      // Mark path cells
      for (let i = 1; i < path.length - 1; i++) {
        const [x, y] = path[i];
        grid[y][x] = color;
      }
      paths.push({ color, path });
    } else {
      return null; // Failed to connect this pair
    }
  }
  
  // Check if grid is fully filled
  let filled = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] !== null) filled++;
    }
  }
  
  const totalCells = width * height;
  
  // If not fully filled, try to fill remaining cells with additional paths
  const remainingCells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] === null) {
        remainingCells.push([x, y]);
      }
    }
  }
  
  // Fill remaining cells by extending existing paths or creating new ones
  while (remainingCells.length > 0 && paths.length < numColors + 3) {
    // Try to extend an existing path or create a new connection
    const cell = remainingCells[0];
    const neighbors = getNeighbors(cell[0], cell[1], width, height);
    
    // Find a neighbor that's already filled
    let connected = false;
    for (const [nx, ny] of neighbors) {
      if (grid[ny][nx] !== null) {
        const color = grid[ny][nx];
        grid[cell[1]][cell[0]] = color;
        remainingCells.shift();
        connected = true;
        break;
      }
    }
    
    if (!connected) {
      // Create a new path pair
      if (remainingCells.length >= 2) {
        const start = remainingCells.shift();
        const endIdx = Math.floor(random() * Math.min(remainingCells.length, 5));
        const end = remainingCells.splice(endIdx, 1)[0];
        
        const newColor = numColors + paths.length;
        const path = findSimplePath(grid, start, end, width, height, newColor, random);
        if (path) {
          for (let i = 1; i < path.length - 1; i++) {
            const [x, y] = path[i];
            grid[y][x] = newColor;
            const idx = remainingCells.findIndex(([cx, cy]) => cx === x && cy === y);
            if (idx !== -1) remainingCells.splice(idx, 1);
          }
          endpoints.push({ color: newColor, start, end });
          paths.push({ color: newColor, path });
        } else {
          remainingCells.push(start, end);
          break;
        }
      } else {
        break;
      }
    }
  }
  
  // Final check
  filled = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] !== null) filled++;
    }
  }
  
  if (filled === totalCells && endpoints.length >= 3) {
    return {
      pairs: endpoints.map(e => ({
        color: e.color,
        start: e.start,
        end: e.end
      }))
    };
  }
  
  return null;
}

function getNeighbors(x, y, width, height) {
  const neighbors = [];
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
      neighbors.push([nx, ny]);
    }
  }
  return neighbors;
}

// Find a path between two points avoiding already-filled cells (except endpoints)
function findSimplePath(grid, start, end, width, height, color, random) {
  const [sx, sy] = start;
  const [ex, ey] = end;
  
  // Use BFS to find path
  const queue = [[sx, sy, [[sx, sy]]]];
  const visited = new Set([`${sx},${sy}`]);
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  
  // Shuffle directions for randomness
  const shuffledDirs = [...dirs];
  for (let i = shuffledDirs.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffledDirs[i], shuffledDirs[j]] = [shuffledDirs[j], shuffledDirs[i]];
  }
  
  while (queue.length > 0) {
    const [x, y, path] = queue.shift();
    
    if (x === ex && y === ey) {
      return path;
    }
    
    // Try each direction
    for (const [dx, dy] of shuffledDirs) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited.has(key)) {
        // Can move to empty cell or target endpoint
        const cellValue = grid[ny][nx];
        const isTarget = nx === ex && ny === ey;
        if (cellValue === null || isTarget) {
          visited.add(key);
          queue.push([nx, ny, [...path, [nx, ny]]]);
        }
      }
    }
  }
  
  return null;
}

// Main export: Generate puzzle for a given date string
export function generatePuzzleForDate(puzzleId) {
  const baseSeed = hashString(puzzleId);
  const paramRandom = createSeededRandom(baseSeed);
  
  // Vary grid size: 5x5 (50%), 5x6/6x5 (40%), 6x6 (10%)
  const sizeRoll = paramRandom();
  let width, height;
  if (sizeRoll < 0.5) {
    width = 5; height = 5;
  } else if (sizeRoll < 0.7) {
    width = 5; height = 6;
  } else if (sizeRoll < 0.9) {
    width = 6; height = 5;
  } else {
    width = 6; height = 6;
  }
  
  const totalCells = width * height;
  
  // Number of color pairs: 4-6 depending on grid size (need more to fill the grid)
  // For 5x5 (25 cells): 4-5 pairs, for 6x6 (36 cells): 5-6 pairs
  const minPairs = Math.max(4, Math.floor(totalCells / 7));
  const maxPairs = Math.min(6, Math.floor(totalCells / 5));
  const numColors = minPairs + Math.floor(paramRandom() * (maxPairs - minPairs + 1));
  
  // Try to generate a valid solved grid
  for (let attempt = 0; attempt < 200; attempt++) {
    const seed = baseSeed + attempt * 1000;
    const random = createSeededRandom(seed);
    
    const result = generateSolvedGrid(width, height, numColors, random);
    if (result && result.pairs.length >= 4) {
      return {
        id: puzzleId,
        width,
        height,
        pairs: result.pairs
      };
    }
  }
  
  // Fallback: Try smaller grid with 4 colors
  const smallerWidth = 5;
  const smallerHeight = 5;
  const smallerNumColors = 4;
  
  for (let attempt = 0; attempt < 100; attempt++) {
    const seed = baseSeed + 500000 + attempt * 1000;
    const random = createSeededRandom(seed);
    
    const result = generateSolvedGrid(smallerWidth, smallerHeight, smallerNumColors, random);
    if (result && result.pairs.length >= 4) {
      return {
        id: puzzleId,
        width: smallerWidth,
        height: smallerHeight,
        pairs: result.pairs
      };
    }
  }
  
  // Ultimate fallback - a known solvable 5x5 puzzle with 5 pairs
  console.warn('Using ultimate fallback puzzle for', puzzleId);
  return {
    id: puzzleId,
    width: 5,
    height: 5,
    pairs: [
      { color: 0, start: [0, 0], end: [4, 0] },
      { color: 1, start: [0, 1], end: [4, 1] },
      { color: 2, start: [0, 2], end: [4, 2] },
      { color: 3, start: [0, 3], end: [4, 3] },
      { color: 4, start: [0, 4], end: [4, 4] }
    ]
  };
}
