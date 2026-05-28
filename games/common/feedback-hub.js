const MODAL_SEEN_KEY = 'dailygrid_feedback_modal_seen';
const CARD_DISMISSED_KEY = 'dailygrid_feedback_card_dismissed';
const CARD_VISIT_KEY = 'dailygrid_feedback_card_visits';
const CARD_RESHOW_MIN = 8;
const CARD_RESHOW_MAX = 15;

function isStandalonePwa() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function ensureFeedbackModal() {
  let modal = document.getElementById('dg-feedback-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'dg-feedback-modal';
  modal.className = 'hidden fixed inset-0 z-[55] flex items-center justify-center p-4';
  modal.style.background = 'rgba(0,0,0,0.75)';
  modal.innerHTML = `
    <div class="w-full max-w-sm rounded-2xl p-6" style="background:rgba(15,23,42,0.98);border:1px solid rgba(255,255,255,0.1)">
      <h2 class="text-lg font-semibold text-white mb-2">Ideas for Daily Grid?</h2>
      <p class="text-sm text-slate-400 mb-5">We would love your feedback — bugs, game ideas, or anything that would make the app better.</p>
      <div class="flex flex-col gap-2">
        <a href="/games/feedback/"
          class="w-full py-2.5 rounded-lg font-semibold text-sm text-black text-center"
          style="background:linear-gradient(135deg,#D4A650,#E5C37E);text-decoration:none">Give feedback</a>
        <button type="button" id="dg-feedback-modal-dismiss"
          class="w-full py-2.5 rounded-lg text-sm text-slate-400">Not now</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#dg-feedback-modal-dismiss')?.addEventListener('click', () => {
    try { localStorage.setItem(MODAL_SEEN_KEY, '1'); } catch { /* ignore */ }
    modal.classList.add('hidden');
  });
  return modal;
}

export function maybeShowFeedbackModal() {
  try {
    if (localStorage.getItem(MODAL_SEEN_KEY) === '1') return;
  } catch { return; }

  const modal = ensureFeedbackModal();
  modal.classList.remove('hidden');
  try { localStorage.setItem(MODAL_SEEN_KEY, '1'); } catch { /* ignore */ }
}

function shouldShowFeedbackCard() {
  let visits = 0;
  let dismissed = false;
  try {
    visits = Number(localStorage.getItem(CARD_VISIT_KEY)) || 0;
    dismissed = localStorage.getItem(CARD_DISMISSED_KEY) === '1';
  } catch { /* ignore */ }

  visits += 1;
  try { localStorage.setItem(CARD_VISIT_KEY, String(visits)); } catch { /* ignore */ }

  if (!dismissed) return true;

  const threshold = CARD_RESHOW_MIN + Math.floor(Math.random() * (CARD_RESHOW_MAX - CARD_RESHOW_MIN + 1));
  if (visits >= threshold) {
    try { localStorage.removeItem(CARD_DISMISSED_KEY); } catch { /* ignore */ }
    return true;
  }
  return false;
}

export function mountFeedbackHubCard(anchorEl) {
  if (!anchorEl || !shouldShowFeedbackCard()) return;

  const card = document.createElement('div');
  card.id = 'dg-feedback-hub-card';
  card.className = 'app-card rounded-2xl p-4 mb-4 flex items-start gap-3 relative';
  card.innerHTML = `
    <button type="button" id="dg-feedback-card-dismiss" aria-label="Dismiss"
      class="absolute top-3 right-3 text-slate-500 text-sm w-8 h-8 flex items-center justify-center">✕</button>
    <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
      style="background:rgba(212,166,80,0.15);border:1px solid rgba(212,166,80,0.25)">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E5C37E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a4 4 0 01-4 4H7l-4 3V7a4 4 0 014-4h10a4 4 0 014 4z"/>
      </svg>
    </div>
    <div class="flex-1 min-w-0 pr-6">
      <p class="font-semibold text-sm text-amber-100">Have ideas to improve Daily Grid?</p>
      <p class="text-xs text-slate-400 mt-1">Let us know — we read every message.</p>
      <a href="/games/feedback/" class="inline-block mt-2 text-xs font-semibold text-amber-400" style="text-decoration:none">Give feedback →</a>
    </div>`;

  anchorEl.insertAdjacentElement('afterend', card);

  card.querySelector('#dg-feedback-card-dismiss')?.addEventListener('click', () => {
    try { localStorage.setItem(CARD_DISMISSED_KEY, '1'); } catch { /* ignore */ }
    card.remove();
  });
}

export function getPwaModeLabel() {
  return isStandalonePwa() ? 'standalone' : 'browser';
}
