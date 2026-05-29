#!/usr/bin/env node
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const storage = new Map();
global.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, v),
};

const { GAME_META, sortGamesByPlayHistory } = await import(`file://${resolve(root, 'games/common/games.js')}`);

const now = Date.now();
const today = new Date(now).toISOString().slice(0, 10);
const day = (n) => new Date(now - n * 86400000).toISOString().slice(0, 10);

storage.set('dailygrid_play_stats_v1', JSON.stringify({
  daysWithCompletion: [day(5), day(3), day(1)],
  games: {
    snake: { completions: 50, lastCompleted: now - 2 * 86400000, lastPuzzleId: day(2) },
    pathways: { completions: 40, lastCompleted: now - 1 * 86400000, lastPuzzleId: day(1) },
    bits: { completions: 5, lastCompleted: now - 10 * 86400000, lastPuzzleId: day(10) },
    polyfit: { completions: 2, lastCompleted: 0, lastPuzzleId: null }
  }
}));

// User started Conduit today but did not finish — should sort last despite recent play.
storage.set(`dailygrid_conduit_state_daily_${today}`, JSON.stringify({
  moveCount: 3,
  timerStarted: true,
  isComplete: false
}));

const pool = GAME_META.filter((g) => ['snake', 'pathways', 'conduit', 'bits'].includes(g.id));
const sorted = sortGamesByPlayHistory(pool, { puzzleId: today });
const ids = sorted.map((g) => g.id);

console.log('Order:', ids.join(' > '));

const ok = ids[ids.length - 1] === 'conduit' && ids[0] === 'pathways';
if (!ok) {
  console.error('FAIL: expected pathways first and conduit last');
  process.exit(1);
}
console.log('OK');
