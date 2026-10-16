import { h } from '../dom.js';
import { loadBooks, loadVerses, loadXrefs } from '../data.js';
import { getIndex } from '../refs.js';
import { attachPreview } from '../preview.js';
import { renderGraph } from './verse-graph.js';
import { votesEl, votesHelp } from '../votes.js';
import { viewHeader } from '../view-header.js';
import { legend } from '../legend.js';
import { kjvMark } from '../version.js';

const TOP = 10;
const WELCOME_KEY = 'welcome-dismissed';
const STARTERS = ['Gen.1.1', 'Ps.23.1', 'Isa.53.5', 'John.1.1'];

export async function renderVerse(container, [ref]) {
  // The reference is shown once books.json is in, formatted by refs.js.
  const titleName = h('span', {}, 'Loading…');
  const kjv = kjvMark();
  const { header, title } = viewHeader(
    [titleName, ' ', kjv],
    'The verse, the verses it cross-references, and the verses that cite it.',
    [
      '“References” lists the verses this one points to, and “Referenced by” the verses that point back to it, strongest by votes first. Hover over or focus any reference to read it, and click it to go there.',
      'The connections graph draws up to 8 verses it references and 7 that reference it, placed around it in Bible order: Genesis at the lower left, Old Testament on the left, New Testament on the right, Revelation at the lower right. Arrows point from the citing verse to the verse it cites; thicker lines have more votes. On a touch screen, tap a verse in the graph to read it and tap again to open it.',
      h('p', { class: 'verse-keys' }, 'Press ← or → to step through verses.'),
    ],
  );
  const textBox = h('div', { class: 'verse-text-box' }, h('p', { class: 'status' }, 'Loading verse…'));
  const reading = h('div', { class: 'reading-column' }, textBox);
  const margin = h(
    'aside',
    { class: 'margin-column', 'aria-label': 'Cross-references', 'aria-busy': 'true' },
    h('p', { class: 'status' }, 'Loading cross-references…'),
  );
  const graph = h('section', { class: 'graph-section', 'aria-labelledby': 'graph-title' });
  container.replaceChildren(...welcomeBand(title), header, h('div', { class: 'verse-layout' }, reading, margin, graph));

  let books;
  try {
    books = await loadBooks();
  } catch {
    if (!title.isConnected) return;
    titleName.textContent = 'Couldn’t load this verse';
    title.replaceChildren(titleName);
    textBox.replaceChildren(loadError('Couldn’t load the verse data.', () => renderVerse(container, [ref])));
    margin.remove();
    graph.remove();
    return;
  }
  if (!title.isConnected) return; // the user navigated away while loading
  const index = getIndex(books);
  const id = index.parseOsis(ref);
  if (id === null) {
    titleName.textContent = 'Verse not found';
    title.replaceChildren(titleName);
    document.title = 'Verse not found · Bible Cross-Reference Explorer';
    textBox.replaceChildren(
      h('p', {}, `No verse matches “${ref}”. Use a reference like `, h('a', { href: '#/verse/John.3.16' }, 'John.3.16'), '.'),
    );
    margin.remove();
    graph.remove();
    header.querySelector('.view-intro').remove();
    header.querySelector('.how-to').remove();
    return;
  }
  const verse = { ...index.locate(id), id };
  const name = index.label(id);
  titleName.textContent = name;
  document.title = `${name} · Bible Cross-Reference Explorer`;
  graph.replaceChildren(h('h2', { id: 'graph-title' }, 'Connections'), h('p', { class: 'status' }, 'Loading connections…'));
  reading.append(verseNav(verse, index, title));

  // Verse text and cross-references load in parallel and independently: each fills
  // in when ready, and if one fails, the other stays and the failed one can be retried.
  const showText = async () => {
    let verses;
    try {
      verses = await loadVerses(verse.book.abbr);
    } catch {
      if (title.isConnected) textBox.replaceChildren(loadError('Couldn’t load the verse text.', showText));
      return;
    }
    if (!title.isConnected) return;
    textBox.replaceChildren(h('p', { class: 'verse-text is-selected' }, verses.text[verse.id - verses.firstId]));
  };
  const showRefs = async () => {
    let xrefs;
    try {
      xrefs = await loadXrefs(verse.book.abbr);
    } catch {
      if (!title.isConnected) return;
      margin.removeAttribute('aria-busy');
      margin.replaceChildren(loadError('Couldn’t load the cross-references.', () => {
        margin.setAttribute('aria-busy', 'true');
        graph.hidden = false;
        graph.replaceChildren(h('h2', { id: 'graph-title' }, 'Connections'), h('p', { class: 'status' }, 'Loading connections…'));
        return showRefs();
      }));
      graph.hidden = true; // drawn from the same data
      return;
    }
    if (!title.isConnected) return;
    const { out, in: incoming } = xrefs.verses[verse.id - xrefs.firstId];
    renderMargin(margin, out, incoming, index);
    return renderGraphSection(graph, verse.id, out, incoming, index);
  };
  await Promise.all([showText(), showRefs()]);
}

