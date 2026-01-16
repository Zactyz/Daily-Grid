// Deterministic puzzle generator for Snake game
// Fast approach: Generate path first, then verify unique solution

import { normalizeWall, createSeededRandom, hashString } from './snake-utils.js';

// Shuffle array in place using seeded random
function shuffleArray(arr, random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// Generate a random Hamiltonian path on an EMPTY grid (no walls)
// Uses Warnsdorff's heuristic for speed
function generatePath(width, height, random) {
  const totalCells = width * height;
  const visited = new Set();
  const path = [];
  
  let x = Math.floor(random() * width);
  let y = Math.floor(random() * height);
  
  visited.add(`${x},${y}`);
  path.push([x, y]);
  
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  
  while (path.length < totalCells) {
    const neighbors = [];
    
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited.has(`${nx},${ny}`)) {
        let degree = 0;
        for (const [ddx, ddy] of dirs) {
          const nnx = nx + ddx;
          const nny = ny + ddy;
          if (nnx >= 0 && nnx < width && nny >= 0 && nny < height && !visited.has(`${nnx},${nny}`)) {
            degree++;
          }
        }
        neighbors.push({ x: nx, y: ny, degree });
      }
    }
    
    if (neighbors.length === 0) {
      return null; // Dead end, will retry
    }
    
    neighbors.sort((a, b) => a.degree - b.degree);
    const bestDegree = neighbors[0].degree;
    const bestNeighbors = neighbors.filter(n => n.degree <= bestDegree + 1);
    const chosen = bestNeighbors[Math.floor(random() * bestNeighbors.length)];
    
    x = chosen.x;
    y = chosen.y;
    visited.add(`${x},${y}`);
    path.push([x, y]);
  }
  
  return path;
}

// Generate walls that DON'T block the solution path
function generateWalls(width, height, path, numWalls, random) {
  const pathEdges = new Set();
  for (let i = 0; i < path.length - 1; i++) {
    pathEdges.add(normalizeWall(path[i], path[i + 1]));
  }
  
  const availableEdges = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < width - 1) {
        const edge = normalizeWall([x, y], [x + 1, y]);
        if (!pathEdges.has(edge)) availableEdges.push(edge);
      }
      if (y < height - 1) {
        const edge = normalizeWall([x, y], [x, y + 1]);
        if (!pathEdges.has(edge)) availableEdges.push(edge);
      }
    }
  }
  
  shuffleArray(availableEdges, random);
  return availableEdges.slice(0, Math.min(numWalls, availableEdges.length));
}

// Fast solution counter - returns 0, 1, or 2+ (stops early)
function countSolutions(width, height, numbers, walls, maxCount = 2) {
  const wallSet = new Set(walls);
  const totalCells = width * height;
  
  // Find start cell (where number 1 is)
  let startCell = null;
  const cluePositions = {};
  const maxClue = Math.max(...Object.values(numbers));
  
  for (const [key, num] of Object.entries(numbers)) {
    const [x, y] = key.split(',').map(Number);
    cluePositions[num] = [x, y];
    if (num === 1) startCell = [x, y];
  }
  
  if (!startCell) return 0;
  
  let solutionCount = 0;
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  
  function solve(path, nextClue) {
    if (solutionCount >= maxCount) return;
    
    if (path.length === totalCells) {
      // Verify we hit all clues
      const lastCell = path[path.length - 1];
      const lastKey = `${lastCell[0]},${lastCell[1]}`;
      if (numbers[lastKey] === maxClue) {
        solutionCount++;
      }
      return;
    }
    
    const [cx, cy] = path[path.length - 1];
    const visited = new Set(path.map(([x, y]) => `${x},${y}`));
    
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      const nKey = `${nx},${ny}`;
      
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (visited.has(nKey)) continue;
      
      const wallId = normalizeWall([cx, cy], [nx, ny]);
      if (wallSet.has(wallId)) continue;
      
      // Check clue constraint
      const cellClue = numbers[nKey];
      if (cellClue !== undefined) {
        if (cellClue !== nextClue) continue; // Must hit clues in order
        path.push([nx, ny]);
        solve(path, nextClue + 1);
        path.pop();
      } else {
        path.push([nx, ny]);
        solve(path, nextClue);
        path.pop();
      }
      
      if (solutionCount >= maxCount) return;
    }
  }
  
  solve([startCell], 2); // Start at 1, looking for 2 next
  return solutionCount;
}

