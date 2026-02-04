import { getPTDateYYYYMMDD, formatTime, getOrCreateAnonId } from '../common/utils.js';
import { createShellController } from '../common/shell-controller.js';
import { formatDateForShare } from '../common/share.js';
import { buildShareCard } from '../common/share-card.js';

const CANVAS_SIZE = 700;
const PADDING = 70;
const ISLAND_RADIUS = 38;
const BRIDGE_GAP = 10;
const STATE_PREFIX = 'dailygrid_hashi_state_';

const els = {
  canvas: document.getElementById('hashi-canvas'),
  progress: document.getElementById('progress-text'),
  puzzleDate: document.getElementById('puzzle-date'),
  islandCount: document.getElementById('island-count')
};

let puzzle = null;
let islandMap = new Map();
const bridges = new Map();
let selected = null;
let shell = null;
let currentMode = 'daily';
let puzzleId = getPTDateYYYYMMDD();
let puzzleSeed = puzzleId;
let baseElapsed = 0;
let startTimestamp = 0;
let timerStarted = false;
let isPaused = false;
let isComplete = false;
let completionMs = null;
let tickInterval = null;
let pointerDownIsland = null;
let visibilityEdges = [];
let solutionShown = false;
const solutionEls = {
  showSolutionBtn: document.getElementById('show-solution-btn'),
  solutionActions: document.getElementById('solution-actions'),
  solutionRetryBtn: document.getElementById('solution-retry-btn'),
  solutionNextBtn: document.getElementById('solution-next-btn')
};

function makeRng(seedString) {
  let seed = 1779033703 ^ seedString.length;
  for (let i = 0; i < seedString.length; i += 1) {
    seed = Math.imul(seed ^ seedString.charCodeAt(i), 3432918353);
    seed = (seed << 13) | (seed >>> 19);
  }
  return function rng() {
    seed = Math.imul(seed ^ (seed >>> 16), 2246822507);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909);
    seed ^= seed >>> 16;
    return (seed >>> 0) / 4294967296;
  };
}

function rngInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getPuzzleIdForMode(mode) {
  if (mode === 'practice') return `practice-${puzzleSeed}`;
  return getPTDateYYYYMMDD();
}

function getStateKey() {
  return `${STATE_PREFIX}${currentMode}_${puzzleId}`;
}

function canvasPointFor(island) {
  const cell = (CANVAS_SIZE - PADDING * 2) / (puzzle.gridSize - 1);
  return {
    x: PADDING + island.c * cell,
    y: PADDING + island.r * cell
  };
}

function updateVisibilityEdges() {
  visibilityEdges = buildVisibilityEdges(puzzle.islands);
}

function updateSolutionUI() {
  if (!solutionEls.showSolutionBtn || !solutionEls.solutionActions) return;
  if (currentMode !== 'practice') {
    solutionEls.showSolutionBtn.classList.add('hidden');
    solutionEls.solutionActions.classList.add('hidden');
    return;
  }
  if (solutionShown) {
    solutionEls.showSolutionBtn.classList.add('hidden');
    solutionEls.solutionActions.classList.remove('hidden');
  } else {
    solutionEls.showSolutionBtn.classList.remove('hidden');
    solutionEls.solutionActions.classList.add('hidden');
  }
}

function showSolution() {
  if (currentMode !== 'practice' || solutionShown || !puzzle?.solutionEdges?.length) return;
  bridges.clear();
  puzzle.solutionEdges.forEach((edge) => {
    if (!edge || edge.count <= 0) return;
    bridges.set(edgeId(edge.a, edge.b), edge.count);
  });
  solutionShown = true;
  isComplete = true;
  completionMs = completionMs ?? getElapsedMs();
  isPaused = true;
  timerStarted = true;
  updateProgressText();
  updateSolutionUI();
  draw();
  shell?.update();
}

function edgeId(a, b) {
  return a < b ? `${a}--${b}` : `${b}--${a}`;
}

function getBridgeCount(a, b) {
  return bridges.get(edgeId(a, b)) || 0;
}

function setBridgeCount(a, b, count) {
  if (count <= 0) {
    bridges.delete(edgeId(a, b));
  } else {
    bridges.set(edgeId(a, b), Math.min(2, count));
  }
}

