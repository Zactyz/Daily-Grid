/**
 * Tutorial Modal — Daily Grid Games
 *
 * Usage:
 *   import { showTutorialModal, hideTutorialModal } from '../common/tutorial-modal.js';
 *   showTutorialModal(window.DG_TUTORIAL_STEPS, { gameName, logoSrc, accent });
 *
 * Steps: [{ title: string, desc: string, demo: string (HTML/SVG) }]
 * Branding is auto-detected from the page when not supplied.
 */

let _overlay = null;
let _steps = [];
let _idx = 0;
let _brand = {};

function detectBranding(overrides = {}) {
  let accent = '';
  try {
    accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--brand-accent')
      .trim();
  } catch { /* ignore */ }

  const navImg = document.querySelector('nav img');
  const logoSrc = overrides.logoSrc
    || navImg?.getAttribute('src')
    || document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')
    || '';

  const gameName = overrides.gameName
    || document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content
    || (document.title || '').split(/\s+(?:by|—|-)\s+/i)[0].trim()
    || 'Daily Grid';

  return {
    accent: overrides.accent || accent || '#7dd3fc',
    logoSrc,
    gameName
  };
}

export function showTutorialModal(steps, branding = {}) {
  if (!steps?.length) return;
  if (_overlay) hideTutorialModal();

  _steps = steps;
  _idx = 0;
  _brand = detectBranding(branding);

  _overlay = document.createElement('div');
  _overlay.className = 'dg-tutorial-overlay';
  _overlay.setAttribute('role', 'dialog');
  _overlay.setAttribute('aria-modal', 'true');
  _overlay.setAttribute('aria-label', `How to play ${_brand.gameName}`);
  _overlay.style.setProperty('--dg-tut-accent', _brand.accent);

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
  document.removeEventListener('keydown', _onKeydown);
  setTimeout(() => el.remove(), 280);
}

function _onKeydown(e) {
  if (!_overlay) return;
  if (e.key === 'Escape') hideTutorialModal();
  else if (e.key === 'ArrowRight' && _idx < _steps.length - 1) _go(1);
  else if (e.key === 'ArrowLeft' && _idx > 0) _go(-1);
}

function _go(delta) {
  const card = _overlay?.querySelector('.dg-tutorial-card');
  if (!card) return;
  _idx += delta;
  _render(card, _idx, delta > 0 ? 'fwd' : 'back');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ── Private ────────────────────────────────────────────────────────────────────

function _render(card, idx, dir) {
  const step = _steps[idx];
  const isFirst = idx === 0;
  const isLast = idx === _steps.length - 1;

  const slideClass = dir === 'fwd' ? 'dg-slide-fwd' : dir === 'back' ? 'dg-slide-back' : '';

  const logo = _brand.logoSrc
    ? `<img class="dg-tutorial-logo" src="${escapeHtml(_brand.logoSrc)}" alt="" aria-hidden="true">`
    : '';

  card.innerHTML = `
    <div class="dg-tutorial-header">
      <div class="dg-tutorial-brand">
        ${logo}
        <div class="dg-tutorial-brand-text">
          <span class="dg-tutorial-eyebrow">How to play</span>
          <span class="dg-tutorial-game">${escapeHtml(_brand.gameName)}</span>
        </div>
      </div>
      <button class="dg-tutorial-skip" aria-label="Skip tutorial">Skip</button>
    </div>

    <div class="dg-tutorial-step${slideClass ? ' ' + slideClass : ''}">
      <div class="dg-tutorial-demo">${step.demo || ''}</div>
      <div class="dg-tutorial-text">
        <p class="dg-tutorial-title">${escapeHtml(step.title || '')}</p>
        <p class="dg-tutorial-desc">${step.desc || ''}</p>
      </div>
    </div>

    <div class="dg-tutorial-footer">
      <div class="dg-tutorial-dots">
        ${_steps.map((_, i) => `<span class="dg-tutorial-dot${i === idx ? ' dg-active' : ''}"></span>`).join('')}
      </div>
      <div class="dg-tutorial-nav">
        <button class="dg-tutorial-btn dg-tutorial-btn-prev" ${isFirst ? 'disabled' : ''} aria-label="Previous">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <button class="dg-tutorial-btn dg-tutorial-btn-next${isLast ? ' dg-last' : ''}"
                aria-label="${isLast ? 'Start playing' : 'Next'}">
          ${isLast ? 'Start playing' : 'Next'}
        </button>
      </div>
    </div>`;

  card.querySelector('.dg-tutorial-skip').addEventListener('click', hideTutorialModal);

  const prev = card.querySelector('.dg-tutorial-btn-prev');
  const next = card.querySelector('.dg-tutorial-btn-next');

  if (!isFirst) prev.addEventListener('click', () => _go(-1));
  if (isLast) next.addEventListener('click', hideTutorialModal);
  else next.addEventListener('click', () => _go(1));

  document.removeEventListener('keydown', _onKeydown);
  document.addEventListener('keydown', _onKeydown);
}
