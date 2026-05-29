import { GAME_META } from './games.js';

const STORAGE_PREFIX = 'dailygrid_announcement_seen_';
const LAUNCH_COUNT_KEY = 'dailygrid_pwa_launch_count';
const LAUNCH_COUNT_SESSION_KEY = 'dailygrid_pwa_launch_count_recorded';
const STYLE_TAG_ID = 'dg-announcement-styles';

const BRAND_LOGO = '/games/assets/dg-games-192.png';

const TAB_ICONS = {
  daily: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/></svg>`,
  practice: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="7" width="3.5" height="10" rx="1.75"/><rect x="5.5" y="10" width="1.5" height="4" rx="0.75"/><rect x="7" y="11" width="10" height="2" rx="1"/><rect x="17" y="10" width="1.5" height="4" rx="0.75"/><rect x="18.5" y="7" width="3.5" height="10" rx="1.75"/></svg>`,
  medals: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="10.5" y="2" width="3" height="4.5" rx="0.75"/><circle cx="12" cy="15" r="7"/></svg>`,
  profile: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="7.5" r="3.5"/><path d="M4 21c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5z"/></svg>`
};

// Auto-launching campaigns. Bump an `id` to re-show a campaign to everyone.
// The "What's New" 3rd-open tour was removed at the user's request; only the
// branded Welcome walkthrough remains.
const ANNOUNCEMENT_CAMPAIGNS = [
  {
    id: 'welcome-tour-2026-05-v5',
    title: 'Welcome',
    // TODO(revert-before-prod): temporarily browser-visible so the Welcome tour
    // can be reviewed on the preview URL. Set back to pwaOnly: true for release.
    pwaOnly: false,
    startsAt: '2026-02-27T00:00:00Z',
    priority: 220,
    minLaunchCount: 1,
    // No maxLaunchCount: the fresh id ensures every player (new or returning)
    // sees the refreshed welcome exactly once.
    steps: [
      {
        title: 'Welcome to Daily Grid',
        body: 'A calm home for daily logic puzzles. One fresh set every day — solve today\u2019s, or warm up in practice.',
        visual: 'brand'
      },
      {
        title: 'Nine puzzles, a new one each day',
        body: 'A whole lineup of original grid puzzles, each with a fresh daily challenge.',
        visual: 'gameGrid'
      },
      {
        title: 'Build a streak, earn medals',
        body: 'Daily, Practice, Medals, and Profile all live in one smooth flow. Keep your streak alive and track your progress.',
        visual: 'streak'
      }
    ]
  }
];

