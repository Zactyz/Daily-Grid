// Deterministic puzzle generator for Pathways (Flow) game
// Generates puzzles by filling a grid with snake-like paths, then extracting endpoints

import { createSeededRandom, hashString } from './pathways-utils.js';

// Fill the entire grid with colored paths using a recursive backtracking approach
function fillGridWithPaths(width, height, numColors, random) {
  const grid = Array(height).fill(null).map(() => Array(width).fill(-1));
  const paths = []; // Each path is an array of [x, y] coordinates
  
  // Initialize paths array
  for (let i = 0; i < numColors; i++) {
    paths.push([]);
  }
  
  // Start each path from a random cell
  const allCells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      allCells.push([x, y]);
    }
  }
  
  // Shuffle cells
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
  
  // Grow paths until grid is full
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  let iterations = 0;
  const maxIterations = width * height * 100;
  
  while (iterations < maxIterations) {
    iterations++;
    
    // Check if grid is full
    let emptyCount = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (grid[y][x] === -1) emptyCount++;
      }
    }
    if (emptyCount === 0) break;
    
    // Try to extend a random path
    const colorOrder = [...Array(numColors).keys()];
    for (let i = colorOrder.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [colorOrder[i], colorOrder[j]] = [colorOrder[j], colorOrder[i]];
    }
    
    let extended = false;
    for (const color of colorOrder) {
      const path = paths[color];
      if (path.length === 0) continue;
      
      // Try to extend from either end of the path
      const ends = [path[0], path[path.length - 1]];
      const endOrder = random() < 0.5 ? [0, 1] : [1, 0];
      
      for (const endIdx of endOrder) {
        const [ex, ey] = ends[endIdx];
        
        // Shuffle directions
        const shuffledDirs = [...dirs];
        for (let i = shuffledDirs.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [shuffledDirs[i], shuffledDirs[j]] = [shuffledDirs[j], shuffledDirs[i]];
        }
        
        for (const [dx, dy] of shuffledDirs) {
          const nx = ex + dx;
          const ny = ey + dy;
          
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny][nx] === -1) {
            grid[ny][nx] = color;
            if (endIdx === 0) {
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
    
    // If no path could extend, try to start a new path in an empty cell
    if (!extended) {
      // Find an empty cell adjacent to an existing path
      let foundNew = false;
      for (let y = 0; y < height && !foundNew; y++) {
        for (let x = 0; x < width && !foundNew; x++) {
          if (grid[y][x] === -1) {
            // Check if adjacent to any path
            for (const [dx, dy] of dirs) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny][nx] !== -1) {
                // Assign this cell to an adjacent path's color
                const adjacentColor = grid[ny][nx];
                grid[y][x] = adjacentColor;
                
                // We need to connect this to the path properly
                // Find where [nx, ny] is in the path
                const path = paths[adjacentColor];
                const idx = path.findIndex(([px, py]) => px === nx && py === ny);
                
                if (idx === 0) {
                  path.unshift([x, y]);
                } else if (idx === path.length - 1) {
                  path.push([x, y]);
                } else {
                  // Middle of path - can't extend here, try a different approach
                  // Assign as new color
                  const newColor = paths.length;
                  grid[y][x] = newColor;
                  paths.push([[x, y]]);
                }
                foundNew = true;
                break;
              }
            }
          }
        }
      }
      
      if (!foundNew) {
        // No progress possible - grid might have isolated cells
        break;
      }
    }
  }
  
  // Check if grid is completely filled
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] === -1) {
        return null; // Failed to fill grid
      }
    }
  }
  
  // Filter out any single-cell paths (need at least 2 cells for a valid pair)
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
  
  // Number of initial color pairs: 4-6 depending on grid size
  const minPairs = Math.max(4, Math.floor(totalCells / 7));
  const maxPairs = Math.min(7, Math.floor(totalCells / 4));
  const numColors = minPairs + Math.floor(paramRandom() * (maxPairs - minPairs + 1));
  
  // Try to generate a valid filled grid
  for (let attempt = 0; attempt < 300; attempt++) {
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
  
  // Fallback: Try smaller grid
  for (let attempt = 0; attempt < 200; attempt++) {
    const seed = baseSeed + 500000 + attempt * 1000;
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
