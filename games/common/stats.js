import { getStreak } from './streak.js';
import { formatTime } from './utils.js';

const STATS_KEY = (gameId) => `dailygrid_${gameId}_stats`;

/**
 * Record a completion for stats tracking.
 * Call only on daily completions.
 */
export function recordStats(gameId, timeMs) {
  const data = getStats(gameId);
  data.totalCompleted = (data.totalCompleted || 0) + 1;

  // Rolling average: store sum and count separately for precision
  data.totalTimeMs = (data.totalTimeMs || 0) + timeMs;
  data.timeSamples = (data.timeSamples || 0) + 1;

  try {
    localStorage.setItem(STATS_KEY(gameId), JSON.stringify(data));
  } catch { /* ignore */ }

  return data;
}

export function getStats(gameId) {
  try {
    const raw = localStorage.getItem(STATS_KEY(gameId));
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { totalCompleted: 0, totalTimeMs: 0, timeSamples: 0 };
}

/**
 * Build and show the stats modal overlay for a game.
 * Creates the modal DOM if it doesn't exist, then populates and shows it.
 */
export function showStatsModal(gameId, gameName) {
  let modal = document.getElementById('stats-modal-overlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'stats-modal-overlay';
    modal.innerHTML = `
      <div class="stats-modal-inner">
        <div class="stats-modal-header">
          <h2 id="stats-modal-title">Stats</h2>
          <button id="stats-modal-close" aria-label="Close stats">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div id="stats-modal-body" class="stats-modal-body"></div>
      </div>
    `;
    modal.style.cssText = `
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(5,5,15,.9); backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center; padding: 1rem;
    `;

    const inner = modal.querySelector('.stats-modal-inner');
    inner.style.cssText = `
      background: #0f1929; border: 1px solid rgba(255,255,255,.1);
      border-radius: 1.25rem; padding: 1.5rem; width: 100%; max-width: 360px;
      box-shadow: 0 24px 64px rgba(0,0,0,.5);
    `;

    const header = modal.querySelector('.stats-modal-header');
    header.style.cssText = `display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;`;

    const title = modal.querySelector('#stats-modal-title');
    title.style.cssText = `font-size: 1.125rem; font-weight: 700; color: #f8fafc;`;

    const closeBtn = modal.querySelector('#stats-modal-close');
    closeBtn.style.cssText = `background: none; border: none; cursor: pointer; color: #71717a; padding: 4px; display: flex; align-items: center;`;
    closeBtn.addEventListener('click', () => { modal.remove(); });

    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    document.body.appendChild(modal);
  }

  const streak = getStreak(gameId);
  const stats = getStats(gameId);
  const avgMs = stats.timeSamples > 0 ? stats.totalTimeMs / stats.timeSamples : 0;

  const title = modal.querySelector('#stats-modal-title');
  if (title) title.textContent = `${gameName} Stats`;

  const body = modal.querySelector('#stats-modal-body');
  if (!body) return;

  const statItems = [
    { label: 'Puzzles Completed', value: stats.totalCompleted },
    { label: 'Current Streak', value: streak.current ? `${streak.current} day${streak.current !== 1 ? 's' : ''}` : '—' },
    { label: 'Best Streak', value: streak.best ? `${streak.best} day${streak.best !== 1 ? 's' : ''}` : '—' },
    { label: 'Average Time', value: avgMs > 0 ? formatTime(avgMs) : '—' },
  ];

  body.innerHTML = statItems.map((item, i) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:.75rem 0;${i < statItems.length - 1 ? 'border-bottom:1px solid rgba(255,255,255,.06);' : ''}">
      <span style="font-size:.875rem;color:#a1a1aa;">${item.label}</span>
      <span style="font-size:.875rem;font-weight:700;color:#f8fafc;">${item.value}</span>
    </div>
  `).join('');
}
