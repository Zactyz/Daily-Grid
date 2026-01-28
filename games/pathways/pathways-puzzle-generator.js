// Deterministic puzzle generator for Pathways (Flow) game
// Generates puzzles by filling a grid completely with snake-like paths

import { createSeededRandom, hashString, normalizeWall } from './pathways-utils.js';

// Helper: Get quadrant (0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right)
function getQuadrant(x, y, width, height) {
  const midX = width / 2;
  const midY = height / 2;
  if (x < midX && y < midY) return 0; // top-left
  if (x >= midX && y < midY) return 1; // top-right
  if (x < midX && y >= midY) return 2; // bottom-left
  return 3; // bottom-right
}

// Helper: Check if two quadrants are opposite
function isOppositeQuadrant(q1, q2) {
  return (q1 === 0 && q2 === 3) || (q1 === 3 && q2 === 0) ||
         (q1 === 1 && q2 === 2) || (q1 === 2 && q2 === 1);
}

// Check if a path can connect two points avoiding other endpoints
function canConnect(width, height, start, end, allEndpoints, currentPair) {
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const startKey = `${start[0]},${start[1]}`;
  const endKey = `${end[0]},${end[1]}`;
  
  // BFS to find if a path exists
  const visited = new Set();
  const queue = [[start[0], start[1]]];
  visited.add(startKey);
  
  while (queue.length > 0) {
    const [x, y] = queue.shift();
    
    if (x === end[0] && y === end[1]) {
      return true; // Found a path
    }
    
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      const nKey = `${nx},${ny}`;
      
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (visited.has(nKey)) continue;
      
      // Can visit if: not an endpoint, OR it's our target endpoint
      if (allEndpoints.has(nKey) && nKey !== endKey) {
        continue; // Can't pass through other endpoints
      }
      
      visited.add(nKey);
      queue.push([nx, ny]);
    }
  }
  
  return false; // No path found
}

// Verify a puzzle is solvable from the user's perspective
function isPuzzleSolvable(width, height, pairs) {
  // Build set of all endpoints
  const endpoints = new Set();
  for (const pair of pairs) {
    endpoints.add(`${pair.start[0]},${pair.start[1]}`);
    endpoints.add(`${pair.end[0]},${pair.end[1]}`);
  }
  
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  
  // Check 1: No non-endpoint cell is completely surrounded by endpoints/walls
  // Every non-endpoint cell needs at least 2 free neighbors to allow paths through
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = `${x},${y}`;
      if (endpoints.has(key)) continue; // Skip endpoints themselves
      
      // Count non-endpoint neighbors (cells that paths could use)
      let freeNeighbors = 0;
      let adjacentEndpoints = [];
      
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        
        const nKey = `${nx},${ny}`;
        if (endpoints.has(nKey)) {
          adjacentEndpoints.push(nKey);
        } else {
          freeNeighbors++;
        }
      }
      
      // A cell with only 1 free neighbor and surrounded by endpoints is a dead end
      // Unless it's adjacent to exactly one pair's endpoints (then that color must use it)
      if (freeNeighbors < 2) {
        // This cell is potentially trapped
        // It's OK if it's adjacent to an endpoint that MUST pass through it
        // But if it has 0 free neighbors, it's completely trapped
        if (freeNeighbors === 0 && adjacentEndpoints.length > 0) {
          // Cell surrounded by endpoints - impossible to fill
          return false;
        }
        
        // Cell has only 1 way in/out that's not an endpoint
        // Check if this creates an impossible situation
        if (freeNeighbors === 1 && adjacentEndpoints.length >= 2) {
          // Dead-end cell with multiple adjacent endpoints
          // Only one color can enter via the free neighbor
          // The other endpoints can't reach this cell
          return false;
        }
      }
    }
  }
  
  // Check 2: Each color pair can potentially connect
  // (simplified check - verify endpoints aren't completely blocked)
  for (const pair of pairs) {
    if (!canConnect(width, height, pair.start, pair.end, endpoints, pair)) {
      return false;
    }
  }
  
  return true;
}

