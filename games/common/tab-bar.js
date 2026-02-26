/**
 * Liquid Glass Tab Bar
 *
 * Renders the fixed bottom navigation bar on hub pages (Daily, Practice, Medals, Profile).
 * Mount by calling mountTabBar() once per page. Pass the tab key for this page.
 *
 * Tab keys: 'daily' | 'practice' | 'medals' | 'profile'
 */

const TABS = [
  {
    key: 'daily',
    label: 'Daily',
    href: '/games/',
    icon: `<svg class="dg-tab-bar__icon" viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/>
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/>
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/>
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>
    </svg>`,
  },
  {
    key: 'practice',
    label: 'Practice',
    href: '/games/practice/',
    icon: `<svg class="dg-tab-bar__icon" viewBox="0 0 24 24" fill="currentColor">
      <rect x="2" y="7" width="3.5" height="10" rx="1.75"/>
      <rect x="5.5" y="10" width="1.5" height="4" rx="0.75"/>
      <rect x="7" y="11" width="10" height="2" rx="1"/>
      <rect x="17" y="10" width="1.5" height="4" rx="0.75"/>
      <rect x="18.5" y="7" width="3.5" height="10" rx="1.75"/>
    </svg>`,
  },
  {
    key: 'medals',
    label: 'Medals',
    href: '/games/medals/',
    icon: `<svg class="dg-tab-bar__icon" viewBox="0 0 24 24" fill="currentColor">
      <rect x="10.5" y="2" width="3" height="4.5" rx="0.75"/>
      <circle cx="12" cy="15" r="7"/>
    </svg>`,
  },
  {
    key: 'profile',
    label: 'Profile',
    href: '/games/profile/',
    icon: `<svg class="dg-tab-bar__icon" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="7.5" r="3.5"/>
      <path d="M4 21c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5z"/>
    </svg>`,
  },
];

/**
 * Mount the liquid glass tab bar.
 * @param {string} activeKey - Which tab is currently active
 * @param {Object} [opts]
 * @param {number} [opts.profileMedalCount] - Number to show as badge on medals tab
 */
export function mountTabBar(activeKey, opts = {}) {
  // Always apply page padding (CSS media query removes it on desktop)
  document.documentElement.classList.add('dg-tab-bar-active');
  const main = document.querySelector('main, .tab-page-content, #page-content');
  (main || document.body).classList.add('dg-tab-bar-page-padding');

  function buildListHTML() {
    return TABS.map(({ key, label, href, icon }) => {
      const isActive = key === activeKey;
      const badge = (key === 'medals' && opts.profileMedalCount)
        ? `<span class="dg-tab-bar__badge">${opts.profileMedalCount}</span>`
        : '';
      return `<li class="dg-tab-bar__tab${isActive ? ' active' : ''}" data-tab="${key}">
        <a href="${href}" aria-label="${label}"${isActive ? ' aria-current="page"' : ''}>
          ${badge}${icon}
          <span class="dg-tab-bar__label">${label}</span>
        </a>
      </li>`;
    }).join('');
  }

  const existing = document.getElementById('dg-tab-bar');
  if (existing) {
    // Always replace the list so icons stay in sync with tab-bar.js,
    // even when the bar was pre-rendered as static HTML in the page.
    const list = existing.querySelector('.dg-tab-bar__list');
    if (list) list.innerHTML = buildListHTML();
    return;
  }

  const bar = document.createElement('nav');
  bar.id = 'dg-tab-bar';
  bar.className = 'dg-tab-bar';
  bar.setAttribute('aria-label', 'Main navigation');
  bar.innerHTML = `<ul class="dg-tab-bar__list">${buildListHTML()}</ul>`;
  document.body.appendChild(bar);
}