// A failed load in one part of the view: what failed, and a button to try that part again.
function loadError(message, retry) {
  const button = h('button', { type: 'button', class: 'retry' }, 'Retry');
  const box = h('p', { class: 'load-error', role: 'alert' }, `${message} Check your connection and try again. `, button);
  button.addEventListener('click', () => {
    box.replaceWith(h('p', { class: 'status' }, 'Loading…'));
    retry();
  });
  return box;
}

function renderMargin(margin, out, incoming, index) {
  margin.removeAttribute('aria-busy');
  margin.replaceChildren(
    refGroup('refs-out', 'References', out, (l) => [l[1], l[2]], 'This verse doesn’t reference any others.', index),
    refGroup('refs-in', 'Referenced by', incoming, (l) => [l[0], l[0]], 'No verses reference this one.', index),
  );
  // The "?" explaining votes goes by the first "Sorted by votes" on the page.
  margin.querySelector('.ref-note')?.append(' ', votesHelp());
}

// First-visit welcome above the verse: what the site is, what a cross-reference is,
// and places to start. Dismissing it is remembered in this browser.
function welcomeBand(title) {
  try {
    if (localStorage.getItem(WELCOME_KEY)) return [];
  } catch {}
  const dismiss = h('button', { type: 'button', class: 'welcome-dismiss' }, 'Dismiss');
  // Filled in once books.json is in (it usually already is), so refs.js names them.
  const startLabel = h('p', { class: 'welcome-label', id: 'welcome-starts-label' }, 'Start with a verse');
  const starts = h('ul', { 'aria-labelledby': 'welcome-starts-label' });
  const band = h(
    'section',
    { class: 'welcome', 'aria-label': 'Welcome' },
    h(
      'p',
      { class: 'welcome-lead' },
      'This site maps about 340,000 cross-references, so you can follow one verse to the others that echo it, or see the connections across the whole Bible at once.',
    ),
    h(
      'p',
      { class: 'welcome-note' },
      'A cross-reference points from one verse to another that speaks of the same person, event, promise or phrase, like the references in the margin of a study Bible.',
    ),
    h(
      'div',
      { class: 'welcome-starts' },
      startLabel,
      starts,
      h('p', { class: 'welcome-label', id: 'welcome-whole-label' }, 'Or see the whole Bible'),
      h(
        'ul',
        { 'aria-labelledby': 'welcome-whole-label' },
        h('li', {}, h('a', { href: '#/arcs' }, 'Chapter arcs')),
        h('li', {}, h('a', { href: '#/books' }, 'Book links')),
      ),
    ),
    dismiss,
  );
  dismiss.addEventListener('click', () => {
    try {
      localStorage.setItem(WELCOME_KEY, '1');
    } catch {}
    band.remove();
    title.focus();
  });
  loadBooks().then(
    (books) => {
      const index = getIndex(books);
      starts.append(...STARTERS.map((osis) => h('li', {}, h('a', { href: `#/verse/${osis}` }, index.label(index.parseOsis(osis))))));
    },
    () => {
      startLabel.remove();
      starts.remove();
    },
  );
  return [band];
}

