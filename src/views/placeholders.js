import { h } from '../dom.js';
import { viewHeader } from '../view-header.js';

// Fallback for links that match no route.
export function renderNotFound(container) {
  const { header } = viewHeader('Page not found', [
    'This link doesn’t match any view. ',
    h('a', { href: '#/verse/John.3.16' }, 'Go to John 3:16'),
    '.',
  ]);
  container.replaceChildren(header);
  document.title = 'Page not found · Bible Cross-Reference Explorer';
}
