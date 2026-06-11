/**
 * Desktop top navigation for games hub and in-game pages.
 * Mobile continues to use the bottom tab bar / back button.
 *
 * Hub tab keys: 'daily' | 'practice' | 'medals' | 'profile'
 */

const HUB_LINKS = [
  { key: 'daily', label: 'Daily', href: '/games/' },
  { key: 'practice', label: 'Practice', href: '/games/practice/' },
  { key: 'medals', label: 'Medals', href: '/games/medals/' },
  { key: 'profile', label: 'Profile', href: '/games/profile/' },
];

/**
 * @param {string} activeKey
 * @param {string} brandHtml
 */
function mountNav(activeKey, brandHtml, useSiteFonts = false) {
  if (document.getElementById('dg-hub-nav')) return;

  document.body.classList.add('dg-hub-nav-page');
  if (useSiteFonts) {
    document.body.classList.add('dg-hub-site-fonts');
  }

  const nav = document.createElement('nav');
  nav.id = 'dg-hub-nav';
  nav.className = 'dg-hub-nav';
  nav.setAttribute('aria-label', 'Games hub');

  const linksHtml = HUB_LINKS.map(({ key, label, href }) => {
    const activeClass = key === activeKey ? 'is-active' : '';
    const current = key === activeKey ? ' aria-current="page"' : '';
    return `<a href="${href}" class="${activeClass}"${current}>${label}</a>`;
  }).join('');

  nav.innerHTML = `
    ${brandHtml}
    <div class="dg-hub-nav__links">${linksHtml}</div>`;

  document.body.insertBefore(nav, document.body.firstChild);
}

/**
 * @param {string} activeKey
 */
export function mountHubNav(activeKey) {
  mountNav(activeKey, `
    <a href="/" class="dg-hub-nav__brand">
      <img src="/Images/web%20icon.png" alt="" class="dg-hub-nav__logo">
      <span class="dg-hub-nav__title">Daily Grid</span>
    </a>`, activeKey === 'daily');
}

/**
 * Desktop nav for individual game pages (game brand + hub links).
 *
 * @param {{ name: string, logo: string, href: string }} opts
 */
export function mountGameNav({ name, logo, href }) {
  mountNav(null, `
    <a href="${href}" class="dg-hub-nav__brand">
      <img src="${logo}" alt="" class="dg-hub-nav__logo dg-hub-nav__logo--game">
      <span class="dg-hub-nav__title">${name}</span>
    </a>`, true);
}