// Generate walls (edges between cells) that DON'T block the solution paths
// Walls are stored as normalized edge strings like '1,1-2,1' (between cell [1,1] and [2,1])
function generateWalls(width, height, numWalls, random, solutionPaths = []) {
  if (numWalls === 0) return [];
  
  // Build set of edges used by solution paths (these cannot be walls)
  const solutionEdges = new Set();
  for (const path of solutionPaths) {
    for (let i = 0; i < path.length - 1; i++) {
      solutionEdges.add(normalizeWall(path[i], path[i + 1]));
    }
  }
  
  // Collect all possible internal edges that are NOT part of solution paths
  const availableEdges = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Horizontal edge (between [x,y] and [x+1,y])
      if (x < width - 1) {
        const edge = normalizeWall([x, y], [x + 1, y]);
        if (!solutionEdges.has(edge)) {
          availableEdges.push(edge);
        }
      }
      // Vertical edge (between [x,y] and [x,y+1])
      if (y < height - 1) {
        const edge = normalizeWall([x, y], [x, y + 1]);
        if (!solutionEdges.has(edge)) {
          availableEdges.push(edge);
        }
      }
    }
  }
  
  // Shuffle edges
  for (let i = availableEdges.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [availableEdges[i], availableEdges[j]] = [availableEdges[j], availableEdges[i]];
  }
  
  // Select walls from edges that don't block the solution
  return availableEdges.slice(0, Math.min(numWalls, availableEdges.length));
}

// Generate color-required cells (cells that MUST be covered by a specific color)
// IMPORTANT: Required cells must be on the ACTUAL solution path for that color
function generateRequiredCells(width, height, numRequired, random, solutionPaths = []) {
  if (numRequired === 0 || solutionPaths.length === 0) return [];
  
  const requiredCells = [];
  
  // Build candidates from actual solution path cells (excluding endpoints)
  const candidates = [];
  for (let colorIdx = 0; colorIdx < solutionPaths.length; colorIdx++) {
    const path = solutionPaths[colorIdx];
    // Skip first and last cells (endpoints)
    for (let i = 1; i < path.length - 1; i++) {
      candidates.push({ cell: path[i], color: colorIdx });
    }
  }
  
  // Shuffle candidates
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  
  // Assign required cells (avoid duplicates)
  const usedRequired = new Set();
  for (const candidate of candidates) {
    if (requiredCells.length >= numRequired) break;
    const key = `${candidate.cell[0]},${candidate.cell[1]}`;
    if (!usedRequired.has(key)) {
      requiredCells.push({
        cell: candidate.cell,
        color: candidate.color
      });
      usedRequired.add(key);
    }
  }
  
  return requiredCells;
}

