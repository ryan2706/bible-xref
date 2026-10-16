import './style.css';
import { startRouter } from './router.js';
import { initThemeToggle } from './theme.js';
import { initSearch } from './search.js';
import { renderVerse } from './views/verse.js';
import { renderArcs } from './views/arcs.js';
import { renderBooks } from './views/books.js';
import { renderAbout } from './views/about.js';
import { renderNotFound } from './views/placeholders.js';

const app = document.getElementById('app');
const navLinks = document.querySelectorAll('.site-nav a');
const views = { verse: renderVerse, arcs: renderArcs, books: renderBooks, about: renderAbout, 'not-found': renderNotFound };
let firstRoute = true;
let routeCount = 0;

initThemeToggle(document.querySelector('.theme-toggle'), document.querySelector('.theme-status'));
initSearch(document.querySelector('.site-search'));

startRouter(async ({ view, params }) => {
  const route = ++routeCount;
  const first = firstRoute;
  firstRoute = false;
  // Where the navigation left focus: the link or button used, or the page itself.
  const from = document.activeElement;
  for (const link of navLinks) {
    if (link.dataset.view === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  await views[view](app, params);
  // After in-app navigation, move focus to the new view's heading for screen readers,
  // unless the user has since navigated again or moved focus while the view loaded.
  const now = document.activeElement;
  const untouched = now === from || now === document.body || now === null;
  if (!first && route === routeCount && untouched) app.querySelector('h1')?.focus();
});
