// Deterministic puzzle generator for Snake game
// Fast approach: Generate path first, add walls and clues

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
        // Warnsdorff's heuristic: count unvisited neighbors
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
    
    // Sort by degree (prefer cells with fewer options) with some randomness
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

// Place clues evenly along the path
function placeClues(path, numClues, random) {
  const numbers = {};
  const totalCells = path.length;
  
  // Always place 1 at start and max at end
  numbers[`${path[0][0]},${path[0][1]}`] = 1;
  numbers[`${path[totalCells - 1][0]},${path[totalCells - 1][1]}`] = numClues;
  
  if (numClues > 2) {
    // Distribute middle clues evenly with slight randomness
    const middleClues = numClues - 2;
    const segment = totalCells / (middleClues + 1);
    
    for (let i = 1; i <= middleClues; i++) {
      // Target position with variance
      let targetIdx = Math.floor(i * segment);
      const variance = Math.floor(segment / 4);
      targetIdx += Math.floor(random() * (variance * 2 + 1)) - variance;
      targetIdx = Math.max(1, Math.min(totalCells - 2, targetIdx));
      
      // Avoid collision with existing clues
      const key = `${path[targetIdx][0]},${path[targetIdx][1]}`;
      if (!numbers[key]) {
        numbers[key] = i + 1;
      } else {
        // Find nearest unused cell
        for (let offset = 1; offset < totalCells; offset++) {
          const tryIdx = targetIdx + offset;
          if (tryIdx > 0 && tryIdx < totalCells - 1) {
            const tryKey = `${path[tryIdx][0]},${path[tryIdx][1]}`;
            if (!numbers[tryKey]) {
              numbers[tryKey] = i + 1;
              break;
            }
          }
        }
      }
    }
  }
  
  return numbers;
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
  
  // More clues = more constrained = effectively unique
  const numClues = 5 + Math.floor(paramRandom() * 3); // 5-7 clues
  
  // Wall count
  const baseWalls = Math.floor(totalCells / 5);
  const numWalls = baseWalls + Math.floor(paramRandom() * 3);
  
  // Try to generate a valid path (increase attempts for reliability)
  for (let attempt = 0; attempt < 200; attempt++) {
    const seed = baseSeed + attempt * 1000;
    const random = createSeededRandom(seed);
    
    const path = generatePath(width, height, random);
    if (path && path.length === totalCells) {
      const walls = generateWalls(width, height, path, numWalls, random);
      const numbers = placeClues(path, numClues, random);
      
      return {
        id: puzzleId,
        width,
        height,
        numbers,
        walls,
        solution: path // Include solution for "Show Solution" feature
      };
    }
  }
  
  // If large grid failed, try smaller grid as fallback
  const smallerWidth = 5;
  const smallerHeight = 5;
  const smallerTotalCells = smallerWidth * smallerHeight;
  const smallerNumClues = 5 + Math.floor(paramRandom() * 2);
  const smallerNumWalls = 4 + Math.floor(paramRandom() * 3);
  
  for (let attempt = 0; attempt < 100; attempt++) {
    const seed = baseSeed + 500000 + attempt * 1000;
    const random = createSeededRandom(seed);
    
    const path = generatePath(smallerWidth, smallerHeight, random);
    if (path && path.length === smallerTotalCells) {
      const walls = generateWalls(smallerWidth, smallerHeight, path, smallerNumWalls, random);
      const numbers = placeClues(path, smallerNumClues, random);
      
      return {
        id: puzzleId,
        width: smallerWidth,
        height: smallerHeight,
        numbers,
        walls,
        solution: path // Include solution for "Show Solution" feature
      };
    }
  }
  
  // Ultimate fallback (should never happen)
  console.warn('Using ultimate fallback puzzle for', puzzleId);
  return {
    id: puzzleId,
    width: 5,
    height: 5,
    numbers: { '0,0': 1, '4,0': 2, '4,4': 3, '0,4': 4 },
    walls: [],
    // Simple snake path going around the grid
    solution: [
      [0,0], [1,0], [2,0], [3,0], [4,0],
      [4,1], [3,1], [2,1], [1,1], [0,1],
      [0,2], [1,2], [2,2], [3,2], [4,2],
      [4,3], [3,3], [2,3], [1,3], [0,3],
      [0,4], [1,4], [2,4], [3,4], [4,4]
    ]
  };
}