function ensureStyles() {
  if (document.getElementById(STYLE_TAG_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_TAG_ID;
  style.textContent = `
    @keyframes dgAncFadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes dgAncCardIn { from { opacity: 0; transform: translateY(14px) scale(.965); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes dgAncStepIn { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: translateX(0); } }

    .dg-anc-overlay {
      position: fixed; inset: 0; z-index: 140;
      display: flex; align-items: center; justify-content: center;
      padding: 22px 16px;
      background: radial-gradient(120% 70% at 50% -10%, rgba(212,166,80,.16), transparent 55%), rgba(5,7,14,.86);
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      animation: dgAncFadeIn .22s ease both;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif;
    }
    .dg-anc-card {
      width: min(94vw, 440px); max-height: 92vh;
      display: flex; flex-direction: column; overflow: hidden;
      border-radius: 26px;
      background: linear-gradient(180deg, rgba(22,26,40,.98), rgba(11,14,26,.98));
      border: .5px solid rgba(255,255,255,.14);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.1), 0 32px 80px rgba(0,0,0,.7);
      animation: dgAncCardIn .34s cubic-bezier(.34,1.56,.64,1) both;
      position: relative;
    }
    .dg-anc-card::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
      background: linear-gradient(90deg, transparent, #E5C37E, transparent); opacity: .9;
    }
    .dg-anc-header {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 15px 14px 13px 17px; border-bottom: .5px solid rgba(255,255,255,.07);
    }
    .dg-anc-brand { display: flex; align-items: center; gap: 11px; min-width: 0; }
    .dg-anc-brand img {
      width: 38px; height: 38px; border-radius: 11px; object-fit: cover; flex: 0 0 auto;
      box-shadow: 0 0 0 .5px rgba(255,255,255,.12), 0 4px 14px rgba(212,166,80,.3);
    }
    .dg-anc-brand-text { display: flex; flex-direction: column; min-width: 0; }
    .dg-anc-eyebrow {
      font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
      color: #E5C37E; line-height: 1.2;
    }
    .dg-anc-brand-name { font-size: 16px; font-weight: 750; color: #f3f6fc; line-height: 1.2; letter-spacing: -.01em; }
    .dg-anc-close {
      flex: 0 0 auto; background: rgba(255,255,255,.05); border: none; color: rgba(200,210,230,.6);
      width: 30px; height: 30px; border-radius: 9px; font-size: 19px; line-height: 1; cursor: pointer;
      transition: background .15s, color .15s; -webkit-tap-highlight-color: transparent;
    }
    .dg-anc-close:hover { background: rgba(255,255,255,.1); color: #fff; }

    .dg-anc-body { padding: 20px 20px 6px; flex: 1; display: flex; flex-direction: column; overflow-y: auto; -webkit-overflow-scrolling: touch; }
    .dg-anc-visual { display: flex; align-items: center; justify-content: center; }
    .dg-anc-title { margin: 16px 0 0; font-size: 22px; line-height: 1.2; font-weight: 750; letter-spacing: -.02em; color: #f3f6fc; text-align: center; }
    .dg-anc-text { margin: 9px 0 0; font-size: 14px; line-height: 1.55; color: rgba(206,215,233,.74); text-align: center; }

    .dg-anc-footer { padding: 6px 20px 20px; }
    .dg-anc-progress { display: flex; justify-content: center; gap: 6px; padding: 14px 0 14px; }
    .dg-anc-dot { height: 6px; width: 6px; border-radius: 999px; background: rgba(255,255,255,.18); transition: background .2s, width .25s cubic-bezier(.34,1.56,.64,1); }
    .dg-anc-dot.dg-on { background: #E5C37E; width: 20px; }
    .dg-anc-nav { display: flex; gap: 8px; }
    .dg-anc-btn {
      padding: 12px 16px; border-radius: 14px; font-size: 14px; font-weight: 650; cursor: pointer; border: none;
      transition: opacity .15s, transform .12s, filter .15s; -webkit-tap-highlight-color: transparent;
    }
    .dg-anc-btn:active { transform: scale(.97); opacity: .9; }
    .dg-anc-prev { flex: 0 0 auto; background: rgba(255,255,255,.07); color: rgba(206,215,233,.7); display: inline-flex; align-items: center; justify-content: center; }
    .dg-anc-prev[data-hidden="1"] { visibility: hidden; }
    .dg-anc-next {
      flex: 1; color: #1b1303; font-weight: 750;
      background: linear-gradient(135deg, #E5C37E, #D4A650);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.32), 0 6px 18px rgba(212,166,80,.34);
    }
    .dg-anc-next:hover { filter: brightness(1.06); }

    /* visuals */
    .dg-anc-brandhero {
      margin-top: 6px; display: flex; flex-direction: column; align-items: center; gap: 14px;
      padding: 18px 10px 4px;
    }
    .dg-anc-brandhero img {
      width: 84px; height: 84px; border-radius: 22px; object-fit: cover;
      box-shadow: 0 0 0 .5px rgba(255,255,255,.14), 0 12px 34px rgba(212,166,80,.4);
    }
    .dg-anc-gamegrid { margin-top: 16px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; width: 100%; }
    .dg-anc-tile {
      display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 11px 6px;
      border-radius: 13px; background: rgba(255,255,255,.04); border: .5px solid rgba(255,255,255,.1);
    }
    .dg-anc-tile img { width: 34px; height: 34px; border-radius: 9px; object-fit: cover; }
    .dg-anc-tile span { font-size: 10.5px; font-weight: 600; color: rgba(248,250,252,.82); }
    .dg-anc-streak { margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; }
    .dg-anc-stat { padding: 13px; border-radius: 14px; }
    .dg-anc-stat .k { font-size: 11px; color: rgba(255,255,255,.66); }
    .dg-anc-stat .v { font-size: 24px; font-weight: 750; line-height: 1.1; margin-top: 2px; }
    .dg-anc-stat.cur { background: rgba(249,115,22,.11); border: .5px solid rgba(249,115,22,.3); }
    .dg-anc-stat.cur .v { color: #fb923c; }
    .dg-anc-stat.best { background: rgba(240,198,116,.11); border: .5px solid rgba(240,198,116,.3); }
    .dg-anc-stat.best .v { color: #f0c674; }
    .dg-anc-tabs { margin-top: 16px; width: 100%; display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
    .dg-anc-tab { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 9px 2px; border-radius: 11px; background: rgba(255,255,255,.05); color: rgba(248,250,252,.85); }
    .dg-anc-tab span.ic { width: 15px; height: 15px; display: inline-flex; }
    .dg-anc-tab span.lb { font-size: 10px; }

    .dg-anc-step-enter { animation: dgAncStepIn .24s cubic-bezier(.22,.61,.36,1); }

    @media (prefers-reduced-motion: reduce) {
      .dg-anc-overlay, .dg-anc-card, .dg-anc-step-enter { animation: none; }
      .dg-anc-dot { transition: none; }
    }
  `;
  document.head.appendChild(style);
}

function isStandalonePWA() {
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true
  );
}

function isSeen(id) {
  try { return localStorage.getItem(`${STORAGE_PREFIX}${id}`) === '1'; } catch { return false; }
}

function markSeen(id) {
  try { localStorage.setItem(`${STORAGE_PREFIX}${id}`, '1'); } catch {}
}

function getAndRecordLaunchCount() {
  try {
    if (!sessionStorage.getItem(LAUNCH_COUNT_SESSION_KEY)) {
      const current = Number(localStorage.getItem(LAUNCH_COUNT_KEY) || '0');
      const next = Number.isFinite(current) ? current + 1 : 1;
      localStorage.setItem(LAUNCH_COUNT_KEY, String(next));
      sessionStorage.setItem(LAUNCH_COUNT_SESSION_KEY, '1');
      return next;
    }
    const existing = Number(localStorage.getItem(LAUNCH_COUNT_KEY) || '1');
    return Number.isFinite(existing) && existing > 0 ? existing : 1;
  } catch {
    return 1;
  }
}

function isActiveNow(item, nowMs) {
  return (!item.startsAt || Date.parse(item.startsAt) <= nowMs) && (!item.endsAt || Date.parse(item.endsAt) >= nowMs);
}

function pickCampaign(context = {}) {
  const nowMs = Date.now();
  const launchCount = getAndRecordLaunchCount();

  const candidates = ANNOUNCEMENT_CAMPAIGNS
    .filter((item) => item && item.id && Array.isArray(item.steps) && item.steps.length)
    .filter((item) => isActiveNow(item, nowMs))
    .filter((item) => !item.pwaOnly || isStandalonePWA())
    .filter((item) => !Number.isFinite(item.minLaunchCount) || launchCount >= item.minLaunchCount)
    .filter((item) => !Number.isFinite(item.maxLaunchCount) || launchCount <= item.maxLaunchCount)
    .filter((item) => !Array.isArray(item.gameIds) || !item.gameIds.length || item.gameIds.includes(context.gameId))
    .filter((item) => !isSeen(item.id));

  candidates.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  return candidates[0] || null;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function renderGameGrid() {
  const tiles = GAME_META.map((g) => `
    <div class="dg-anc-tile">
      <img src="${escapeHtml(g.logo)}" alt="" aria-hidden="true" loading="lazy"/>
      <span>${escapeHtml(g.name)}</span>
    </div>`).join('');
  return `<div class="dg-anc-gamegrid">${tiles}</div>`;
}

function renderVisual(visual) {
  if (visual === 'brand') {
    return `<div class="dg-anc-brandhero"><img src="${BRAND_LOGO}" alt="Daily Grid" /></div>`;
  }
  if (visual === 'gameGrid') {
    return renderGameGrid();
  }
  if (visual === 'tabs') {
    return `
      <div class="dg-anc-tabs">
        ${[['daily', 'Daily'], ['practice', 'Practice'], ['medals', 'Medals'], ['profile', 'Profile']]
          .map(([k, label]) => `<div class="dg-anc-tab"><span class="ic">${TAB_ICONS[k]}</span><span class="lb">${label}</span></div>`)
          .join('')}
      </div>`;
  }
  if (visual === 'streak') {
    return `
      <div class="dg-anc-streak">
        <div class="dg-anc-stat cur"><div class="k">Current streak</div><div class="v">7d</div></div>
        <div class="dg-anc-stat best"><div class="k">Best streak</div><div class="v">14d</div></div>
      </div>
      <div class="dg-anc-tabs" style="margin-top:10px;">
        ${[['daily', 'Daily'], ['practice', 'Practice'], ['medals', 'Medals'], ['profile', 'Profile']]
          .map(([k, label]) => `<div class="dg-anc-tab"><span class="ic">${TAB_ICONS[k]}</span><span class="lb">${label}</span></div>`)
          .join('')}
      </div>`;
  }
  return '';
}

export function maybeShowAnnouncementModal(context = {}) {
  const campaign = pickCampaign(context);
  if (!campaign) return;
  ensureStyles();

  let stepIndex = 0;
  const steps = campaign.steps;
  let touchStartX = null;

  const overlay = document.createElement('div');
  overlay.id = 'dg-announcement-modal';
  overlay.className = 'dg-anc-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const card = document.createElement('div');
  card.className = 'dg-anc-card';

  card.innerHTML = `
    <div class="dg-anc-header">
      <div class="dg-anc-brand">
        <img src="${BRAND_LOGO}" alt="" aria-hidden="true"/>
        <div class="dg-anc-brand-text">
          <span class="dg-anc-eyebrow">${escapeHtml(campaign.title || 'Daily Grid')}</span>
          <span class="dg-anc-brand-name">Daily Grid</span>
        </div>
      </div>
      <button id="dg-anc-close" class="dg-anc-close" aria-label="Dismiss">&times;</button>
    </div>

    <div id="dg-anc-step" class="dg-anc-body">
      <div id="dg-anc-visual" class="dg-anc-visual"></div>
      <h3 id="dg-anc-title" class="dg-anc-title"></h3>
      <p id="dg-anc-text" class="dg-anc-text"></p>
    </div>

    <div class="dg-anc-footer">
      <div id="dg-anc-progress" class="dg-anc-progress"></div>
      <div class="dg-anc-nav">
        <button id="dg-anc-prev" class="dg-anc-btn dg-anc-prev" aria-label="Back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <button id="dg-anc-next" class="dg-anc-btn dg-anc-next">Next</button>
      </div>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const stepWrap = card.querySelector('#dg-anc-step');
  const titleEl = card.querySelector('#dg-anc-title');
  const bodyEl = card.querySelector('#dg-anc-text');
  const visualEl = card.querySelector('#dg-anc-visual');
  const progressEl = card.querySelector('#dg-anc-progress');
  const prevBtn = card.querySelector('#dg-anc-prev');
  const nextBtn = card.querySelector('#dg-anc-next');

  const close = () => {
    markSeen(campaign.id);
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };

  const goNext = () => {
    if (stepIndex < steps.length - 1) { stepIndex += 1; render(); }
    else close();
  };

  const goPrev = () => {
    if (stepIndex > 0) { stepIndex -= 1; render(); }
  };

  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') goNext();
    else if (e.key === 'ArrowLeft') goPrev();
  };

  const render = () => {
    const step = steps[stepIndex];
    if (!step) return;

    stepWrap.classList.remove('dg-anc-step-enter');
    void stepWrap.offsetWidth;
    stepWrap.classList.add('dg-anc-step-enter');

    titleEl.textContent = step.title || '';
    bodyEl.textContent = step.body || '';
    visualEl.innerHTML = renderVisual(step.visual);

    progressEl.innerHTML = steps
      .map((_, i) => `<span class="dg-anc-dot${i === stepIndex ? ' dg-on' : ''}"></span>`)
      .join('');

    prevBtn.dataset.hidden = stepIndex === 0 ? '1' : '0';
    nextBtn.textContent = stepIndex === steps.length - 1 ? 'Start playing' : 'Next';
  };

  prevBtn?.addEventListener('click', goPrev);
  nextBtn?.addEventListener('click', goNext);
  card.querySelector('#dg-anc-close')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);

  card.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches?.[0]?.clientX ?? null;
  }, { passive: true });

  card.addEventListener('touchend', (e) => {
    const endX = e.changedTouches?.[0]?.clientX;
    if (touchStartX == null || endX == null) return;
    const delta = endX - touchStartX;
    if (Math.abs(delta) < 42) return;
    if (delta < 0) goNext();
    else goPrev();
  }, { passive: true });

  render();
}