// Place clues along the path at specific indices
function placeCluesAtIndices(path, indices) {
  const numbers = {};
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    const [x, y] = path[idx];
    numbers[`${x},${y}`] = i + 1;
  }
  return numbers;
}

// Generate clue indices that create a unique solution
function findUniqueClues(width, height, path, walls, random) {
  const totalCells = path.length;
  
  // Start with endpoints (1 at start, max at end)
  let clueIndices = [0, totalCells - 1];
  
  // Add middle clues until we get exactly 1 solution
  const middleIndices = [];
  for (let i = 1; i < totalCells - 1; i++) {
    middleIndices.push(i);
  }
  shuffleArray(middleIndices, random);
  
  // Try with just 2 clues first, then add more
  for (let extraClues = 0; extraClues <= 8; extraClues++) {
    const testIndices = [0, ...middleIndices.slice(0, extraClues), totalCells - 1].sort((a, b) => a - b);
    const numbers = placeCluesAtIndices(path, testIndices);
    
    const solutions = countSolutions(width, height, numbers, walls, 2);
    
    if (solutions === 1) {
      return testIndices;
    }
  }
  
  // Fallback: use many clues to force uniqueness
  const manyClues = [0];
  const step = Math.floor(totalCells / 6);
  for (let i = step; i < totalCells - 1; i += step) {
    manyClues.push(i);
  }
  manyClues.push(totalCells - 1);
  return manyClues;
}

// Main export: Generate puzzle for a given date string
export function generatePuzzleForDate(puzzleId) {
  const baseSeed = hashString(puzzleId);
  const paramRandom = createSeededRandom(baseSeed);
  
  // Vary grid size
  const sizeRoll = paramRandom();
  let width, height;
  if (sizeRoll < 0.4) {
    width = 5; height = 5;
  } else if (sizeRoll < 0.6) {
    width = 5; height = 6;
  } else if (sizeRoll < 0.8) {
    width = 6; height = 5;
  } else {
    width = 6; height = 6;
  }
  
  const totalCells = width * height;
  const baseWalls = Math.floor(totalCells / 6);
  const numWalls = baseWalls + Math.floor(paramRandom() * 4);
  
  // Try to generate a valid unique puzzle
  for (let attempt = 0; attempt < 30; attempt++) {
    const seed = baseSeed + attempt * 1000;
    const random = createSeededRandom(seed);
    
    const path = generatePath(width, height, random);
    if (!path || path.length !== totalCells) continue;
    
    const walls = generateWalls(width, height, path, numWalls, random);
    const clueIndices = findUniqueClues(width, height, path, walls, random);
    const numbers = placeCluesAtIndices(path, clueIndices);
    
    // Final verification
    const solutions = countSolutions(width, height, numbers, walls, 2);
    if (solutions === 1) {
      return {
        id: puzzleId,
        width,
        height,
        numbers,
        walls
      };
    }
  }
  
  // Fallback with guaranteed unique (lots of clues)
  console.warn('Using fallback puzzle for', puzzleId);
  const random = createSeededRandom(baseSeed);
  const path = generatePath(5, 5, random) || [[0,0],[1,0],[2,0],[3,0],[4,0],[4,1],[3,1],[2,1],[1,1],[0,1],[0,2],[1,2],[2,2],[3,2],[4,2],[4,3],[3,3],[2,3],[1,3],[0,3],[0,4],[1,4],[2,4],[3,4],[4,4]];
  
  return {
    id: puzzleId,
    width: 5,
    height: 5,
    numbers: { '0,0': 1, '0,2': 2, '4,2': 3, '0,4': 4, '4,4': 5 },
    walls: []
  };
}