function islandsBetween(a, b) {
  const ia = islandMap.get(a);
  const ib = islandMap.get(b);
  if (!ia || !ib) return [];
  const between = [];
  if (ia.r === ib.r) {
    const row = ia.r;
    const minC = Math.min(ia.c, ib.c);
    const maxC = Math.max(ia.c, ib.c);
    puzzle.islands.forEach((island) => {
      if (island.r === row && island.c > minC && island.c < maxC) between.push(island);
    });
  } else if (ia.c === ib.c) {
    const col = ia.c;
    const minR = Math.min(ia.r, ib.r);
    const maxR = Math.max(ia.r, ib.r);
    puzzle.islands.forEach((island) => {
      if (island.c === col && island.r > minR && island.r < maxR) between.push(island);
    });
  }
  return between;
}

function connectionOrientation(a, b) {
  const ia = islandMap.get(a);
  const ib = islandMap.get(b);
  if (!ia || !ib) return null;
  if (ia.r === ib.r) return 'h';
  if (ia.c === ib.c) return 'v';
  return null;
}

function wouldCross(a, b) {
  const ia = islandMap.get(a);
  const ib = islandMap.get(b);
  const orientation = connectionOrientation(a, b);
  if (!orientation) return true;

  const aX = ia.c;
  const aY = ia.r;
  const bX = ib.c;
  const bY = ib.r;

  for (const [key, count] of bridges.entries()) {
    if (count <= 0) continue;
    const [cId, dId] = key.split('--');
    if (cId === a || cId === b || dId === a || dId === b) continue;
    const c = islandMap.get(cId);
    const d = islandMap.get(dId);
    if (!c || !d) continue;
    const otherOrientation = connectionOrientation(cId, dId);
    if (otherOrientation === orientation) continue;

    const cX = c.c;
    const cY = c.r;
    const dX = d.c;
    const dY = d.r;

    if (orientation === 'h') {
      const minX = Math.min(aX, bX);
      const maxX = Math.max(aX, bX);
      const minY = Math.min(cY, dY);
      const maxY = Math.max(cY, dY);
      const crossX = cX;
      const crossY = aY;
      if (crossX > minX && crossX < maxX && crossY > minY && crossY < maxY) {
        return true;
      }
    } else {
      const minX = Math.min(cX, dX);
      const maxX = Math.max(cX, dX);
      const minY = Math.min(aY, bY);
      const maxY = Math.max(aY, bY);
      const crossX = aX;
      const crossY = cY;
      if (crossX > minX && crossX < maxX && crossY > minY && crossY < maxY) {
        return true;
      }
    }
  }
  return false;
}

function isValidConnection(a, b) {
  if (a === b) return false;
  const orientation = connectionOrientation(a, b);
  if (!orientation) return false;
  if (islandsBetween(a, b).length > 0) return false;
  if (wouldCross(a, b)) return false;
  return true;
}

function updateProgressText() {
  if (!els.progress) return;
  if (isComplete) {
    els.progress.textContent = 'All islands connected.';
    return;
  }
  if (selected) {
    els.progress.textContent = `Selected island ${selected}. Choose a partner.`;
    return;
  }
  els.progress.textContent = 'Choose an island to start bridging.';
}

function getElapsedMs() {
  if (!timerStarted) return baseElapsed;
  if (isPaused) return baseElapsed;
  return baseElapsed + (performance.now() - startTimestamp);
}

function startTimer() {
  if (timerStarted && !isPaused) return;
  timerStarted = true;
  isPaused = false;
  startTimestamp = performance.now();
  saveProgress();
}

function pauseTimer() {
  if (!timerStarted || isPaused) return;
  baseElapsed = getElapsedMs();
  isPaused = true;
  saveProgress();
}

function resumeTimer() {
  if (!timerStarted) {
    timerStarted = true;
    baseElapsed = baseElapsed || 0;
  }
  if (!isPaused) return;
  isPaused = false;
  startTimestamp = performance.now();
  saveProgress();
}

