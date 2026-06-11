/**
 * Desktop top navigation for games hub and in-game pages.
 * Hub pages include #dg-hub-nav in HTML for instant first paint; JS syncs active tab.
 * Mobile continues to use the bottom tab bar.
 *
 * Hub tab keys: 'daily' | 'practice' | 'medals' | 'profile'
 */

const HUB_LINKS = [
  { key: 'daily', label: 'Daily', href: '/games/' },
  { key: 'practice', label: 'Practice', href: '/games/practice/' },
  { key: 'medals', label: 'Medals', href: '/games/medals/' },
  { key: 'profile', label: 'Profile', href: '/games/profile/' },
];

const HUB_BRAND_HTML = `
  <a href="/" class="dg-hub-nav__brand">
    <img src="/Images/web%20icon.png" alt="" class="dg-hub-nav__logo" width="40" height="40" decoding="async">
    <span class="dg-hub-nav__title">Daily Grid</span>
  </a>`;

/** @type {Set<string>} */
const prefetched = new Set();

function ensureSkipLink() {
  if (document.getElementById('dg-skip-link') || !document.getElementById('main-content')) return;
  const skip = document.createElement('a');
  skip.id = 'dg-skip-link';
  skip.className = 'dg-skip-link';
  skip.href = '#main-content';
  skip.textContent = 'Skip to main content';
  document.body.insertBefore(skip, document.body.firstChild);
}

function applyBodyState({ siteFonts = false } = {}) {
  document.body.classList.add('dg-hub-nav-page');
  if (siteFonts) {
    document.body.classList.add('dg-hub-site-fonts');
  }
  ensureSkipLink();
}

/**
 * @param {HTMLElement} nav
 * @param {string|null} activeKey
 */
function syncActiveLinks(nav, activeKey) {
  nav.querySelectorAll('.dg-hub-nav__links a[data-hub-key]').forEach((link) => {
    const isActive = link.dataset.hubKey === activeKey;
    link.classList.toggle('is-active', isActive);
    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

function buildLinksHtml(activeKey) {
  return HUB_LINKS.map(({ key, label, href }) => {
    const isActive = key === activeKey;
    const activeClass = isActive ? ' class="is-active"' : '';
    const current = isActive ? ' aria-current="page"' : '';
    return `<a href="${href}" data-hub-key="${key}"${activeClass}${current}>${label}</a>`;
  }).join('');
}

/**
 * @param {string|null} activeKey
 * @param {string} brandHtml
 */
function createNav(activeKey, brandHtml) {
  const nav = document.createElement('nav');
  nav.id = 'dg-hub-nav';
  nav.className = 'dg-hub-nav';
  nav.setAttribute('aria-label', 'Games hub');
  nav.innerHTML = `
    ${brandHtml}
    <div class="dg-hub-nav__links">${buildLinksHtml(activeKey)}</div>`;
  document.body.insertBefore(nav, document.body.firstChild);
  return nav;
}

function normalizePath(pathname) {
  if (pathname.endsWith('/index.html')) {
    return pathname.replace(/index\.html$/, '');
  }
  return pathname.endsWith('/') ? pathname : `${pathname}/`;
}

function prefetchHubRoute(href) {
  const path = normalizePath(new URL(href, window.location.origin).pathname);
  if (prefetched.has(path)) return;
  if (path === normalizePath(window.location.pathname)) return;
  prefetched.add(path);

  if (typeof navigator !== 'undefined' && navigator.connection?.saveData) return;

  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.as = 'document';
  link.href = href;
  document.head.appendChild(link);
}

function prefetchAllHubRoutes() {
  HUB_LINKS.forEach(({ href }) => prefetchHubRoute(href));
}

function wireHubNavPrefetch(nav) {
  nav.querySelectorAll('.dg-hub-nav__links a[href]').forEach((anchor) => {
    anchor.addEventListener('mouseenter', () => prefetchHubRoute(anchor.href), { passive: true });
    anchor.addEventListener('focus', () => prefetchHubRoute(anchor.href), { passive: true });
    anchor.addEventListener('touchstart', () => prefetchHubRoute(anchor.href), { passive: true });
  });
}

/**
 * @param {string|null} activeKey
 * @param {string} brandHtml
 * @param {{ siteFonts?: boolean }} opts
 */
function initNav(activeKey, brandHtml, { siteFonts = false } = {}) {
  applyBodyState({ siteFonts });

  let nav = document.getElementById('dg-hub-nav');
  if (nav) {
    syncActiveLinks(nav, activeKey);
  } else {
    nav = createNav(activeKey, brandHtml);
  }

  wireHubNavPrefetch(nav);

  if (document.readyState === 'complete') {
    prefetchAllHubRoutes();
  } else {
    window.addEventListener('load', prefetchAllHubRoutes, { once: true });
  }
}

/**
 * @param {string} activeKey
 */
export function mountHubNav(activeKey) {
  initNav(activeKey, HUB_BRAND_HTML, { siteFonts: true });
}

/**
 * Desktop nav for individual game pages (game brand + hub links).
 *
 * @param {{ name: string, logo: string, href: string }} opts
 */
export function mountGameNav({ name, logo, href }) {
  initNav(null, `
    <a href="${href}" class="dg-hub-nav__brand">
      <img src="${logo}" alt="" class="dg-hub-nav__logo dg-hub-nav__logo--game" width="40" height="40" decoding="async">
      <span class="dg-hub-nav__title">${name}</span>
    </a>`, { siteFonts: true });
}

/**
 * Static hub nav markup for inlining in hub page HTML (instant first paint).
 * @param {string} activeKey
 */
export function hubNavStaticHtml(activeKey) {
  const links = HUB_LINKS.map(({ key, label, href }) => {
    const activeClass = key === activeKey ? ' class="is-active"' : '';
    const current = key === activeKey ? ' aria-current="page"' : '';
    return `<a href="${href}" data-hub-key="${key}"${activeClass}${current}>${label}</a>`;
  }).join('\n      ');

  return `<nav id="dg-hub-nav" class="dg-hub-nav" aria-label="Games hub">
    ${HUB_BRAND_HTML.trim()}
    <div class="dg-hub-nav__links">
      ${links}
    </div>
  </nav>`;
}
