// Deterministic puzzle generator for Pathways (Flow) game
// Generates puzzles by filling a grid completely with snake-like paths
// Obstacles are integrated INTO generation, not added after

import { createSeededRandom, hashString } from './pathways-utils.js';

// Fill the grid with colored paths, respecting walls and bridges
function fillGridWithPaths(width, height, numColors, random, walls = [], bridges = []) {
  const totalCells = width * height;
  const grid = Array(height).fill(null).map(() => Array(width).fill(-1));
  const paths = []; // Each path is an array of [x, y] coordinates
  
  // Mark wall cells as blocked (use -2 to indicate wall)
  for (const [wx, wy] of walls) {
    grid[wy][wx] = -2;
  }
  
  // Track bridge usage (bridges can have up to 2 colors)
  const bridgeUsage = {}; // "x,y" -> [color1, color2]
  for (const [bx, by] of bridges) {
    bridgeUsage[`${bx},${by}`] = [];
  }
  
  // Initialize paths array
  for (let i = 0; i < numColors; i++) {
    paths.push([]);
  }
  
  // Get all available cells (not walls) and shuffle them
  const allCells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] !== -2) { // Not a wall
        allCells.push([x, y]);
      }
    }
  }
  
  for (let i = allCells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [allCells[i], allCells[j]] = [allCells[j], allCells[i]];
  }
  
  // Assign starting cells to each color (avoid bridges for starting points)
  for (let color = 0; color < numColors; color++) {
    let assigned = false;
    for (let i = allCells.length - 1; i >= 0 && !assigned; i--) {
      const [x, y] = allCells[i];
      const key = `${x},${y}`;
      if (!bridgeUsage.hasOwnProperty(key) && grid[y][x] === -1) {
        grid[y][x] = color;
        paths[color].push([x, y]);
        allCells.splice(i, 1);
        assigned = true;
      }
    }
    if (!assigned && allCells.length > 0) {
      // Fallback: use any available cell
      const [x, y] = allCells.pop();
      if (grid[y][x] === -1) {
        grid[y][x] = color;
        paths[color].push([x, y]);
      }
    }
  }
  
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  
  // Helper to check if a cell can be entered
  function canEnterCell(x, y, color) {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    if (grid[y][x] === -2) return false; // Wall
    
    const key = `${x},${y}`;
    if (bridgeUsage.hasOwnProperty(key)) {
      // Bridge cell - can have up to 2 different colors
      const usage = bridgeUsage[key];
      if (usage.length === 0) return true;
      if (usage.length === 1 && usage[0] !== color) return true;
      if (usage.includes(color)) return true; // Same color can extend through
      return false; // Already has 2 colors
    }
    
    return grid[y][x] === -1; // Empty cell
  }
  
  // Helper to mark a cell as used
  function markCell(x, y, color) {
    const key = `${x},${y}`;
    if (bridgeUsage.hasOwnProperty(key)) {
      if (!bridgeUsage[key].includes(color)) {
        bridgeUsage[key].push(color);
      }
      // For bridges, we use a special marker or the first color
      if (grid[y][x] === -1) {
        grid[y][x] = color;
      }
    } else {
      grid[y][x] = color;
    }
  }
  
  // Keep extending paths until grid is full (excluding walls)
  const targetCells = totalCells - walls.length;
  let iterations = 0;
  const maxIterations = targetCells * 200;
  
  while (iterations < maxIterations) {
    iterations++;
    
    // Count empty cells (excluding walls)
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
          
          if (canEnterCell(nx, ny, color)) {
            markCell(nx, ny, color);
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
    
    // If no path could extend, try to find isolated empty cells
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
            if (grid[ny][nx] < 0) continue; // Wall or empty
            
            const neighborColor = grid[ny][nx];
            const neighborPath = paths[neighborColor];
            
            // Check if [nx, ny] is at the start or end of its path
            const isAtStart = neighborPath[0][0] === nx && neighborPath[0][1] === ny;
            const isAtEnd = neighborPath[neighborPath.length - 1][0] === nx && 
                           neighborPath[neighborPath.length - 1][1] === ny;
            
            if (isAtStart) {
              markCell(x, y, neighborColor);
              neighborPath.unshift([x, y]);
              foundEmpty = true;
              extended = true;
              break;
            } else if (isAtEnd) {
              markCell(x, y, neighborColor);
              neighborPath.push([x, y]);
              foundEmpty = true;
              extended = true;
              break;
            }
          }
        }
      }
      
      if (!foundEmpty) {
        return null; // Grid has isolated cells that can't be reached
      }
    }
  }
  
  // Final verification: check if grid is completely filled (excluding walls)
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
  
  // Check which bridges were actually used by 2 colors
  const usedBridges = [];
  for (const [key, colors] of Object.entries(bridgeUsage)) {
    if (colors.length === 2) {
      const [x, y] = key.split(',').map(Number);
      usedBridges.push([x, y]);
    }
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
  
  return { pairs: result, solutionPaths, usedBridges };
}

// Generate random wall positions
function generateWalls(width, height, count, random) {
  const walls = [];
  const candidates = [];
  
  // Prefer edge and corner positions for walls (more strategic)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Weight edges and corners higher
      const isEdge = x === 0 || x === width - 1 || y === 0 || y === height - 1;
      const isCorner = (x === 0 || x === width - 1) && (y === 0 || y === height - 1);
      
      if (isCorner) {
        candidates.push([x, y], [x, y]); // Double weight for corners
      } else if (isEdge) {
        candidates.push([x, y]);
      }
      // Interior cells have lower chance
      if (!isEdge && random() < 0.3) {
        candidates.push([x, y]);
      }
    }
  }
  
  // Shuffle and pick
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  
  // Pick non-adjacent walls (don't want walls touching each other)
  for (const [x, y] of candidates) {
    if (walls.length >= count) break;
    
    // Check if adjacent to existing wall
    const adjacentToWall = walls.some(([wx, wy]) => 
      Math.abs(wx - x) + Math.abs(wy - y) <= 1
    );
    
    if (!adjacentToWall) {
      walls.push([x, y]);
    }
  }
  
  return walls;
}