// Previous/next verse (ids are consecutive across chapters and books) and a link to
// the verse's chapter on the arc diagram. ← and → also step, outside form fields.
function verseNav(verse, index, title) {
  const lastId = index.books.at(-1).lastId;
  const step = (dir, id, keys) => {
    const exists = id >= 0 && id <= lastId;
    const button = h(
      'button',
      { type: 'button', class: `verse-step verse-step-${dir}`, 'aria-keyshortcuts': keys, ...(exists ? {} : { disabled: '' }) },
      h(
        'span',
        { class: 'verse-step-dir' },
        ...(dir === 'prev'
          ? [h('span', { 'aria-hidden': 'true' }, '← '), 'Previous verse']
          : ['Next verse', h('span', { 'aria-hidden': 'true' }, ' →')]),
      ),
      h('span', { class: 'verse-step-ref' }, exists ? index.label(id) : dir === 'prev' ? 'Start of the Bible' : 'End of the Bible'),
    );
    if (exists) button.addEventListener('click', () => (location.hash = `#/verse/${index.osis(id)}`));
    return button;
  };
  const prev = step('prev', verse.id - 1, 'ArrowLeft');
  const next = step('next', verse.id + 1, 'ArrowRight');

  const onKey = (e) => {
    if (!title.isConnected) return document.removeEventListener('keydown', onKey);
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"], [role="listbox"]')) return;
    const button = e.key === 'ArrowLeft' ? prev : e.key === 'ArrowRight' ? next : null;
    if (!button || button.disabled) return;
    e.preventDefault();
    button.click();
  };
  document.addEventListener('keydown', onKey);

  return h(
    'nav',
    { class: 'verse-nav', 'aria-label': 'Nearby verses' },
    h('div', { class: 'verse-steps' }, prev, next),
    h(
      'p',
      { class: 'verse-chapter-link' },
      h('a', { href: `#/arcs?ch=${verse.book.abbr}.${verse.chapter}` }, 'See this chapter on the arc diagram'),
    ),
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
      votesEl(votes),
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

// From 1100px the graph sits in its own column, sticky beside the text and references,
// so it is sized to fit in the window.
const SIDE_BY_SIDE = '(min-width: 1100px)';

async function renderGraphSection(section, centerId, out, incoming, index) {
  const holder = h('div', { class: 'graph-holder' });
  section.replaceChildren(h('h2', { id: 'graph-title' }, 'Connections'), holder);
  // Labels are measured for the layout, so wait for the web fonts first.
  await document.fonts.ready;
  if (!holder.isConnected) return;
  const draw = () => {
    const sticky = window.matchMedia(SIDE_BY_SIDE).matches;
    // Room left in the window under the sticky top offset, heading and legend.
    const maxHeight = sticky ? Math.max(360, window.innerHeight - (holder.offsetTop - section.offsetTop) - 96) : Infinity;
    return renderGraph(holder, { centerId, out, incoming, index, maxHeight });
  };
  const kinds = draw();
  if (!kinds) {
    holder.replaceWith(h('p', { class: 'status' }, 'This verse has no cross-references to draw.'));
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
  // Only the kinds of mark this graph actually draws.
  section.append(
    legend([
      kinds.ot && ['ot', 'Old Testament'],
      kinds.nt && ['nt', 'New Testament'],
      ['current', 'This verse'],
      kinds.out && [arrowSwatch('out'), 'References'],
      kinds.in && [arrowSwatch('in'), 'Referenced by'],
      kinds.faint && [arrowSwatch('faint'), 'No votes yet'],
    ]),
  );
}

// A tiny edge for the legend: from this verse (out), into it (in), or dashed (faint).
function arrowSwatch(kind) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };
  const root = el('svg', { class: `swatch-edge ${kind === 'faint' ? 'faint' : 'strong'}`, width: 30, height: 12, viewBox: '0 0 30 12', 'aria-hidden': 'true' });
  if (kind === 'faint') {
    root.append(el('path', { class: 'graph-edge-line', d: 'M2,6 L28,6', 'stroke-width': 1.5 }));
    return root;
  }
  root.append(el('circle', { class: 'swatch-dot', cx: 5, cy: 6, r: 4.5 }));
  root.append(el('path', { class: 'graph-edge-line', d: 'M10,6 L29,6', 'stroke-width': 2 }));
  root.append(el('path', { class: 'graph-arrow', d: kind === 'out' ? 'M24,6 L16,1.5 L16,10.5 z' : 'M13,6 L21,1.5 L21,10.5 z' }));
  return root;
}
