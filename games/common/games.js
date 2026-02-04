const GAME_META = [
  {
    id: 'snake',
    name: 'Snake',
    path: '/games/snake/',
    logo: '/games/snake/snake-logo.png',
    submittedKeyPrefix: 'dailygrid_submitted_',
    completedKeyPrefix: 'dailygrid_completed_',
    replayKeyPrefix: 'dailygrid_replay_',
    theme: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400' },
    shareUrl: 'https://dailygrid.app/games/snake/'
  },
  {
    id: 'pathways',
    name: 'Pathways',
    path: '/games/pathways/',
    logo: '/games/pathways/pathways-logo.png',
    submittedKeyPrefix: 'dailygrid_pathways_submitted_',
    completedKeyPrefix: 'dailygrid_pathways_completed_',
    replayKeyPrefix: 'dailygrid_pathways_replay_',
    theme: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-400' },
    shareUrl: 'https://dailygrid.app/games/pathways/'
  },
  {
    id: 'lattice',
    name: 'Lattice',
    path: '/games/lattice/',
    logo: '/games/lattice/lattice-logo.png?v=2',
    submittedKeyPrefix: 'dailygrid_lattice_submitted_',
    completedKeyPrefix: 'dailygrid_lattice_completed_',
    replayKeyPrefix: 'dailygrid_lattice_replay_',
    theme: { bg: 'bg-sky-500/10', border: 'border-sky-500/30', text: 'text-sky-400' },
    shareUrl: 'https://dailygrid.app/games/lattice/'
  },
  {
    id: 'bits',
    name: 'Bits',
    path: '/games/bits/',
    logo: '/games/bits/bitsnew-logo.jpg',
    submittedKeyPrefix: 'dailygrid_bits_submitted_',
    completedKeyPrefix: 'dailygrid_bits_completed_',
    theme: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400' },
    shareUrl: 'https://dailygrid.app/games/bits/'
  },
  {
    id: 'hashi',
    name: 'Bridgeworks',
    path: '/games/hashi/',
    logo: '/games/hashi/hashi-logo.jpg',
    submittedKeyPrefix: 'dailygrid_hashi_submitted_',
    completedKeyPrefix: 'dailygrid_hashi_completed_',
    theme: { bg: 'bg-sky-500/10', border: 'border-sky-400/30', text: 'text-sky-300' },
    shareUrl: 'https://dailygrid.app/games/hashi/'
  },
  {
    id: 'shikaku',
    name: 'Parcel',
    path: '/games/shikaku/',
    logo: '/games/shikaku/shikaku-logo.jpg',
    submittedKeyPrefix: 'dailygrid_shikaku_submitted_',
    completedKeyPrefix: 'dailygrid_shikaku_completed_',
    theme: { bg: 'bg-amber-300/15', border: 'border-amber-300/30', text: 'text-amber-200' },
    shareUrl: 'https://dailygrid.app/games/shikaku/'
  },
  {
    id: 'pipes',
    name: 'Flowline',
    path: '/games/pipes/',
    logo: '/games/pipes/pipes-logo.svg',
    submittedKeyPrefix: 'dailygrid_pipes_submitted_',
    completedKeyPrefix: 'dailygrid_pipes_completed_',
    theme: { bg: 'bg-cyan-500/10', border: 'border-cyan-400/30', text: 'text-cyan-300' },
    shareUrl: 'https://dailygrid.app/games/pipes/'
  }
];

const PLAY_STATS_KEY = 'dailygrid_play_stats_v1';
const MIN_DAYS_FOR_PERSONALIZED = 3;

export function getGameMeta(id) {
  return GAME_META.find(game => game.id === id) || null;
}

export function getOtherGames(currentId) {
  return GAME_META.filter(game => game.id !== currentId);
}

function loadPlayStats() {
  try {
    const raw = localStorage.getItem(PLAY_STATS_KEY);
    if (!raw) return { games: {}, daysWithCompletion: [] };
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return { games: {}, daysWithCompletion: [] };
    if (!data.games) data.games = {};
    if (!Array.isArray(data.daysWithCompletion)) data.daysWithCompletion = [];
    return data;
  } catch {
    return { games: {}, daysWithCompletion: [] };
  }
}

function savePlayStats(stats) {
  try {
    localStorage.setItem(PLAY_STATS_KEY, JSON.stringify(stats));
  } catch {
    // ignore storage failures
  }
}

export function recordGameCompletion(gameId, puzzleId) {
  if (!gameId || !puzzleId) return;
  const stats = loadPlayStats();
  const gameStats = stats.games?.[gameId] || { completions: 0, lastCompleted: 0, lastPuzzleId: null };
  if (gameStats.lastPuzzleId === puzzleId) return;

  gameStats.completions = (gameStats.completions || 0) + 1;
  gameStats.lastCompleted = Date.now();
  gameStats.lastPuzzleId = puzzleId;
  stats.games = stats.games || {};
  stats.games[gameId] = gameStats;

  const days = new Set(stats.daysWithCompletion || []);
  days.add(puzzleId);
  stats.daysWithCompletion = Array.from(days).slice(-30);

  savePlayStats(stats);
}

function getPersonalizedOrder(games, { now = Date.now(), minDays = MIN_DAYS_FOR_PERSONALIZED } = {}) {
  const stats = loadPlayStats();
  if (!stats.daysWithCompletion || stats.daysWithCompletion.length < minDays) return games;

  const maxCompletions = Math.max(1, ...games.map(game => stats.games?.[game.id]?.completions || 0));
  return [...games].sort((a, b) => {
    const aStats = stats.games?.[a.id] || {};
    const bStats = stats.games?.[b.id] || {};
    const aPlays = (aStats.completions || 0) / maxCompletions;
    const bPlays = (bStats.completions || 0) / maxCompletions;
    const aDaysSince = aStats.lastCompleted ? (now - aStats.lastCompleted) / 86400000 : 999;
    const bDaysSince = bStats.lastCompleted ? (now - bStats.lastCompleted) / 86400000 : 999;
    const aRecency = Math.max(0, 1 - (aDaysSince / 14));
    const bRecency = Math.max(0, 1 - (bDaysSince / 14));
    const aScore = (aPlays * 0.6) + (aRecency * 0.4);
    const bScore = (bPlays * 0.6) + (bRecency * 0.4);
    return bScore - aScore;
  });
}

export function getUncompletedGames(currentId, puzzleId) {
  if (!puzzleId) {
    return getOtherGames(currentId);
  }

  return getOtherGames(currentId).filter(game => {
    try {
      const completedKey = game.completedKeyPrefix ? `${game.completedKeyPrefix}${puzzleId}` : null;
      if (completedKey && localStorage.getItem(completedKey) === 'true') return false;
      const submittedKey = `${game.submittedKeyPrefix}${puzzleId}`;
      return localStorage.getItem(submittedKey) !== 'true';
    } catch (error) {
      console.warn('Unable to read completed flag for', game.id, error);
      return true;
    }
  });
}

export function getUncompletedGamesSorted(currentId, puzzleId) {
  const base = getUncompletedGames(currentId, puzzleId);
  return getPersonalizedOrder(base);
}

export function getDefaultNextGame(currentId, puzzleId) {
  const uncompleted = getUncompletedGames(currentId, puzzleId);
  return uncompleted.length > 0 ? uncompleted[0] : null;
}
