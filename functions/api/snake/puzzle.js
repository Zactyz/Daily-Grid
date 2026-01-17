// GET /api/snake/puzzle - Get today's puzzle (cached in KV)

import { getPTDateYYYYMMDD } from '../../_shared/snake-utils-server.js';

// --- Shared Utilities (inlined to avoid module resolution issues) ---

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

// --- Warnsdorff's Heuristic Path Generation (Much faster/reliable than backtracking) ---

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

function generatePuzzleForDate(puzzleId) {
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
  
  // Try to generate a valid path (usually succeeds on first try)
  for (let attempt = 0; attempt < 50; attempt++) {
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
  
  // Fallback (should rarely happen with Warnsdorff)
  console.warn('Using fallback puzzle for', puzzleId);
  return {
    id: puzzleId,
    width: 5,
    height: 5,
    numbers: { '0,0': 1, '1,2': 2, '2,4': 3, '3,2': 4, '4,0': 5, '4,4': 6 },
    walls: []
  };
}

// --- Request Handler ---

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
