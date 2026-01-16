// GET /api/snake/puzzle - Get today's puzzle (cached in KV)

import { getPTDateYYYYMMDD } from '../../_shared/snake-utils-server.js';

// Seeded PRNG (mulberry32)
function createSeededRandom(seed) {
  let state = seed;
  return function() {
    state |= 0;
    state = state + 0x6D2B79F5 | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash | 0;
  }
  return Math.abs(hash);
}

function normalizeWall(a, b) {
  const [ax, ay] = a;
  const [bx, by] = b;
  const s1 = `${ax},${ay}`;
  const s2 = `${bx},${by}`;
  return (s1 < s2) ? `${s1}-${s2}` : `${s2}-${s1}`;
}

function shuffleArray(arr, random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

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

function generatePuzzleAttempt(width, height, numWalls, numClues, random) {
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
  
  // Always place highest number at END
  const lastCell = solution[solution.length - 1];
  numbers[`${lastCell[0]},${lastCell[1]}`] = numClues;
  
  // Always place 1 at START
  const firstCell = solution[0];
  numbers[`${firstCell[0]},${firstCell[1]}`] = 1;
  
  // Place remaining clues
  if (numClues > 2) {
    const middleIndices = [];
    for (let i = 1; i < solution.length - 1; i++) {
      middleIndices.push(i);
    }
    shuffleArray(middleIndices, random);
    
    const selectedIndices = middleIndices.slice(0, numClues - 2).sort((a, b) => a - b);
    
    for (let i = 0; i < selectedIndices.length; i++) {
      const idx = selectedIndices[i];
      const [x, y] = solution[idx];
      numbers[`${x},${y}`] = i + 2;
    }
  }
  
  const solCount = countSolutions(width, height, numbers, walls, 2);
  
  if (solCount === 1) {
    return { numbers, walls };
  }
  
  return null;
}

function generatePuzzleForDate(puzzleId) {
  const baseSeed = hashString(puzzleId);
  const paramRandom = createSeededRandom(baseSeed);
  
  // Server-side can handle larger grids: 6x6 (50%), 6x7/7x6 (30%), 7x7 (20%)
  const sizeRoll = paramRandom();
  let width, height;
  if (sizeRoll < 0.5) {
    width = 6; height = 6;
  } else if (sizeRoll < 0.65) {
    width = 6; height = 7;
  } else if (sizeRoll < 0.8) {
    width = 7; height = 6;
  } else {
    width = 7; height = 7;
  }
  
  const totalCells = width * height;
  const minClues = 4;
  const maxClues = Math.min(6, Math.floor(totalCells / 6));
  const numClues = minClues + Math.floor(paramRandom() * (maxClues - minClues + 1));
  
  for (let seedOffset = 0; seedOffset < 5000; seedOffset++) {
    const seed = baseSeed + seedOffset + 1000;
    const random = createSeededRandom(seed);
    
    const baseWalls = Math.floor(totalCells / 8);
    const numWalls = baseWalls + Math.floor(random() * 3);
    
    const puzzle = generatePuzzleAttempt(width, height, numWalls, numClues, random);
    
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
  
  // Fallback
  return {
    id: puzzleId,
    width: 6,
    height: 6,
    numbers: { '0,0': 1, '5,5': 2 },
    walls: []
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const today = getPTDateYYYYMMDD();
    const cacheKey = `puzzle:${today}`;
    
    // Try to get from KV cache first
    if (env.PUZZLE_CACHE) {
      const cached = await env.PUZZLE_CACHE.get(cacheKey, 'json');
      if (cached) {
        return new Response(JSON.stringify(cached), {
          status: 200,
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'X-Cache': 'HIT'
          }
        });
      }
    }
    
    // Generate puzzle
    const puzzle = generatePuzzleForDate(today);
    
    // Cache in KV for 24 hours
    if (env.PUZZLE_CACHE) {
      await env.PUZZLE_CACHE.put(cacheKey, JSON.stringify(puzzle), {
        expirationTtl: 86400 // 24 hours
      });
    }
    
    return new Response(JSON.stringify(puzzle), {
      status: 200,
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'X-Cache': 'MISS'
      }
    });

  } catch (error) {
    console.error('Puzzle API error:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate puzzle' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}