import { h } from '../dom.js';

// Placeholder views for the diagrams, replaced as each one is built.
export function renderArcs(container) {
  container.replaceChildren(
    h('h1', { class: 'view-title', tabindex: '-1' }, 'Chapter arcs'),
    h('p', { class: 'view-intro' }, 'Every chapter from Genesis to Revelation in one line, with an arc for each pair of chapters that cross-reference each other.'),
    h('div', { class: 'placeholder' }, 'The arc diagram isn’t built yet.'),
  );
  document.title = 'Chapter arcs · Bible Cross-Reference Explorer';
}

export function renderBooks(container) {
  container.replaceChildren(
    h('h1', { class: 'view-title', tabindex: '-1' }, 'Book links'),
    h('p', { class: 'view-intro' }, 'How strongly each book of the Bible points to every other book.'),
    h('div', { class: 'placeholder' }, 'The book diagram isn’t built yet.'),
  );
  document.title = 'Book links · Bible Cross-Reference Explorer';
}

export function renderAbout(container) {
  container.replaceChildren(
    h('h1', { class: 'view-title', tabindex: '-1' }, 'About'),
    h('p', { class: 'view-intro' }, 'What this site shows, where the cross-references come from, and how to read the diagrams.'),
    h('div', { class: 'placeholder' }, 'The About page isn’t written yet.'),
  );
  document.title = 'About · Bible Cross-Reference Explorer';
}

export function renderNotFound(container) {
  container.replaceChildren(
    h('h1', { class: 'view-title', tabindex: '-1' }, 'Page not found'),
    h('p', {}, 'This link doesn’t match any view. ', h('a', { href: '#/verse/John.3.16' }, 'Go to John 3:16'), '.'),
  );
  document.title = 'Page not found · Bible Cross-Reference Explorer';
}
