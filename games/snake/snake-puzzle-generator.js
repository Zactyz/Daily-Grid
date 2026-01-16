// Deterministic puzzle generator for Snake game
// Fast approach: Generate path first, then add compatible walls

import { normalizeWall, createSeededRandom, hashString } from './snake-utils.js';

// Shuffle array in place using seeded random
function shuffleArray(arr, random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// Generate a random Hamiltonian path on an EMPTY grid (no walls)
// This is fast because there are no constraints blocking movement
function generatePath(width, height, random) {
  const totalCells = width * height;
  const visited = new Set();
  const path = [];
  
  // Start from a random cell
  let x = Math.floor(random() * width);
  let y = Math.floor(random() * height);
  
  visited.add(`${x},${y}`);
  path.push([x, y]);
  
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  
  // Use Warnsdorff's heuristic: prefer cells with fewer unvisited neighbors
  while (path.length < totalCells) {
    const neighbors = [];
    
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited.has(`${nx},${ny}`)) {
        // Count unvisited neighbors of this neighbor (Warnsdorff's heuristic)
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
      // Dead end - restart with different starting point
      return null;
    }
    
    // Sort by degree (Warnsdorff's) but add randomness
    neighbors.sort((a, b) => a.degree - b.degree);
    
    // Pick from the best candidates with some randomness
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
  // Build set of edges used by the path
  const pathEdges = new Set();
  for (let i = 0; i < path.length - 1; i++) {
    const edge = normalizeWall(path[i], path[i + 1]);
    pathEdges.add(edge);
  }
  
  // Get all possible edges that are NOT in the path
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

// Place clues along the path
function placeClues(path, numClues, random) {
  const numbers = {};
  
  // Always place 1 at start
  numbers[`${path[0][0]},${path[0][1]}`] = 1;
  
  // Always place highest number at end
  const lastIdx = path.length - 1;
  numbers[`${path[lastIdx][0]},${path[lastIdx][1]}`] = numClues;
  
  if (numClues > 2) {
    // Distribute middle clues evenly along the path with some randomness
    const middleClues = numClues - 2;
    const spacing = Math.floor((path.length - 2) / (middleClues + 1));
    
    const middleIndices = [];
    for (let i = 1; i <= middleClues; i++) {
      // Base position with some variance
      let idx = i * spacing;
      const variance = Math.floor(spacing / 3);
      idx += Math.floor(random() * (variance * 2 + 1)) - variance;
      idx = Math.max(1, Math.min(path.length - 2, idx));
      
      // Avoid duplicates
      while (middleIndices.includes(idx) || idx === 0 || idx === lastIdx) {
        idx = (idx + 1) % (path.length - 1);
        if (idx === 0) idx = 1;
      }
      middleIndices.push(idx);
    }
    
    // Sort to assign numbers in path order
    middleIndices.sort((a, b) => a - b);
    
    for (let i = 0; i < middleIndices.length; i++) {
      const idx = middleIndices[i];
      const [x, y] = path[idx];
      numbers[`${x},${y}`] = i + 2;
    }
  }
  
  return numbers;
}

// Main export: Generate puzzle for a given date string
export function generatePuzzleForDate(puzzleId) {
  const baseSeed = hashString(puzzleId);
  const paramRandom = createSeededRandom(baseSeed);
  
  // Vary grid size: 5x5 (40%), 5x6 or 6x5 (40%), 6x6 (20%)
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
  
  // Clue count: 4-6
  const minClues = 4;
  const maxClues = 6;
  const numClues = minClues + Math.floor(paramRandom() * (maxClues - minClues + 1));
  
  // Wall count based on grid size
  const baseWalls = Math.floor(totalCells / 6);
  const numWalls = baseWalls + Math.floor(paramRandom() * 4);
  
  // Try to generate a valid path (should succeed quickly)
  for (let attempt = 0; attempt < 20; attempt++) {
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
        walls
      };
    }
  }
  
  // Fallback (should rarely happen)
  console.warn('Using fallback puzzle for', puzzleId);
  return {
    id: puzzleId,
    width: 5,
    height: 5,
    numbers: { '0,0': 1, '2,2': 2, '4,4': 3 },
    walls: []
  };
}
