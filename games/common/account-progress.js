/**
 * Sync local streak/stats blobs to user_progress on the server.
 */
import { GAME_META } from './games.js';

export function collectLocalProgress() {
  const games = {};
  for (const { id } of GAME_META) {
    let stats = null;
    let streak = null;
    try { stats = JSON.parse(localStorage.getItem(`dailygrid_${id}_stats`) || 'null'); } catch { /* ignore */ }
    try { streak = JSON.parse(localStorage.getItem(`dailygrid_${id}_streak`) || 'null'); } catch { /* ignore */ }
    if (stats || streak) {
      games[id] = { stats: stats || null, streak: streak || null };
    }
  }
  return { games, exportedAt: new Date().toISOString() };
}

export function applyRemoteProgress(progress) {
  if (!progress?.games) return;
  for (const [gameId, data] of Object.entries(progress.games)) {
    if (data?.stats) {
      try { localStorage.setItem(`dailygrid_${gameId}_stats`, JSON.stringify(data.stats)); } catch { /* ignore */ }
    }
    if (data?.streak) {
      try { localStorage.setItem(`dailygrid_${gameId}_streak`, JSON.stringify(data.streak)); } catch { /* ignore */ }
    }
  }
}

export async function uploadLocalProgress() {
  const snapshot = collectLocalProgress();
  const res = await fetch('/api/account/progress', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Progress upload failed');
  }
  return res.json();
}

export async function downloadRemoteProgress() {
  const res = await fetch('/api/account/progress', { credentials: 'include' });
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.progress) applyRemoteProgress(data.progress);
  return data;
}
