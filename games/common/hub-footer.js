/**
 * Shared site footer for hub pages (desktop web).
 * Matches the marketing home footer — hidden on mobile where the tab bar is primary nav.
 */

export function mountHubFooter() {
  if (document.getElementById('dg-hub-footer')) return;

  const footer = document.createElement('footer');
  footer.id = 'dg-hub-footer';
  footer.className = 'hub-site-footer';
  footer.innerHTML = `
    <img src="/Images/web%20icon.png" alt="" class="hub-site-footer__logo" width="48" height="48" decoding="async">
    <p class="hub-site-footer__copy">&copy; 2026 Zachary Zimmerman. All rights reserved.</p>
    <nav class="hub-site-footer__links" aria-label="Site links">
      <a href="/games/">Play Games</a>
      <a href="/privacy/">Privacy Policy</a>
      <a href="/terms/">Terms of Service</a>
      <a href="/support/">Support</a>
    </nav>
    <a href="https://www.instagram.com/dailygrid.games" target="_blank" rel="noopener noreferrer" class="hub-site-footer__social" aria-label="Daily Grid on Instagram">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.75 2h8.5A5.75 5.75 0 0122 7.75v8.5A5.75 5.75 0 0116.25 22h-8.5A5.75 5.75 0 012 16.25v-8.5A5.75 5.75 0 017.75 2zm0 1.5A4.25 4.25 0 003.5 7.75v8.5A4.25 4.25 0 007.75 20.5h8.5a4.25 4.25 0 004.25-4.25v-8.5A4.25 4.25 0 0016.25 3.5h-8.5zm9.38 1.06a1.12 1.12 0 110 2.24 1.12 1.12 0 010-2.24zM12 7a5 5 0 110 10 5 5 0 010-10zm0 1.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z"/></svg>
      @dailygrid.games
    </a>
  `.trim();

  const tabBar = document.getElementById('dg-tab-bar');
  if (tabBar) tabBar.before(footer);
  else document.body.appendChild(footer);
}
