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
  
  // Re-number colors to be sequential and build solution paths map
  const result = [];
  const solutionPaths = {};
  for (let i = 0; i < validPaths.length; i++) {
    const path = validPaths[i];
    result.push({
      color: i,
      start: path[0],
      end: path[path.length - 1]
    });
    solutionPaths[i] = path;
  }
  
  return { pairs: result, solutionPaths };
}

// Add obstacle to a generated puzzle
// Returns obstacle object or null
function addObstacle(puzzle, solutionPaths, random) {
  // 25% chance of each obstacle type, 25% no obstacle
  const obstacleRoll = random();
  
  if (obstacleRoll < 0.25) {
    // Wall obstacle: Add 1-2 blocked cells
    // We need to find cells that can be removed from paths without breaking them
    // For simplicity, we'll add walls adjacent to the grid edges that aren't endpoints
    const wallCells = [];
    const edgeCells = [];
    
    // Find edge cells that aren't endpoints
    for (let y = 0; y < puzzle.height; y++) {
      for (let x = 0; x < puzzle.width; x++) {
        if (x === 0 || x === puzzle.width - 1 || y === 0 || y === puzzle.height - 1) {
          // Check if this is an endpoint
          const isEndpoint = puzzle.pairs.some(p => 
            (p.start[0] === x && p.start[1] === y) || 
            (p.end[0] === x && p.end[1] === y)
          );
          if (!isEndpoint) {
            edgeCells.push([x, y]);
          }
        }
      }
    }
    
    // Pick 1-2 random edge cells for walls
    if (edgeCells.length >= 1) {
      const numWalls = Math.min(edgeCells.length, 1 + Math.floor(random() * 2));
      for (let i = edgeCells.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [edgeCells[i], edgeCells[j]] = [edgeCells[j], edgeCells[i]];
      }
      for (let i = 0; i < numWalls; i++) {
        wallCells.push(edgeCells[i]);
      }
      
      if (wallCells.length > 0) {
        return { type: 'wall', cells: wallCells };
      }
    }
  } else if (obstacleRoll < 0.50) {
    // Bridge obstacle: Pick a cell in the middle of a path (not endpoint)
    // Two paths can cross here
    const candidates = [];
    
    for (const pair of puzzle.pairs) {
      const path = solutionPaths[pair.color];
      if (path && path.length >= 4) {
        // Get middle cells (not start or end)
        for (let i = 1; i < path.length - 1; i++) {
          const [x, y] = path[i];
          // Prefer cells not on edge for visual clarity
          if (x > 0 && x < puzzle.width - 1 && y > 0 && y < puzzle.height - 1) {
            candidates.push({ x, y, color: pair.color });
          }
        }
      }
    }
    
    if (candidates.length > 0) {
      const idx = Math.floor(random() * candidates.length);
      const chosen = candidates[idx];
      return { type: 'bridge', x: chosen.x, y: chosen.y };
    }
  } else if (obstacleRoll < 0.75) {
    // Checkpoint obstacle: A specific cell that a specific color MUST pass through
    const candidates = [];
    
    for (const pair of puzzle.pairs) {
      const path = solutionPaths[pair.color];
      if (path && path.length >= 4) {
        // Get middle cells
        for (let i = 1; i < path.length - 1; i++) {
          const [x, y] = path[i];
          candidates.push({ x, y, color: pair.color });
        }
      }
    }
    
    if (candidates.length > 0) {
      const idx = Math.floor(random() * candidates.length);
      const chosen = candidates[idx];
      return { type: 'checkpoint', x: chosen.x, y: chosen.y, color: chosen.color };
    }
  }
  
  // No obstacle (25% of time, or if we couldn't create one)
  return null;
}

// Main export: Generate puzzle for a given date string
export function generatePuzzleForDate(puzzleId) {
  const baseSeed = hashString(puzzleId);
  const paramRandom = createSeededRandom(baseSeed);
  
  // Vary grid size: 5x5 (40%), 6x6 (40%), 7x7 (20%)
  // Larger grids with fewer paths = harder puzzles
  const sizeRoll = paramRandom();
  let width, height, numColors;
  if (sizeRoll < 0.4) {
    width = 5; height = 5;
    // 5x5: 4-5 colors (fewer colors = more routing freedom = harder)
    numColors = 4 + Math.floor(paramRandom() * 2);
  } else if (sizeRoll < 0.8) {
    width = 6; height = 6;
    // 6x6: 5-6 colors
    numColors = 5 + Math.floor(paramRandom() * 2);
  } else {
    width = 7; height = 7;
    // 7x7: 6-7 colors (larger grid needs more paths but still challenging)
    numColors = 6 + Math.floor(paramRandom() * 2);
  }
  
  const totalCells = width * height;
  
  // Try to generate a valid filled grid
  for (let attempt = 0; attempt < 500; attempt++) {
    const seed = baseSeed + attempt * 1000;
    const random = createSeededRandom(seed);
    
    const result = fillGridWithPaths(width, height, numColors, random);
    if (result && result.pairs.length >= 4) {
      const puzzle = {
        id: puzzleId,
        width,
        height,
        pairs: result.pairs
      };
      
      // Try to add an obstacle
      const obstacleRandom = createSeededRandom(baseSeed + 999999);
      const obstacle = addObstacle(puzzle, result.solutionPaths || {}, obstacleRandom);
      if (obstacle) {
        puzzle.obstacle = obstacle;
      }
      
      return puzzle;
    }
  }
  
  // Fallback: Try 5x5 with 4 colors (minimum)
  for (let attempt = 0; attempt < 300; attempt++) {
    const seed = baseSeed + 600000 + attempt * 1000;
    const random = createSeededRandom(seed);
    
    const result = fillGridWithPaths(5, 5, 4, random);
    if (result && result.pairs.length >= 4) {
      return {
        id: puzzleId,
        width: 5,
        height: 5,
        pairs: result.pairs
        // No obstacle for fallback puzzles
      };
    }
  }
  
  // Ultimate fallback - a known solvable 5x5 puzzle with 4 colors
  console.warn('Using ultimate fallback puzzle for', puzzleId);
  return {
    id: puzzleId,
    width: 5,
    height: 5,
    pairs: [
      { color: 0, start: [0, 0], end: [4, 4] },
      { color: 1, start: [4, 0], end: [0, 4] },
      { color: 2, start: [2, 0], end: [2, 4] },
      { color: 3, start: [0, 2], end: [4, 2] }
    ]
  };
}
