// Synchronous (non-module) desktop redirect guard.
// Load with a plain <script src="..."> before any content so the redirect
// fires before the mobile-only page renders on desktop viewports.
if (window.matchMedia('(min-width: 768px)').matches) {
  window.location.replace('/games/');
}
