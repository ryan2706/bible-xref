import { h } from '../dom.js';

// Fallback for links that match no route.
export function renderNotFound(container) {
  container.replaceChildren(
    h('h1', { class: 'view-title', tabindex: '-1' }, 'Page not found'),
    h('p', {}, 'This link doesn’t match any view. ', h('a', { href: '#/verse/John.3.16' }, 'Go to John 3:16'), '.'),
  );
  document.title = 'Page not found · Bible Cross-Reference Explorer';
}