// Generate bridge positions (interior cells work best)
function generateBridges(width, height, count, random) {
  const bridges = [];
  const candidates = [];
  
  // Bridges should be interior cells (not on edges)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      candidates.push([x, y]);
    }
  }
  
  // Shuffle
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  
  // Pick bridges with some spacing
  for (const [x, y] of candidates) {
    if (bridges.length >= count) break;
    
    const tooClose = bridges.some(([bx, by]) => 
      Math.abs(bx - x) + Math.abs(by - y) <= 2
    );
    
    if (!tooClose) {
      bridges.push([x, y]);
    }
  }
  
  return bridges;
}

// Find checkpoint candidates from solution paths
function findCheckpoints(solutionPaths, pairs, count, random) {
  const checkpoints = [];
  const candidates = [];
  
  // Collect all non-endpoint cells from paths
  for (const pair of pairs) {
    const path = solutionPaths[pair.color];
    if (!path || path.length < 4) continue;
    
    // Get middle cells (not start or end)
    for (let i = 1; i < path.length - 1; i++) {
      candidates.push({ x: path[i][0], y: path[i][1], color: pair.color });
    }
  }
  
  // Shuffle
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  
  // Pick checkpoints, preferring different colors
  const usedColors = new Set();
  for (const cp of candidates) {
    if (checkpoints.length >= count) break;
    
    // Prefer checkpoints on different colored paths
    if (checkpoints.length < count && !usedColors.has(cp.color)) {
      checkpoints.push(cp);
      usedColors.add(cp.color);
    }
  }
  
  // If we need more and ran out of unique colors, allow duplicates
  for (const cp of candidates) {
    if (checkpoints.length >= count) break;
    if (!checkpoints.some(c => c.x === cp.x && c.y === cp.y)) {
      checkpoints.push(cp);
    }
  }
  
  return checkpoints;
}

// Main export: Generate puzzle for a given date string
export function generatePuzzleForDate(puzzleId) {
  const baseSeed = hashString(puzzleId);
  const paramRandom = createSeededRandom(baseSeed);
  
  // Vary grid size: 5x5 (40%), 6x6 (40%), 7x7 (20%)
  const sizeRoll = paramRandom();
  let width, height, numColors;
  if (sizeRoll < 0.4) {
    width = 5; height = 5;
    numColors = 4 + Math.floor(paramRandom() * 2);
  } else if (sizeRoll < 0.8) {
    width = 6; height = 6;
    numColors = 5 + Math.floor(paramRandom() * 2);
  } else {
    width = 7; height = 7;
    numColors = 6 + Math.floor(paramRandom() * 2);
  }
  
  // Decide obstacle type: 30% walls, 25% bridges, 20% checkpoints, 25% none
  const obstacleRoll = paramRandom();
  let obstacleType = null;
  let obstacleCount = 0;
  
  if (obstacleRoll < 0.30) {
    obstacleType = 'wall';
    obstacleCount = 1 + Math.floor(paramRandom() * 3); // 1-3 walls
  } else if (obstacleRoll < 0.55) {
    obstacleType = 'bridge';
    obstacleCount = 1 + Math.floor(paramRandom() * 2); // 1-2 bridges
  } else if (obstacleRoll < 0.75) {
    obstacleType = 'checkpoint';
    obstacleCount = 1 + Math.floor(paramRandom() * 2); // 1-2 checkpoints
  }
  
  // Generate with obstacles
  for (let attempt = 0; attempt < 500; attempt++) {
    const seed = baseSeed + attempt * 1000;
    const random = createSeededRandom(seed);
    
    let walls = [];
    let bridges = [];
    
    if (obstacleType === 'wall') {
      walls = generateWalls(width, height, obstacleCount, random);
    } else if (obstacleType === 'bridge') {
      bridges = generateBridges(width, height, obstacleCount, random);
    }
    
    const result = fillGridWithPaths(width, height, numColors, random, walls, bridges);
    
    if (result && result.pairs.length >= 4) {
      const puzzle = {
        id: puzzleId,
        width,
        height,
        pairs: result.pairs
      };
      
      // Add obstacle info
      if (obstacleType === 'wall' && walls.length > 0) {
        puzzle.obstacle = { type: 'wall', cells: walls };
      } else if (obstacleType === 'bridge' && result.usedBridges && result.usedBridges.length > 0) {
        // Only include bridges that were actually used by 2 colors
        puzzle.obstacle = { type: 'bridge', cells: result.usedBridges };
      } else if (obstacleType === 'checkpoint') {
        // Generate checkpoints from the solution
        const checkpointRandom = createSeededRandom(seed + 500000);
        const checkpoints = findCheckpoints(result.solutionPaths, result.pairs, obstacleCount, checkpointRandom);
        if (checkpoints.length > 0) {
          puzzle.obstacle = { type: 'checkpoint', cells: checkpoints };
        }
      }
      
      return puzzle;
    }
  }
  
  // Fallback: Try without obstacles
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
      };
    }
  }
  
  // Ultimate fallback
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