function resetPuzzle({ resetTimer }) {
  bridges.clear();
  selected = null;
  isComplete = false;
  completionMs = null;
  solutionShown = false;

  if (resetTimer) {
    baseElapsed = 0;
    startTimestamp = 0;
    timerStarted = false;
    isPaused = false;
  }

  updateProgressText();
  updateSolutionUI();
  draw();
  saveProgress();
  shell?.update();
}

function getIslandProgress() {
  const counts = new Map();
  puzzle.islands.forEach((island) => counts.set(island.id, 0));
  bridges.forEach((count, key) => {
    const [a, b] = key.split('--');
    counts.set(a, (counts.get(a) || 0) + count);
    counts.set(b, (counts.get(b) || 0) + count);
  });
  return counts;
}

function isAllConnected() {
  if (puzzle.islands.length === 0) return false;
  const visited = new Set();
  const stack = [puzzle.islands[0].id];
  while (stack.length) {
    const current = stack.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    for (const [key, count] of bridges.entries()) {
      if (count <= 0) continue;
      const [a, b] = key.split('--');
      if (a === current && !visited.has(b)) stack.push(b);
      if (b === current && !visited.has(a)) stack.push(a);
    }
  }
  return visited.size === puzzle.islands.length;
}

function checkCompletion() {
  const counts = getIslandProgress();
  const allMatch = puzzle.islands.every((island) => counts.get(island.id) === island.required);
  if (allMatch && isAllConnected()) {
    isComplete = true;
    completionMs = getElapsedMs();
    baseElapsed = completionMs;
    isPaused = true;
    timerStarted = true;
    saveProgress();
    shell?.update();
  }
}

function cycleBridge(a, b) {
  if (!isValidConnection(a, b)) {
    selected = b;
    updateProgressText();
    draw();
    return;
  }
  const current = getBridgeCount(a, b);
  const next = (current + 1) % 3;
  setBridgeCount(a, b, next);
  selected = null;
  updateProgressText();
  draw();
  checkCompletion();
  saveProgress();
  shell?.update();
}

function getIslandAtPoint(clientX, clientY) {
  if (!els.canvas) return null;
  const rect = els.canvas.getBoundingClientRect();
  const scaleX = els.canvas.width / rect.width;
  const scaleY = els.canvas.height / rect.height;
  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;
  return puzzle.islands.find((island) => {
    const pos = canvasPointFor(island);
    return Math.hypot(x - pos.x, y - pos.y) <= ISLAND_RADIUS;
  })?.id || null;
}

function handlePointerDown(event) {
  if (isComplete) return;
  pointerDownIsland = getIslandAtPoint(event.clientX, event.clientY);
}

function handlePointerUp(event) {
  if (isComplete) return;
  const endIsland = getIslandAtPoint(event.clientX, event.clientY);
  if (!endIsland) {
    const edgeHit = getEdgeAtPoint(event.clientX, event.clientY);
    if (edgeHit) {
      if (!timerStarted) startTimer();
      if (isPaused) resumeTimer();
      cycleBridge(edgeHit.a, edgeHit.b);
    }
    pointerDownIsland = null;
    return;
  }

  if (!timerStarted) startTimer();
  if (isPaused) resumeTimer();

  if (!pointerDownIsland) {
    selected = endIsland;
    updateProgressText();
    draw();
    return;
  }

  if (pointerDownIsland === endIsland) {
    if (selected && selected !== endIsland) {
      cycleBridge(selected, endIsland);
      pointerDownIsland = null;
      return;
    }
    if (selected === endIsland) {
      selected = null;
    } else {
      selected = endIsland;
    }
    updateProgressText();
    draw();
    pointerDownIsland = null;
    return;
  }

  cycleBridge(pointerDownIsland, endIsland);
  pointerDownIsland = null;
}

function handlePointerLeave() {
  pointerDownIsland = null;
}

