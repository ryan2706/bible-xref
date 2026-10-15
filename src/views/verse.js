import { h } from '../dom.js';
import { loadBooks, loadVerses, loadXrefs } from '../data.js';
import { getIndex } from '../refs.js';
import { attachPreview } from '../preview.js';
import { renderGraph } from './verse-graph.js';

const TOP = 10;

export async function renderVerse(container, [ref]) {
  const title = h('h1', { class: 'view-title', tabindex: '-1' }, ref.replaceAll('.', ' '));
  const reading = h('div', { class: 'reading-column' }, h('p', { class: 'status' }, 'Loading verse…'));
  const margin = h(
    'aside',
    { class: 'margin-column', 'aria-label': 'Cross-references', 'aria-busy': 'true' },
    h('p', { class: 'status' }, 'Loading cross-references…'),
  );
  const graph = h('section', { class: 'graph-section', 'aria-labelledby': 'graph-title' });
  container.replaceChildren(title, h('div', { class: 'verse-layout' }, reading, margin, graph));

  try {
    const books = await loadBooks();
    if (!title.isConnected) return; // the user navigated away while loading
    const index = getIndex(books);
    const id = index.parseOsis(ref);
    if (id === null) {
      title.textContent = 'Verse not found';
      reading.replaceChildren(
        h('p', {}, `No verse matches “${ref}”. Use a reference like `, h('a', { href: '#/verse/John.3.16' }, 'John.3.16'), '.'),
      );
      margin.remove();
      graph.remove();
      return;
    }
    const verse = { ...index.locate(id), id };
    const name = index.label(id);
    title.textContent = name;
    document.title = `${name} · Bible Cross-Reference Explorer`;
    graph.replaceChildren(h('h2', { id: 'graph-title' }, 'Connections'), h('p', { class: 'status' }, 'Loading connections…'));

    // Verse text and cross-references load in parallel; each fills in when ready.
    const textLoad = loadVerses(verse.book.abbr).then(({ firstId, text }) => {
      if (!title.isConnected) return;
      reading.replaceChildren(h('p', { class: 'verse-text is-selected' }, text[verse.id - firstId]));
    });
    const xrefLoad = loadXrefs(verse.book.abbr).then((xrefs) => {
      if (!title.isConnected) return;
      const { out, in: incoming } = xrefs.verses[verse.id - xrefs.firstId];
      renderMargin(margin, out, incoming, index);
      return renderGraphSection(graph, verse.id, out, incoming, index);
    });
    await Promise.all([textLoad, xrefLoad]);
  } catch {
    if (!title.isConnected) return;
    reading.replaceChildren(h('p', {}, 'Couldn’t load the verse data. Check your connection and reload the page.'));
    margin.remove();
    graph.remove();
  }
}

function renderMargin(margin, out, incoming, index) {
  margin.removeAttribute('aria-busy');
  margin.replaceChildren(
    refGroup('refs-out', 'References', out, (l) => [l[1], l[2]], 'This verse doesn’t reference any others.', index),
    refGroup('refs-in', 'Referenced by', incoming, (l) => [l[0], l[0]], 'No verses reference this one.', index),
  );
}

// One list of references, top 10 first, with a toggle to show the rest.
function refGroup(id, heading, links, target, emptyText, index) {
  const section = h('section', { class: 'ref-group', 'aria-labelledby': `${id}-title` });
  section.append(
    h('h2', { id: `${id}-title` }, heading, h('span', { class: 'ref-count' }, ` ${links.length}`)),
  );
  if (!links.length) {
    section.append(h('p', { class: 'status' }, emptyText));
    return section;
  }
  section.append(h('p', { class: 'ref-note' }, 'Sorted by votes'));
  const list = h('ol', { class: 'ref-list', id: `${id}-list` });
  const items = links.map((link) => {
    const [start, end] = target(link);
    const votes = link[3];
    const name = index.rangeLabel(start, end);
    const a = h('a', { href: `#/verse/${index.osis(start)}`, class: 'ref-link' }, name);
    attachPreview(a, index, start, name);
    return h(
      'li',
      { class: votes === 0 ? 'is-faint' : '' },
      a,
      h('span', { class: 'votes' }, String(votes), h('span', { class: 'visually-hidden' }, votes === 1 ? ' vote' : ' votes')),
    );
  });
  list.append(...items.slice(0, TOP));
  section.append(list);

  if (links.length > TOP) {
    const toggle = h('button', { type: 'button', class: 'show-all', 'aria-expanded': 'false', 'aria-controls': list.id }, `Show all ${links.length}`);
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      list.replaceChildren(...(expanded ? items.slice(0, TOP) : items));
      toggle.setAttribute('aria-expanded', String(!expanded));
      toggle.textContent = expanded ? `Show all ${links.length}` : `Show top ${TOP}`;
    });
    section.append(toggle);
  }
  return section;
}

async function renderGraphSection(section, centerId, out, incoming, index) {
  const holder = h('div', { class: 'graph-holder' });
  section.replaceChildren(
    h('h2', { id: 'graph-title' }, 'Connections'),
    h(
      'p',
      { class: 'graph-note' },
      'The 15 strongest links by votes. Arrows point from the citing verse to the verse it cites; thicker lines have more votes.',
    ),
    holder,
  );
  // Labels are measured for the layout, so wait for the web fonts first.
  await document.fonts.ready;
  if (!holder.isConnected) return;
  const draw = () => renderGraph(holder, { centerId, out, incoming, index });
  if (!draw()) {
    holder.replaceWith(h('p', { class: 'status' }, 'This verse has no cross-references to draw.'));
    section.querySelector('.graph-note').remove();
    return;
  }
  // Redraw when the column width changes noticeably (rotation, window resize).
  let drawnWidth = holder.clientWidth;
  let timer;
  const observer = new ResizeObserver(() => {
    if (!holder.isConnected) return observer.disconnect();
    if (Math.abs(holder.clientWidth - drawnWidth) < 24) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      drawnWidth = holder.clientWidth;
      draw();
    }, 150);
  });
  observer.observe(holder);
  section.append(
    h(
      'ul',
      { class: 'legend', 'aria-label': 'Legend' },
      h('li', {}, h('span', { class: 'swatch ot' }), 'Old Testament'),
      h('li', {}, h('span', { class: 'swatch nt' }), 'New Testament'),
      h('li', {}, h('span', { class: 'swatch current' }), 'This verse'),
    ),
  );
}
