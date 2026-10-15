import { h } from '../dom.js';
import { loadBooks, loadVerses, parseRef, formatRef } from '../data.js';

export async function renderVerse(container, [ref]) {
  const title = h('h1', { class: 'view-title', tabindex: '-1' }, ref.replaceAll('.', ' '));
  const reading = h('div', { class: 'reading-column' }, h('p', { class: 'status' }, 'Loading verse…'));
  const margin = h(
    'aside',
    { class: 'margin-column', 'aria-label': 'Cross-references' },
    h('h2', {}, 'Cross-references'),
    h('p', { class: 'status' }, 'References for this verse will be listed here.'),
  );
  container.replaceChildren(title, h('div', { class: 'verse-layout' }, reading, margin));

  try {
    const books = await loadBooks();
    if (!title.isConnected) return; // the user navigated away while loading
    const verse = parseRef(ref, books);
    if (!verse) {
      title.textContent = 'Verse not found';
      reading.replaceChildren(
        h('p', {}, `No verse matches “${ref}”. Use a reference like `, h('a', { href: '#/verse/John.3.16' }, 'John.3.16'), '.'),
      );
      margin.remove();
      return;
    }
    title.textContent = formatRef(verse);
    document.title = `${formatRef(verse)} · Bible Cross-Reference Explorer`;
    const { firstId, text } = await loadVerses(verse.book.abbr);
    if (!title.isConnected) return;
    reading.replaceChildren(h('p', { class: 'verse-text is-selected' }, text[verse.id - firstId]));
  } catch {
    if (!title.isConnected) return;
    reading.replaceChildren(h('p', {}, 'Couldn’t load the verse data. Check your connection and reload the page.'));
  }
}