function getEdgeAtPoint(clientX, clientY) {
  if (!els.canvas || !visibilityEdges.length) return null;
  const rect = els.canvas.getBoundingClientRect();
  const scaleX = els.canvas.width / rect.width;
  const scaleY = els.canvas.height / rect.height;
  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;
  const threshold = 14;

  for (const edge of visibilityEdges) {
    const a = islandMap.get(edge.a);
    const b = islandMap.get(edge.b);
    if (!a || !b) continue;
    const p1 = canvasPointFor(a);
    const p2 = canvasPointFor(b);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    let t = ((x - p1.x) * dx + (y - p1.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = p1.x + t * dx;
    const projY = p1.y + t * dy;
    const dist = Math.hypot(x - projX, y - projY);
    if (dist <= threshold) {
      return edge;
    }
  }
  return null;
}

function drawGrid(ctx) {
  const cell = (CANVAS_SIZE - PADDING * 2) / (puzzle.gridSize - 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i < puzzle.gridSize; i += 1) {
    const x = PADDING + i * cell;
    ctx.beginPath();
    ctx.moveTo(x, PADDING);
    ctx.lineTo(x, CANVAS_SIZE - PADDING);
    ctx.stroke();

    const y = PADDING + i * cell;
    ctx.beginPath();
    ctx.moveTo(PADDING, y);
    ctx.lineTo(CANVAS_SIZE - PADDING, y);
    ctx.stroke();
  }
}

function drawBridgeLine(ctx, x1, y1, x2, y2) {
  const pad = ISLAND_RADIUS - 8;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const sx = x1 + Math.cos(angle) * pad;
  const sy = y1 + Math.sin(angle) * pad;
  const ex = x2 - Math.cos(angle) * pad;
  const ey = y2 - Math.sin(angle) * pad;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
}

function drawBridges(ctx) {
  for (const [key, count] of bridges.entries()) {
    if (count <= 0) continue;
    const [aId, bId] = key.split('--');
    const a = islandMap.get(aId);
    const b = islandMap.get(bId);
    if (!a || !b) continue;
    const aPos = canvasPointFor(a);
    const bPos = canvasPointFor(b);
    const horizontal = a.r === b.r;
    const offset = count === 2 ? BRIDGE_GAP : 0;

    ctx.strokeStyle = '#f5d0a7';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';

    if (horizontal) {
      const y = aPos.y;
      drawBridgeLine(ctx, aPos.x, y - offset, bPos.x, y - offset);
      if (count === 2) {
        drawBridgeLine(ctx, aPos.x, y + offset, bPos.x, y + offset);
      }
    } else {
      const x = aPos.x;
      drawBridgeLine(ctx, x - offset, aPos.y, x - offset, bPos.y);
      if (count === 2) {
        drawBridgeLine(ctx, x + offset, aPos.y, x + offset, bPos.y);
      }
    }
  }
}

function drawIslands(ctx) {
  const counts = getIslandProgress();
  puzzle.islands.forEach((island) => {
    const pos = canvasPointFor(island);
    const current = counts.get(island.id) || 0;
    const satisfied = current === island.required;

    ctx.fillStyle = satisfied ? '#1a120e' : '#2a1b14';
    ctx.strokeStyle = selected === island.id ? '#f5d0a7' : '#d8a06a';
    ctx.lineWidth = selected === island.id ? 4 : 2;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, ISLAND_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = satisfied ? '#f5d0a7' : '#f0e2d4';
    ctx.font = 'bold 22px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(island.required), pos.x, pos.y);

    ctx.font = '14px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(245, 208, 167, 0.8)';
    ctx.fillText(`${current}`, pos.x, pos.y + 24);
  });
}

function draw() {
  if (!els.canvas || !puzzle) return;
  const ctx = els.canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.fillStyle = '#1a0f0c';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  drawGrid(ctx);
  drawBridges(ctx);
  drawIslands(ctx);
}

function buildVisibilityEdges(islands) {
  const edges = [];
  for (let i = 0; i < islands.length; i += 1) {
    for (let j = i + 1; j < islands.length; j += 1) {
      const a = islands[i];
      const b = islands[j];
      if (a.r !== b.r && a.c !== b.c) continue;
      const between = islandsBetweenIds(a, b, islands);
      if (between.length > 0) continue;
      edges.push({ a: a.id, b: b.id, orientation: a.r === b.r ? 'h' : 'v' });
    }
  }
  return edges;
}

function islandsBetweenIds(a, b, islands) {
  const between = [];
  if (a.r === b.r) {
    const minC = Math.min(a.c, b.c);
    const maxC = Math.max(a.c, b.c);
    islands.forEach((island) => {
      if (island.r === a.r && island.c > minC && island.c < maxC) between.push(island);
    });
  } else if (a.c === b.c) {
    const minR = Math.min(a.r, b.r);
    const maxR = Math.max(a.r, b.r);
    islands.forEach((island) => {
      if (island.c === a.c && island.r > minR && island.r < maxR) between.push(island);
    });
  }
  return between;
}

function buildCrossingMap(edges, islands) {
  const crossings = new Map();
  edges.forEach((_, idx) => crossings.set(idx, []));
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const e1 = edges[i];
      const e2 = edges[j];
      if (e1.orientation === e2.orientation) continue;
      const a = islands.find(island => island.id === e1.a);
      const b = islands.find(island => island.id === e1.b);
      const c = islands.find(island => island.id === e2.a);
      const d = islands.find(island => island.id === e2.b);
      if (!a || !b || !c || !d) continue;
      const h = e1.orientation === 'h' ? { a, b } : { a: c, b: d };
      const v = e1.orientation === 'v' ? { a, b } : { a: c, b: d };
      const minX = Math.min(h.a.c, h.b.c);
      const maxX = Math.max(h.a.c, h.b.c);
      const minY = Math.min(v.a.r, v.b.r);
      const maxY = Math.max(v.a.r, v.b.r);
      const crossX = v.a.c;
      const crossY = h.a.r;
      if (crossX > minX && crossX < maxX && crossY > minY && crossY < maxY) {
        crossings.get(i).push(j);
        crossings.get(j).push(i);
      }
    }
  }
  return crossings;
}