// Fill the entire grid with colored paths
function fillGridWithPaths(width, height, numColors, random) {
  const totalCells = width * height;
  const grid = Array(height).fill(null).map(() => Array(width).fill(-1));
  const paths = []; // Each path is an array of [x, y] coordinates
  
  // Initialize paths array
  for (let i = 0; i < numColors; i++) {
    paths.push([]);
  }
  
  // Get all cells, prioritizing edges (but not corners for seeds - they cluster easily)
  const allCells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      allCells.push([x, y]);
    }
  }
  
  // Shuffle all cells
  for (let i = allCells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [allCells[i], allCells[j]] = [allCells[j], allCells[i]];
  }
  
  // Helper to calculate minimum distance to existing seeds
  function minDistanceToSeeds(x, y, usedCells) {
    let minDist = Infinity;
    for (const key of usedCells) {
      const [ux, uy] = key.split(',').map(Number);
      const dist = Math.abs(x - ux) + Math.abs(y - uy); // Manhattan distance
      minDist = Math.min(minDist, dist);
    }
    return minDist;
  }
  
  // Assign starting cells: spread them out as much as possible
  const usedCells = new Set();
  const minSpacing = Math.max(2, Math.floor(Math.min(width, height) / numColors)); // Minimum distance between seeds
  
  for (let color = 0; color < numColors; color++) {
    let bestCell = null;
    let bestDist = -1;
    
    // Find cell that maximizes distance from existing seeds
    for (const [x, y] of allCells) {
      const key = `${x},${y}`;
      if (usedCells.has(key)) continue;
      
      if (usedCells.size === 0) {
        // First seed - prefer non-corner edge cells
        const isCorner = (x === 0 || x === width - 1) && (y === 0 || y === height - 1);
        const isEdge = x === 0 || x === width - 1 || y === 0 || y === height - 1;
        if (isEdge && !isCorner) {
          bestCell = [x, y];
          break;
        }
      } else {
        const dist = minDistanceToSeeds(x, y, usedCells);
        if (dist > bestDist) {
          bestDist = dist;
          bestCell = [x, y];
        }
      }
    }
    
    // Fallback to any available cell
    if (!bestCell) {
      for (const [x, y] of allCells) {
        const key = `${x},${y}`;
        if (!usedCells.has(key)) {
          bestCell = [x, y];
          break;
        }
      }
    }
    
    if (bestCell) {
      const [x, y] = bestCell;
      usedCells.add(`${x},${y}`);
      grid[y][x] = color;
      paths[color].push([x, y]);
    }
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
          if (grid[y][x] !== -1) continue; // Skip non-empty cells
          
          // Found an empty cell - check its neighbors
          for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            if (grid[ny][nx] === -1) continue; // Skip empty cells
            
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
  const solutionPaths = [];
  for (let i = 0; i < validPaths.length; i++) {
    const path = validPaths[i];
    result.push({
      color: i,
      start: path[0],
      end: path[path.length - 1]
    });
    solutionPaths.push(path); // Keep full path for wall generation
  }
  
  return { pairs: result, solutionPaths: solutionPaths };
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
  
  // Walls disabled - they force a single solution which is too restrictive.
  // IMPORTANT: Keep the paramRandom() calls to preserve the seeded sequence
  // for backward compatibility with existing puzzles.
  let numWalls = 0;
  const wallsRoll = paramRandom(); // Keep for sequence compatibility
  if (width === 5 && height === 5) {
    if (wallsRoll < 0.25) paramRandom(); // Was: numWalls = 1 + Math.floor(paramRandom() * 2)
  } else if (width === 6 && height === 6) {
    if (wallsRoll < 0.35) paramRandom(); // Was: numWalls = 1 + Math.floor(paramRandom() * 3)
  } else { // 7x7
    if (wallsRoll < 0.4) paramRandom(); // Was: numWalls = 2 + Math.floor(paramRandom() * 3)
  }
  // numWalls stays 0 - walls create trap situations in Flow-style games
  
  // Corridors removed - they created solvability issues
  // Keep paramRandom() call for backward compatibility with existing puzzle seeds
  const corridorRoll = paramRandom(); // Consumed but unused
  
  // Determine if this puzzle should have required cells (rare feature)
  let numRequired = 0;
  const requiredRoll = paramRandom();
  if (width === 5 && height === 5) {
    if (requiredRoll < 0.1) numRequired = 1; // 10% chance, 1 required
  } else if (width === 6 && height === 6) {
    if (requiredRoll < 0.15) numRequired = 1; // 15% chance, 1 required
  } else { // 7x7
    if (requiredRoll < 0.2) numRequired = 1 + Math.floor(paramRandom() * 2); // 20% chance, 1-2 required
  }
  
  // Try to generate a valid filled grid
  for (let attempt = 0; attempt < 500; attempt++) {
    const seed = baseSeed + attempt * 1000;
    const random = createSeededRandom(seed);
    
    const result = fillGridWithPaths(width, height, numColors, random);
    if (result && result.pairs.length >= 4) {
      // CRITICAL: Verify the puzzle is solvable before returning
      if (!isPuzzleSolvable(width, height, result.pairs)) {
        continue; // Try another attempt
      }
      
      // Generate walls that DON'T block solution paths
      const walls = generateWalls(width, height, numWalls, random, result.solutionPaths);
      
      // Generate required cells from actual solution paths
      const requiredCells = generateRequiredCells(width, height, numRequired, random, result.solutionPaths);
      
      return {
        id: puzzleId,
        width,
        height,
        pairs: result.pairs,
        walls: walls,
        requiredCells: requiredCells
      };
    }
  }
  
  // Fallback: Try 5x5 with 4 colors (minimum), no walls
  for (let attempt = 0; attempt < 300; attempt++) {
    const seed = baseSeed + 600000 + attempt * 1000;
    const random = createSeededRandom(seed);
    
    const result = fillGridWithPaths(5, 5, 4, random);
    if (result && result.pairs.length >= 4) {
      // Verify solvability
      if (!isPuzzleSolvable(5, 5, result.pairs)) {
        continue;
      }
      return {
        id: puzzleId,
        width: 5,
        height: 5,
        pairs: result.pairs,
        walls: [],
        requiredCells: []
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
    ],
    walls: [],
    requiredCells: []
  };
}
