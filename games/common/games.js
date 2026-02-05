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
  }
];

export function getGameMeta(id) {
  return GAME_META.find(game => game.id === id) || null;
}

export function getOtherGames(currentId) {
  return GAME_META.filter(game => game.id !== currentId);
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

export function getDefaultNextGame(currentId, puzzleId) {
  const uncompleted = getUncompletedGames(currentId, puzzleId);
  return uncompleted.length > 0 ? uncompleted[0] : null;
}