function countSolutions({ islands, edges, crossings }, limit = 2) {
  const islandIndex = new Map(islands.map((island, idx) => [island.id, idx]));
  const degrees = islands.map(island => island.required);
  const edgeCounts = new Array(edges.length).fill(-1);

  const incident = islands.map(() => []);
  edges.forEach((edge, idx) => {
    incident[islandIndex.get(edge.a)].push(idx);
    incident[islandIndex.get(edge.b)].push(idx);
  });

  function maxRemaining(idx) {
    let total = 0;
    for (const e of incident[idx]) {
      if (edgeCounts[e] === -1) total += 2;
    }
    return total;
  }

  function chooseEdge() {
    let best = -1;
    let bestOptions = null;
    for (let i = 0; i < edges.length; i += 1) {
      if (edgeCounts[i] !== -1) continue;
      const edge = edges[i];
      const aIdx = islandIndex.get(edge.a);
      const bIdx = islandIndex.get(edge.b);
      const options = [0, 1, 2].filter(v => v <= degrees[aIdx] && v <= degrees[bIdx]);
      if (!bestOptions || options.length < bestOptions.length) {
        best = i;
        bestOptions = options;
        if (options.length <= 1) break;
      }
    }
    return { index: best, options: bestOptions || [] };
  }

  let solutions = 0;

  function isConnected() {
    const usedEdges = edges.filter((_, idx) => edgeCounts[idx] > 0);
    if (usedEdges.length === 0) return false;
    const adjacency = new Map();
    islands.forEach(island => adjacency.set(island.id, []));
    usedEdges.forEach((edge, idx) => {
      if (edgeCounts[idx] <= 0) return;
      adjacency.get(edge.a).push(edge.b);
      adjacency.get(edge.b).push(edge.a);
    });
    const start = islands[0].id;
    const stack = [start];
    const visited = new Set();
    while (stack.length) {
      const current = stack.pop();
      if (visited.has(current)) continue;
      visited.add(current);
      adjacency.get(current).forEach(next => {
        if (!visited.has(next)) stack.push(next);
      });
    }
    return visited.size === islands.length;
  }

  function dfs() {
    if (solutions >= limit) return;
    const { index, options } = chooseEdge();
    if (index === -1) {
      if (degrees.every(val => val === 0) && isConnected()) {
        solutions += 1;
      }
      return;
    }

    const edge = edges[index];
    const aIdx = islandIndex.get(edge.a);
    const bIdx = islandIndex.get(edge.b);

    for (const val of options) {
      if (val > 0) {
        let blocked = false;
        for (const cross of crossings.get(index)) {
          if (edgeCounts[cross] > 0) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
      }

      edgeCounts[index] = val;
      degrees[aIdx] -= val;
      degrees[bIdx] -= val;

      if (degrees[aIdx] >= 0 && degrees[bIdx] >= 0) {
        const maxA = maxRemaining(aIdx);
        const maxB = maxRemaining(bIdx);
        if (degrees[aIdx] <= maxA && degrees[bIdx] <= maxB) {
          dfs();
        }
      }

      degrees[aIdx] += val;
      degrees[bIdx] += val;
      edgeCounts[index] = -1;

      if (solutions >= limit) return;
    }
  }

  dfs();
  return solutions;
}

function generatePuzzle(seedString) {
  const rng = makeRng(seedString);
  const maxAttempts = 120;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const gridSize = rngInt(rng, 5, 7);
    const islandCount = rngInt(rng, 6, 10);
    const allCells = [];
    for (let r = 0; r < gridSize; r += 1) {
      for (let c = 0; c < gridSize; c += 1) {
        allCells.push({ r, c });
      }
    }
    shuffleInPlace(allCells, rng);
    const islands = allCells.slice(0, islandCount).map((cell, idx) => ({
      id: String.fromCharCode(65 + idx),
      r: cell.r,
      c: cell.c,
      required: 0
    }));

    const edges = buildVisibilityEdges(islands);
    if (edges.length < islands.length - 1) continue;

    const degreeOptions = new Map(islands.map(island => [island.id, 0]));
    edges.forEach(edge => {
      degreeOptions.set(edge.a, degreeOptions.get(edge.a) + 1);
      degreeOptions.set(edge.b, degreeOptions.get(edge.b) + 1);
    });
    const degrees = Array.from(degreeOptions.values());
    const avgDegree = degrees.reduce((a, b) => a + b, 0) / degrees.length;
    const maxDegree = Math.max(...degrees);
    if (edges.length < islands.length + 1) continue;
    if (avgDegree < 2.2 || maxDegree < 3) continue;

    const crossings = buildCrossingMap(edges, islands);

    const adjacency = new Map();
    islands.forEach(island => adjacency.set(island.id, []));
    edges.forEach((edge, idx) => {
      adjacency.get(edge.a).push({ id: edge.b, idx });
      adjacency.get(edge.b).push({ id: edge.a, idx });
    });

    const visited = new Set();
    const stack = [islands[0].id];
    visited.add(islands[0].id);

    const edgeCounts = new Array(edges.length).fill(0);
    while (stack.length) {
      const current = stack.pop();
      const neighbors = shuffleInPlace([...adjacency.get(current)], rng);
      for (const neighbor of neighbors) {
        if (visited.has(neighbor.id)) continue;
        const crossingBlocked = crossings.get(neighbor.idx).some(cross => edgeCounts[cross] > 0);
        if (crossingBlocked) continue;
        visited.add(neighbor.id);
        edgeCounts[neighbor.idx] = 1;
        stack.push(neighbor.id);
      }
    }
    if (visited.size !== islands.length) continue;

    const edgeOrder = shuffleInPlace(edges.map((_, idx) => idx), rng);
    for (const idx of edgeOrder) {
      if (edgeCounts[idx] > 0) continue;
      if (rng() < 0.65) {
        const canAdd = crossings.get(idx).every(cross => edgeCounts[cross] === 0);
        if (!canAdd) continue;
        edgeCounts[idx] = rng() < 0.45 ? 2 : 1;
      }
    }

    const targetDouble = rngInt(rng, 1, 3);
    let doubleCount = edgeCounts.filter(count => count === 2).length;
    if (doubleCount < targetDouble) {
      const candidates = edgeOrder.filter(idx => edgeCounts[idx] === 1);
      for (const idx of candidates) {
        if (doubleCount >= targetDouble) break;
        const canAdd = crossings.get(idx).every(cross => edgeCounts[cross] === 0);
        if (!canAdd) continue;
        edgeCounts[idx] = 2;
        doubleCount += 1;
      }
    }

    const degreeMap = new Map(islands.map(island => [island.id, 0]));
    edgeCounts.forEach((count, idx) => {
      if (count <= 0) return;
      const edge = edges[idx];
      degreeMap.set(edge.a, degreeMap.get(edge.a) + count);
      degreeMap.set(edge.b, degreeMap.get(edge.b) + count);
    });

    if ([...degreeMap.values()].some(val => val === 0)) continue;

    islands.forEach((island) => {
      island.required = degreeMap.get(island.id) || 0;
    });

    const solutions = countSolutions({ islands, edges, crossings }, 2);
    if (solutions === 1) {
      const solutionEdges = edgeCounts
        .map((count, idx) => (count > 0 ? { ...edges[idx], count } : null))
        .filter(Boolean);
      return { gridSize, islands, solutionEdges };
    }
  }

  const fallback = {
    gridSize: 5,
    islands: [
      { id: 'A', r: 0, c: 1, required: 1 },
      { id: 'B', r: 0, c: 3, required: 1 },
      { id: 'C', r: 2, c: 1, required: 4 },
      { id: 'D', r: 2, c: 3, required: 4 },
      { id: 'E', r: 4, c: 1, required: 2 },
      { id: 'F', r: 4, c: 3, required: 2 }
    ],
    solutionEdges: [
      { a: 'A', b: 'C', count: 1 },
      { a: 'C', b: 'E', count: 2 },
      { a: 'B', b: 'D', count: 1 },
      { a: 'D', b: 'F', count: 2 },
      { a: 'C', b: 'D', count: 1 }
    ]
  };
  return fallback;
}

