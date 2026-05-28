#!/usr/bin/env node
/** Verify today's Bridges daily puzzle is solvable. */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(resolve(root, 'games/hashi/hashi-ui.js'), 'utf8');

// Extract generator helpers (no DOM) by eval in isolated scope
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const fnBlock = src.slice(src.indexOf('function makeRng'), src.indexOf('function loadState()'));
const fns = new Function('hashString', `${fnBlock}\nreturn { makeRng, generatePuzzle, getFallbackTemplates, validatePuzzleStructure, buildVisibilityEdges, buildCrossingMap, countSolutions };`)(hashString);

const { generatePuzzle, getFallbackTemplates, validatePuzzleStructure } = fns;

function getPTDateYYYYMMDD(now = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = dtf.formatToParts(now);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

const seed = process.argv[2] || getPTDateYYYYMMDD();

getFallbackTemplates().forEach((t, i) => {
  console.log(`Template ${i}:`, validatePuzzleStructure(t) ? 'OK' : 'BAD');
});

const puzzle = generatePuzzle(seed, { isDaily: true });
const ok = validatePuzzleStructure(puzzle);
const templateIdx = hashString(seed) % getFallbackTemplates().length;

console.log('Seed:', seed);
console.log('Puzzle valid:', ok);
console.log('Islands:', puzzle.islands.length, 'grid:', puzzle.gridSize);
console.log('Fallback template index:', templateIdx);

if (!ok) {
  console.error('UNSOLVABLE');
  process.exit(1);
}
console.log('OK — puzzle verifies');
