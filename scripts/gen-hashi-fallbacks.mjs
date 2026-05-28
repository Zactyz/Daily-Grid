#!/usr/bin/env node
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(resolve(root, 'games/hashi/hashi-ui.js'), 'utf8');
const fnBlock = src.slice(src.indexOf('function makeRng'), src.indexOf('function loadState()'));
const fns = new Function(`${fnBlock}\nreturn { makeRng, tryGeneratePuzzle, buildVisibilityEdges, buildCrossingMap, countSolutions };`)();
const { makeRng, tryGeneratePuzzle, buildVisibilityEdges, buildCrossingMap, countSolutions } = fns;

function validate(puzzle) {
  const deg = new Map(puzzle.islands.map((i) => [i.id, 0]));
  for (const e of puzzle.solutionEdges) {
    deg.set(e.a, deg.get(e.a) + e.count);
    deg.set(e.b, deg.get(e.b) + e.count);
  }
  if (puzzle.islands.some((i) => deg.get(i.id) !== i.required)) return false;
  const edges = buildVisibilityEdges(puzzle.islands);
  const crossings = buildCrossingMap(edges, puzzle.islands);
  const islandsCopy = puzzle.islands.map((i) => ({ ...i }));
  return countSolutions({ islands: islandsCopy, edges, crossings }, 2) === 1;
}

const opts = { gridMin: 5, gridMax: 7, islandMin: 6, islandMax: 10, avgDegreeMin: 2.2 };
const templates = [];
for (let t = 0; templates.length < 3; t += 1) {
  for (let a = 0; a < 500; a += 1) {
    const p = tryGeneratePuzzle(makeRng(`fallback-template-${t}-${a}`), opts);
    if (!p || !validate(p)) continue;
    const clean = {
      gridSize: p.gridSize,
      islands: p.islands.map(({ id, r, c, required }) => ({ id, r, c, required })),
      solutionEdges: p.solutionEdges.map(({ a: aa, b, count }) => ({ a: aa, b, count }))
    };
    if (clean.islands.length < 6 || clean.islands.length > 8) continue;
    templates.push(clean);
    break;
  }
}
if (templates.length < 3) {
  console.error('Could not generate 3 templates');
  process.exit(1);
}
console.log(JSON.stringify(templates, null, 2));