function loadState() {
  if (currentMode !== 'daily') return null;
  try {
    const raw = localStorage.getItem(getStateKey());
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.bridges)) return null;
    if (data.timerStarted && !data.isComplete && !data.isPaused) {
      data.isPaused = true;
    }
    return data;
  } catch {
    return null;
  }
}

function saveProgress() {
  if (currentMode !== 'daily') return;
  const bridgesData = Array.from(bridges.entries()).map(([key, count]) => ({ key, count }));
  const payload = {
    bridges: bridgesData,
    timeMs: getElapsedMs(),
    timerStarted,
    isPaused,
    isComplete,
    completionMs
  };
  try {
    localStorage.setItem(getStateKey(), JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

function applySavedState(saved) {
  bridges.clear();
  if (saved?.bridges) {
    saved.bridges.forEach(({ key, count }) => {
      if (!key || typeof count !== 'number') return;
      bridges.set(key, count);
    });
  }
}

function initState() {
  const saved = loadState();
  applySavedState(saved);
  baseElapsed = saved?.timeMs ?? 0;
  timerStarted = saved?.timerStarted ?? false;
  isPaused = saved?.isPaused ?? false;
  isComplete = saved?.isComplete ?? false;
  completionMs = saved?.completionMs ?? null;
}

function setDateLabel() {
  if (!els.puzzleDate) return;
  if (currentMode === 'practice') {
    els.puzzleDate.textContent = 'Practice';
    return;
  }
  els.puzzleDate.textContent = puzzleId;
}

function ensureTicker() {
  if (tickInterval) return;
  tickInterval = window.setInterval(() => {
    shell?.update();
  }, 200);
}

function resetPracticePuzzle() {
  puzzleSeed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  puzzleId = getPuzzleIdForMode('practice');
  puzzle = generatePuzzle(puzzleSeed);
  islandMap = new Map(puzzle.islands.map(i => [i.id, i]));
  updateVisibilityEdges();
  bridges.clear();
  selected = null;
  solutionShown = false;
  baseElapsed = 0;
  startTimestamp = 0;
  timerStarted = false;
  isPaused = false;
  isComplete = false;
  completionMs = null;
  updateProgressText();
  setDateLabel();
  updateSolutionUI();
  if (els.islandCount) els.islandCount.textContent = String(puzzle.islands.length);
  draw();
  shell?.update();
}

function switchMode(mode) {
  if (currentMode === mode) return;
  saveProgress();
  currentMode = mode;
  if (mode === 'practice') {
    puzzleSeed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  } else {
    puzzleSeed = getPTDateYYYYMMDD();
  }
  puzzleId = getPuzzleIdForMode(mode);
  puzzle = generatePuzzle(puzzleSeed);
  islandMap = new Map(puzzle.islands.map(i => [i.id, i]));
  updateVisibilityEdges();
  bridges.clear();
  selected = null;
  solutionShown = false;
  initState();
  updateProgressText();
  setDateLabel();
  updateSolutionUI();
  if (els.islandCount) els.islandCount.textContent = String(puzzle.islands.length);
  draw();
  shell?.update();
}

function initShell() {
  if (shell) return;

  shell = createShellController({
    gameId: 'hashi',
    getMode: () => currentMode,
    getPuzzleId: () => puzzleId,
    getGridLabel: () => `${puzzle.gridSize}x${puzzle.gridSize} Bridges`,
    getElapsedMs: () => getElapsedMs(),
    formatTime,
    autoStartOnProgress: true,
    isComplete: () => isComplete,
    isPaused: () => isPaused,
    isStarted: () => timerStarted,
    hasProgress: () => bridges.size > 0,
    isSolutionShown: () => solutionShown,
    shouldShowCompletionModal: () => !solutionShown,
    pause: () => pauseTimer(),
    resume: () => resumeTimer(),
    startGame: () => startTimer(),
    resetGame: () => resetPuzzle({ resetTimer: false }),
    startReplay: () => {},
    exitReplay: () => {},
    onResetUI: () => {},
    onTryAgain: () => resetPuzzle({ resetTimer: true }),
    onNextLevel: () => resetPracticePuzzle(),
    onBackToDaily: () => switchMode('daily'),
    onPracticeInfinite: () => switchMode('practice'),
    onStartPractice: () => switchMode('practice'),
    onStartDaily: () => switchMode('daily'),
    getAnonId: () => getOrCreateAnonId(),
    getCompletionPayload: () => ({
      timeMs: Math.max(3000, Math.min(getElapsedMs(), 3600000)),
      hintsUsed: 0
    }),
    getShareMeta: () => ({
      gameName: 'Bridgeworks',
      shareUrl: 'https://dailygrid.app/games/hashi/',
      gridLabel: `${puzzle.gridSize}x${puzzle.gridSize} Bridges`
    }),
    getShareFile: () => buildShareImage(),
    getCompletionMs: () => completionMs,
    setCompletionMs: (ms) => {
      completionMs = ms;
    },
    isTimerRunning: () => timerStarted && !isPaused && !isComplete,
    disableReplay: true,
    pauseOnHide: true
  });
}

async function buildShareImage() {
  const finalTime = completionMs ?? getElapsedMs();
  const puzzleDate = formatDateForShare(getPTDateYYYYMMDD());
  return buildShareCard({
    gameName: 'Bridgeworks',
    logoPath: '/games/hashi/hashi-logo.svg',
    accent: '#E8B47A',
    accentSoft: 'rgba(232, 180, 122, 0.12)',
    backgroundStart: '#120A08',
    backgroundEnd: '#1a100b',
    dateText: puzzleDate,
    timeText: formatTime(finalTime || 0),
    gridLabel: `Grid ${puzzle.gridSize}x${puzzle.gridSize}`,
    footerText: 'dailygrid.app/games/hashi'
  });
}

function init() {
  puzzleSeed = getPTDateYYYYMMDD();
  puzzleId = getPuzzleIdForMode(currentMode);
  puzzle = generatePuzzle(puzzleSeed);
  islandMap = new Map(puzzle.islands.map(i => [i.id, i]));
  updateVisibilityEdges();
  if (els.islandCount) els.islandCount.textContent = String(puzzle.islands.length);
  initState();
  updateProgressText();
  setDateLabel();
  updateSolutionUI();
  draw();
  initShell();
  ensureTicker();
  shell?.update();
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  els.canvas?.addEventListener('pointerdown', handlePointerDown);
  els.canvas?.addEventListener('pointerup', handlePointerUp);
  els.canvas?.addEventListener('pointerleave', handlePointerLeave);
  solutionEls.showSolutionBtn?.addEventListener('click', showSolution);
  solutionEls.solutionRetryBtn?.addEventListener('click', () => resetPuzzle({ resetTimer: true }));
  solutionEls.solutionNextBtn?.addEventListener('click', () => resetPracticePuzzle());
  window.startPracticeMode = () => switchMode('practice');
  window.startDailyMode = () => switchMode('daily');
  window.addEventListener('beforeunload', saveProgress);
});
