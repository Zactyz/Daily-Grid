// Deterministic puzzle generator for Snake game
// Generates the same puzzle for any given date string

import { normalizeWall, createSeededRandom, hashString } from './snake-utils.js';

// Shuffle array in place using seeded random
function shuffleArray(arr, random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// Generate Hamiltonian path using backtracking with seeded randomness
// maxIterations prevents infinite loops on difficult configurations
function generateHamiltonianPath(width, height, walls, random, maxIterations = 50000) {
  const wallSet = new Set(walls);
  const visited = new Set();
  const path = [];
  let iterations = 0;
  
  function getNeighbors(x, y) {
    const neighbors = [];
    const dirs = [[0,-1], [1,0], [0,1], [-1,0]];
    
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const wallId = normalizeWall([x, y], [nx, ny]);
        if (!wallSet.has(wallId) && !visited.has(`${nx},${ny}`)) {
          neighbors.push([nx, ny]);
        }
      }
    }
    
    return neighbors;
  }
  
  function backtrack(x, y) {
    // Prevent infinite loops
    if (++iterations > maxIterations) return false;
    
    visited.add(`${x},${y}`);
    path.push([x, y]);
    
    if (visited.size === width * height) {
      return true;
    }
    
    const neighbors = getNeighbors(x, y);
    shuffleArray(neighbors, random);
    
    for (const [nx, ny] of neighbors) {
      if (backtrack(nx, ny)) {
        return true;
      }
    }
    
    visited.delete(`${x},${y}`);
    path.pop();
    return false;
  }
  
  const startX = Math.floor(random() * width);
  const startY = Math.floor(random() * height);
  
  if (backtrack(startX, startY)) {
    return path;
  }
  
  return null;
}

// Count solutions (stop at maxCount for efficiency)
function countSolutions(width, height, numbers, walls, maxCount = 2) {
  const wallSet = new Set(walls);
  const numberMap = { ...numbers };
  
  let solutionCount = 0;
  let iterations = 0;
  const maxIterations = 100000;
  
  function isValid(path, x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    if (path.some(([px, py]) => px === x && py === y)) return false;
    
    if (path.length === 0) {
      return numberMap[`${x},${y}`] === 1;
    }
    
    const [lastX, lastY] = path[path.length - 1];
    const isAdjacent = (Math.abs(x - lastX) === 1 && y === lastY) ||
                      (Math.abs(y - lastY) === 1 && x === lastX);
    if (!isAdjacent) return false;
    
    const wallId = normalizeWall([lastX, lastY], [x, y]);
    if (wallSet.has(wallId)) return false;
    
    const cellNum = numberMap[`${x},${y}`];
    if (cellNum !== undefined) {
      let maxSeen = 0;
      for (const [px, py] of path) {
        const num = numberMap[`${px},${py}`];
        if (num !== undefined && num > maxSeen) maxSeen = num;
      }
      if (cellNum !== maxSeen + 1) return false;
    }
    
    return true;
  }
  
  function solve(path) {
    // Prevent infinite loops
    if (solutionCount >= maxCount || ++iterations > maxIterations) return;
    
    if (path.length === width * height) {
      solutionCount++;
      return;
    }
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (isValid(path, x, y)) {
          path.push([x, y]);
          solve(path);
          path.pop();
        }
      }
    }
  }
  
  solve([]);
  return solutionCount;
}

// Main export: Generate puzzle for a given date string
// Same date always produces same puzzle (deterministic)
export function generatePuzzleForDate(puzzleId) {
  // Use date hash to determine puzzle parameters with variance
  const baseSeed = hashString(puzzleId);
  const paramRandom = createSeededRandom(baseSeed);
  
  // Fixed 5x5 grid (must match server for consistency)
  const width = 5;
  const height = 5;
  
  // Vary clue count: 4-6 based on grid size
  const totalCells = width * height;
  const minClues = 4;
  const maxClues = Math.min(6, Math.floor(totalCells / 6));
  const numClues = minClues + Math.floor(paramRandom() * (maxClues - minClues + 1));
  
  // Try with increasing seed offsets until we find a valid puzzle
  for (let seedOffset = 0; seedOffset < 5000; seedOffset++) {
    const seed = baseSeed + seedOffset + 1000; // Offset to avoid param seed collision
    const random = createSeededRandom(seed);
    
    // Determine wall count deterministically based on grid size
    const baseWalls = Math.floor(totalCells / 8);
    const numWalls = baseWalls + Math.floor(random() * 3);
    
    const puzzle = generatePuzzleAttemptEndOnNumber(width, height, numWalls, numClues, random);
    
    if (puzzle) {
      return {
        id: puzzleId,
        width,
        height,
        numbers: puzzle.numbers,
        walls: puzzle.walls
      };
    }
  }
  
  // Fallback: return a simple puzzle (should never happen with valid algorithm)
  console.error('Failed to generate puzzle for', puzzleId, '- using fallback');
  return {
    id: puzzleId,
    width: 6,
    height: 6,
    numbers: { '0,0': 1, '5,5': 2 },
    walls: []
  };
}

// Generate puzzle that ends on the highest numbered clue
function generatePuzzleAttemptEndOnNumber(width, height, numWalls, numClues, random) {
  const walls = [];
  const allEdges = [];
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < width - 1) allEdges.push([[x,y], [x+1,y]]);
      if (y < height - 1) allEdges.push([[x,y], [x,y+1]]);
    }
  }
  
  shuffleArray(allEdges, random);
  
  for (let i = 0; i < Math.min(numWalls, allEdges.length); i++) {
    const [a, b] = allEdges[i];
    walls.push(normalizeWall(a, b));
  }
  
  const solution = generateHamiltonianPath(width, height, walls, random);
  if (!solution) return null;
  
  const numbers = {};
  
  // Always place the highest number at the END of the solution path
  const lastCell = solution[solution.length - 1];
  numbers[`${lastCell[0]},${lastCell[1]}`] = numClues;
  
  // Always place 1 at the START of the solution path
  const firstCell = solution[0];
  numbers[`${firstCell[0]},${firstCell[1]}`] = 1;
  
  // Place remaining clues (2 to numClues-1) at random positions along the path
  if (numClues > 2) {
    const middleIndices = [];
    for (let i = 1; i < solution.length - 1; i++) {
      middleIndices.push(i);
    }
    shuffleArray(middleIndices, random);
    
    // Sort selected indices to maintain order, then assign numbers 2, 3, etc.
    const selectedIndices = middleIndices.slice(0, numClues - 2).sort((a, b) => a - b);
    
    for (let i = 0; i < selectedIndices.length; i++) {
      const idx = selectedIndices[i];
      const [x, y] = solution[idx];
      numbers[`${x},${y}`] = i + 2; // Numbers 2, 3, 4, ... (numClues-1)
    }
  }
  
  const solCount = countSolutions(width, height, numbers, walls, 2);
  
  if (solCount === 1) {
    return { numbers, walls };
  }
  
  return null;
}