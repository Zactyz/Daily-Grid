const REQUIRED_IDS = [
  'timer',
  'pause-btn',
  'reset-btn',
  'leaderboard-btn',
  'pause-overlay',
  'start-overlay',
  'completion-modal',
  'final-time',
  'leaderboard-list',
  'leaderboard-title',
  'share-btn',
  'reset-modal',
  'confirm-reset-btn',
  'cancel-reset-btn',
  'exit-replay-modal',
  'confirm-exit-replay-btn',
  'cancel-exit-replay-btn',
  'exit-replay-btn',
  'claim-initials-form',
  'initials-input',
  'modal-title',
  'modal-subtitle',
  'practice-complete-actions',
  'try-again-btn',
  'next-level-btn',
  'back-to-daily-complete-btn',
  'practice-infinite-btn',
  'next-game-promo',
  'next-game-link',
  'next-game-logo',
  'next-game-text',
  'practice-mode-btn',
  'back-to-daily-btn',
  'daily-badge',
  'practice-badge'
];

export function mountShell({ ensureToast = true } = {}) {
  const missing = [];
  for (const id of REQUIRED_IDS) {
    if (!document.getElementById(id)) missing.push(id);
  }

  if (missing.length > 0) {
    console.warn('[shell] Missing required IDs:', missing.join(', '));
  }

  if (ensureToast && !document.getElementById('shell-toast')) {
    const toast = document.createElement('div');
    toast.id = 'shell-toast';
    toast.className = 'hidden fixed left-1/2 -translate-x-1/2 bottom-6 z-50 px-4 py-2 rounded-full text-xs font-semibold tracking-wide bg-black/70 border border-white/10 text-white';
    toast.innerHTML = '<span id="shell-toast-text"></span>';
    document.body.appendChild(toast);
  }
}
