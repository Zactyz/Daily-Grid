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

// Generate corridor cells (bi-directional movement only)
// IMPORTANT: Corridors must be compatible with how the solution path passes through the cell
function generateCorridors(width, height, numCorridors, random, solutionPaths = []) {
  if (numCorridors === 0) return [];
  
  // Build a map of cell -> directions the solution path uses through that cell
  // Directions: the solution enters from one direction and exits to another
  const cellDirections = new Map();
  
  for (const path of solutionPaths) {
    for (let i = 0; i < path.length; i++) {
      const [x, y] = path[i];
      const key = `${x},${y}`;
      const dirs = new Set();
      
      // Check previous cell (where we came from)
      if (i > 0) {
        const [px, py] = path[i - 1];
        if (px < x) dirs.add('west');
        else if (px > x) dirs.add('east');
        else if (py < y) dirs.add('north');
        else if (py > y) dirs.add('south');
      }
      
      // Check next cell (where we're going)
      if (i < path.length - 1) {
        const [nx, ny] = path[i + 1];
        if (nx < x) dirs.add('west');
        else if (nx > x) dirs.add('east');
        else if (ny < y) dirs.add('north');
        else if (ny > y) dirs.add('south');
      }
      
      cellDirections.set(key, dirs);
    }
  }
  
  const corridors = [];
  const usedCells = new Set();
  
  // Mark endpoints as used (can't be corridors)
  for (const path of solutionPaths) {
    if (path.length > 0) {
      const [sx, sy] = path[0];
      const [ex, ey] = path[path.length - 1];
      usedCells.add(`${sx},${sy}`);
      usedCells.add(`${ex},${ey}`);
    }
  }
  
  // Find cells where a corridor is COMPATIBLE with the solution
  // A cell can be a corridor if the solution only uses 2 opposite directions through it
  const candidates = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const key = `${x},${y}`;
      if (usedCells.has(key)) continue;
      
      const dirs = cellDirections.get(key);
      if (!dirs || dirs.size !== 2) continue;
      
      const dirArray = Array.from(dirs);
      // Check if the two directions are opposite (valid for corridor)
      const isVertical = dirArray.includes('north') && dirArray.includes('south');
      const isHorizontal = dirArray.includes('east') && dirArray.includes('west');
      
      if (isVertical || isHorizontal) {
        candidates.push({ cell: [x, y], open: isVertical ? ['north', 'south'] : ['east', 'west'] });
      }
    }
  }
  
  // Shuffle candidates
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  
  // Select corridors (already validated to be compatible with solution)
  return candidates.slice(0, Math.min(numCorridors, candidates.length));
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
  
  // Get edge/corner cells for distant endpoint placement
  // Strategy: Place pairs on opposite sides/corners for longer paths
  const edgeCells = [];
  const cornerCells = [];
  
  // Collect edge and corner cells
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isEdge = x === 0 || x === width - 1 || y === 0 || y === height - 1;
      const isCorner = (x === 0 || x === width - 1) && (y === 0 || y === height - 1);
      
      if (isCorner) {
        cornerCells.push([x, y]);
      } else if (isEdge) {
        edgeCells.push([x, y]);
      }
    }
  }
  
  // Shuffle for randomness
  for (let i = cornerCells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cornerCells[i], cornerCells[j]] = [cornerCells[j], cornerCells[i]];
  }
  for (let i = edgeCells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [edgeCells[i], edgeCells[j]] = [edgeCells[j], edgeCells[i]];
  }
  
  // Assign starting cells: prefer corners, then edges, ensuring pairs are distant
  const usedCells = new Set();
  
  for (let color = 0; color < numColors; color++) {
    let cell = null;
    
    // Try to find a cell on opposite side from previous colors
    if (color > 0 && paths[color - 1].length > 0) {
      const [prevX, prevY] = paths[color - 1][0];
      const prevQuadrant = getQuadrant(prevX, prevY, width, height);
      
      // Find cell in opposite quadrant
      const candidates = [...cornerCells, ...edgeCells].filter(([x, y]) => {
        const key = `${x},${y}`;
        if (usedCells.has(key)) return false;
        const quad = getQuadrant(x, y, width, height);
        return isOppositeQuadrant(prevQuadrant, quad);
      });
      
      if (candidates.length > 0) {
        cell = candidates[Math.floor(random() * candidates.length)];
      }
    }
    
    // Fallback: use any available corner or edge cell
    if (!cell) {
      const candidates = [...cornerCells, ...edgeCells].filter(([x, y]) => {
        const key = `${x},${y}`;
        return !usedCells.has(key);
      });
      if (candidates.length > 0) {
        cell = candidates[Math.floor(random() * candidates.length)];
      }
    }
    
    // Ultimate fallback: any cell
    if (!cell) {
      for (let y = 0; y < height && !cell; y++) {
        for (let x = 0; x < width && !cell; x++) {
          const key = `${x},${y}`;
          if (!usedCells.has(key)) {
            cell = [x, y];
            break;
          }
        }
      }
    }
    
    if (cell) {
      const [x, y] = cell;
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
  
  // Walls disabled - they force a single solution which is too restrictive
  // In Flow-style games, walls create trap situations if the user takes any
  // path different from the generated solution. Unlike Snake which has numbered
  // clues, Pathways has no guidance, making walls very frustrating.
  const numWalls = 0;
  
  // Determine if this puzzle should have corridors (rare feature)
  let numCorridors = 0;
  const corridorRoll = paramRandom();
  if (width === 5 && height === 5) {
    if (corridorRoll < 0.1) numCorridors = 1; // 10% chance, 1 corridor
  } else if (width === 6 && height === 6) {
    if (corridorRoll < 0.15) numCorridors = 1; // 15% chance, 1 corridor
  } else { // 7x7
    if (corridorRoll < 0.2) numCorridors = 1; // 20% chance, 1 corridor
  }
  
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
      // Generate walls that DON'T block solution paths
      const walls = generateWalls(width, height, numWalls, random, result.solutionPaths);
      
      // Generate corridors after paths are created
      const corridors = generateCorridors(width, height, numCorridors, random, result.solutionPaths);
      
      // Generate required cells from actual solution paths
      const requiredCells = generateRequiredCells(width, height, numRequired, random, result.solutionPaths);
      
      return {
        id: puzzleId,
        width,
        height,
        pairs: result.pairs,
        walls: walls,
        corridors: corridors,
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
      return {
        id: puzzleId,
        width: 5,
        height: 5,
        pairs: result.pairs,
        walls: [],
        corridors: [],
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
    corridors: [],
    requiredCells: []
  };
}
