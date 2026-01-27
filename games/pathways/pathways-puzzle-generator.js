// Deterministic puzzle generator for Pathways (Flow) game
// Generates puzzles by filling a grid completely with snake-like paths

import { createSeededRandom, hashString } from './pathways-utils.js';

// Fill the entire grid with colored paths
function fillGridWithPaths(width, height, numColors, random) {
  const totalCells = width * height;
  const grid = Array(height).fill(null).map(() => Array(width).fill(-1));
  const paths = []; // Each path is an array of [x, y] coordinates
  
  // Initialize paths array
  for (let i = 0; i < numColors; i++) {
    paths.push([]);
  }
  
  // Get all cells and shuffle them
  const allCells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      allCells.push([x, y]);
    }
  }
  
  for (let i = allCells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [allCells[i], allCells[j]] = [allCells[j], allCells[i]];
  }
  
  // Assign starting cells to each color
  for (let color = 0; color < numColors; color++) {
    if (allCells.length === 0) break;
    const [x, y] = allCells.pop();
    grid[y][x] = color;
    paths[color].push([x, y]);
  }
  
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  
  // Keep extending paths until grid is full
  let iterations = 0;
  const maxIterations = totalCells * 200;
  
  while (iterations < maxIterations) {
    iterations++;
    
    // Count empty cells
    let emptyCount = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (grid[y][x] === -1) emptyCount++;
      }
    }
    if (emptyCount === 0) break;
    
    // Try to extend paths from their ends
    const colorOrder = [...Array(paths.length).keys()];
    for (let i = colorOrder.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [colorOrder[i], colorOrder[j]] = [colorOrder[j], colorOrder[i]];
    }
    
    let extended = false;
    
    for (const color of colorOrder) {
      const path = paths[color];
      if (path.length === 0) continue;
      
      // Try to extend from either end
      const ends = [
        { cell: path[0], addToFront: true },
        { cell: path[path.length - 1], addToFront: false }
      ];
      
      // Shuffle which end to try first
      if (random() < 0.5) ends.reverse();
      
      for (const { cell, addToFront } of ends) {
        const [cx, cy] = cell;
        
        // Shuffle directions
        const shuffledDirs = [...dirs];
        for (let i = shuffledDirs.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [shuffledDirs[i], shuffledDirs[j]] = [shuffledDirs[j], shuffledDirs[i]];
        }
        
        for (const [dx, dy] of shuffledDirs) {
          const nx = cx + dx;
          const ny = cy + dy;
          
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny][nx] === -1) {
            grid[ny][nx] = color;
            if (addToFront) {
              path.unshift([nx, ny]);
            } else {
              path.push([nx, ny]);
            }
            extended = true;
            break;
          }
        }
        if (extended) break;
      }
      if (extended) break;
    }
    
    // If no path could extend, we might have isolated cells
    // Try to find an empty cell and see if we can connect it
    if (!extended) {
      let foundEmpty = false;
      
      for (let y = 0; y < height && !foundEmpty; y++) {
        for (let x = 0; x < width && !foundEmpty; x++) {
          if (grid[y][x] !== -1) continue;
          
          // Found an empty cell - check its neighbors
          for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            if (grid[ny][nx] === -1) continue;
            
            const neighborColor = grid[ny][nx];
            const neighborPath = paths[neighborColor];
            
            // Check if [nx, ny] is at the start or end of its path
            const isAtStart = neighborPath[0][0] === nx && neighborPath[0][1] === ny;
            const isAtEnd = neighborPath[neighborPath.length - 1][0] === nx && 
                           neighborPath[neighborPath.length - 1][1] === ny;
            
            if (isAtStart) {
              // Can extend from the front
              grid[y][x] = neighborColor;
              neighborPath.unshift([x, y]);
              foundEmpty = true;
              extended = true;
              break;
            } else if (isAtEnd) {
              // Can extend from the back
              grid[y][x] = neighborColor;
              neighborPath.push([x, y]);
              foundEmpty = true;
              extended = true;
              break;
            }
          }
        }
      }
      
      // If still no progress, the grid has isolated cells that can't be reached
      if (!foundEmpty) {
        return null;
      }
    }
  }
  
  // Final verification: check if grid is completely filled
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] === -1) {
        return null; // Failed to fill grid
      }
    }
  }
  
  // Filter out any paths with less than 2 cells
  const validPaths = paths.filter(p => p.length >= 2);
  
  if (validPaths.length < 4) {
    return null; // Not enough valid paths
  }
  
  // Re-number colors to be sequential
  const result = [];
  for (let i = 0; i < validPaths.length; i++) {
    const path = validPaths[i];
    result.push({
      color: i,
      start: path[0],
      end: path[path.length - 1]
    });
  }
  
  return { pairs: result };
}

// Main export: Generate puzzle for a given date string
export function generatePuzzleForDate(puzzleId) {
  const baseSeed = hashString(puzzleId);
  const paramRandom = createSeededRandom(baseSeed);
  
  // Vary grid size: 5x5 (60%), 6x6 (40%)
  const sizeRoll = paramRandom();
  let width, height;
  if (sizeRoll < 0.6) {
    width = 5; height = 5;
  } else {
    width = 6; height = 6;
  }
  
  const totalCells = width * height;
  
  // Number of colors: aim for 5-7 for good puzzle density
  const numColors = 5 + Math.floor(paramRandom() * 3);
  
  // Try to generate a valid filled grid
  for (let attempt = 0; attempt < 500; attempt++) {
    const seed = baseSeed + attempt * 1000;
    const random = createSeededRandom(seed);
    
    const result = fillGridWithPaths(width, height, numColors, random);
    if (result && result.pairs.length >= 4) {
      return {
        id: puzzleId,
        width,
        height,
        pairs: result.pairs
      };
    }
  }
  
  // Fallback: Try 5x5 with fewer colors
  for (let attempt = 0; attempt < 300; attempt++) {
    const seed = baseSeed + 600000 + attempt * 1000;
    const random = createSeededRandom(seed);
    
    const result = fillGridWithPaths(5, 5, 5, random);
    if (result && result.pairs.length >= 4) {
      return {
        id: puzzleId,
        width: 5,
        height: 5,
        pairs: result.pairs
      };
    }
  }
  
  // Ultimate fallback - a known solvable 5x5 puzzle
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
