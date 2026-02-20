/**
 * Tutorial Modal — Daily Grid Games
 *
 * Usage:
 *   import { showTutorialModal, hideTutorialModal } from '../common/tutorial-modal.js';
 *   showTutorialModal(window.DG_TUTORIAL_STEPS);
 *
 * Steps: [{ title: string, desc: string, demo: string (HTML/SVG) }]
 */

let _overlay = null;
let _steps   = [];
let _idx     = 0;

export function showTutorialModal(steps) {
  if (!steps?.length) return;
  if (_overlay) hideTutorialModal();

  _steps = steps;
  _idx   = 0;

  _overlay = document.createElement('div');
  _overlay.className = 'dg-tutorial-overlay';
  _overlay.setAttribute('role', 'dialog');
  _overlay.setAttribute('aria-modal', 'true');
  _overlay.setAttribute('aria-label', 'How to Play');

  _overlay.addEventListener('click', e => {
    if (e.target === _overlay) hideTutorialModal();
  });

  const card = document.createElement('div');
  card.className = 'dg-tutorial-card';
  _overlay.appendChild(card);
  document.body.appendChild(_overlay);

  requestAnimationFrame(() => _overlay.classList.add('dg-visible'));
  _render(card, _idx, null);
}

export function hideTutorialModal() {
  if (!_overlay) return;
  _overlay.classList.remove('dg-visible');
  const el = _overlay;
  _overlay = null;
  setTimeout(() => el.remove(), 280);
}

// ── Private ────────────────────────────────────────────────────────────────────

function _render(card, idx, dir) {
  const step   = _steps[idx];
  const isFirst = idx === 0;
  const isLast  = idx === _steps.length - 1;

  const slideClass = dir === 'fwd' ? 'dg-slide-fwd' : dir === 'back' ? 'dg-slide-back' : '';

  card.innerHTML = `
    <button class="dg-tutorial-skip" aria-label="Skip tutorial">Skip</button>
    <div class="dg-tutorial-step${slideClass ? ' ' + slideClass : ''}">
      <div class="dg-tutorial-demo">${step.demo}</div>
      <div class="dg-tutorial-text">
        <p class="dg-tutorial-title">${step.title}</p>
        <p class="dg-tutorial-desc">${step.desc}</p>
      </div>
      <div class="dg-tutorial-dots">
        ${_steps.map((_, i) => `<span class="dg-tutorial-dot${i === idx ? ' dg-active' : ''}"></span>`).join('')}
      </div>
      <div class="dg-tutorial-nav">
        <button class="dg-tutorial-btn dg-tutorial-btn-prev" ${isFirst ? 'disabled' : ''} aria-label="Previous">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <button class="dg-tutorial-btn dg-tutorial-btn-next${isLast ? ' dg-last' : ''}"
                aria-label="${isLast ? 'Done' : 'Next'}">
          ${isLast ? 'Got it!' : 'Next'}
        </button>
      </div>
    </div>`;

  card.querySelector('.dg-tutorial-skip').addEventListener('click', hideTutorialModal);

  const prev = card.querySelector('.dg-tutorial-btn-prev');
  const next = card.querySelector('.dg-tutorial-btn-next');

  if (!isFirst) prev.addEventListener('click', () => { _idx--; _render(card, _idx, 'back'); });
  if (isLast)   next.addEventListener('click', hideTutorialModal);
  else          next.addEventListener('click', () => { _idx++; _render(card, _idx, 'fwd');  });
}
