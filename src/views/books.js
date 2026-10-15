// Chord diagram: the 66 books around a circle, grouped into the 8 sections, with
// a ribbon for each pair of books that cross-reference each other (book-matrix.json).
//
// There are about 2,000 ribbons, so like arcs.js they're drawn on three stacked
// canvases: the ribbons in colour, the same ribbons in --dim, and a highlight
// layer. The first two are drawn only when the layout or theme changes; hovering
// swaps in the dim layer and redraws the highlight layer. The book arcs and labels
// are a small SVG on top, coloured by CSS tokens, so they follow the theme by themselves.
import { arc as d3arc, ribbon as d3ribbon } from 'd3';
import { h } from '../dom.js';
import { loadBooks, loadBookMatrix, loadXrefs, getVerseText } from '../data.js';
import { getIndex } from '../refs.js';
import { themeColor, SECTIONS, sectionOf } from '../theme.js';
import { showPreview, hidePreview } from '../preview.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TAU = 2 * Math.PI;
const MAX_SIZE = 760;
const NARROW = 560; // below this, smaller labels and more short names
const BOOK_PAD = 0.004; // radians between books in a section
const SECTION_PAD = 0.045; // radians between sections
const MAX_DPR = 2;
const RIBBON_ALPHA = 0.72;
const PREVIEW_BOOKS = 5;
const PANEL_BOOKS = 10;
const TOP_PAIRS = 10;
const TEXT_CHARS = 110;

// Names for a run of unlabelled books that all belong to one of these parts of a
// section (books.json `section`), longest first. Other runs get a range ("1 Thess–Phlm").
const GROUP_NAMES = {
  'Major Prophets': ['Major Prophets', 'Major Proph.', 'Major'],
  'Minor Prophets': ['Minor Prophets', 'Minor Proph.', 'Minor'],
  Gospels: ['Gospels'],
};

// Shorter section labels, tried in order when the full name doesn't fit its arc.
const SECTION_SHORT = {
  'Gospels & Acts': ['Gospels'],
  'Pauline letters': ['Paul'],
  'General letters': ['General'],
  Revelation: ['Rev.'],
};

const svg = (tag, attrs = {}) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

// Point at radius r and angle a (radians clockwise from 12 o'clock, as in d3.arc).
const pt = (r, a) => [r * Math.sin(a), -r * Math.cos(a)];
const angleGap = (a, b) => {
  const d = Math.abs(a - b) % TAU;
  return Math.min(d, TAU - d);
};
const votesText = (n) => `${n.toLocaleString('en')} ${n === 1 ? 'vote' : 'votes'}`;
const same = (x, y) => x === y || (!!x && !!y && x.type === y.type && x.a === y.a && x.b === y.b);

function trim(text) {
  if (text.length <= TEXT_CHARS) return text;
  return text.slice(0, text.lastIndexOf(' ', TEXT_CHARS)) + ' …';
}

// The selection lives in the hash so it can be shared: #/books?pair=Isa-Matt or
// #/books?book=Isa, plus &self=1 when links within a book are shown.
function readQuery(query, index) {
  const params = new URLSearchParams(query);
  const find = (abbr) => (abbr ? index.books.find((b) => b.abbr.toLowerCase() === abbr.toLowerCase()) ?? null : null);
  let self = params.get('self') === '1';
  let pin = null;
  const parts = (params.get('pair') ?? '').split('-');
  const [a, b] = parts.map(find);
  if (parts.length === 2 && a && b) {
    pin = { type: 'pair', a: Math.min(a.index, b.index), b: Math.max(a.index, b.index) };
    if (a === b) self = true; // a link within one book only exists with self-links shown
  } else {
    const book = find(params.get('book'));
    if (book) pin = { type: 'book', a: book.index };
  }
  return { self, pin };
}

function writeQuery(self, pin, index) {
  const params = new URLSearchParams();
  const abbr = (i) => index.books[i].abbr;
  if (pin?.type === 'pair') params.set('pair', `${abbr(pin.a)}-${abbr(pin.b)}`);
  if (pin?.type === 'book') params.set('book', abbr(pin.a));
  if (self) params.set('self', '1');
  const query = params.toString();
  // replaceState doesn't fire hashchange, so the view isn't rebuilt.
  history.replaceState(null, '', query ? `#/books?${query}` : '#/books');
}

export async function renderBooks(container, [query = '']) {
  const title = h('h1', { class: 'view-title', tabindex: '-1' }, 'Book links');
  const figure = h('div', { class: 'books-figure' }, h('p', { class: 'status' }, 'Loading cross-references…'));
  container.replaceChildren(
    title,
    h(
      'p',
      { class: 'view-intro' },
      'Each book of the Bible is an arc around the circle, sized by its cross-references, and each ribbon joins two books that cite each other. Wider ribbons have more votes.',
    ),
    figure,
  );
  document.title = 'Book links · Bible Cross-Reference Explorer';

  let books, bookMatrix;
  try {
    [books, bookMatrix] = await Promise.all([loadBooks(), loadBookMatrix()]);
    await document.fonts.ready; // labels are measured
  } catch {
    if (title.isConnected) figure.replaceChildren(h('p', {}, 'Couldn’t load the cross-reference data. Check your connection and reload the page.'));
    return;
  }
  if (!title.isConnected) return;
  const index = getIndex(books);
  buildChart(figure, index, bookMatrix.matrix, readQuery(query, index));
}

function buildChart(figure, index, matrix, initial) {
  const { books } = index;
  const N = books.length;
  const secOf = books.map(sectionOf);
  const name = (i) => books[i].name;

  // Votes between two books in both directions, strongest first (self-links excluded).
  const partners = books.map((_, i) =>
    books
      .map((_, j) => [j, matrix[i][j] + matrix[j][i]])
      .filter(([j, v]) => j !== i && v > 0)
      .sort((x, y) => y[1] - x[1]),
  );

  // --- Elements -------------------------------------------------------------------
  const selfToggle = h('input', { type: 'checkbox', id: 'books-self' });
  selfToggle.checked = initial.self;
  const controls = h(
    'div',
    { class: 'books-controls' },
    h('label', { class: 'books-toggle', for: 'books-self' }, selfToggle, 'Show links within a book'),
  );

  const canvases = ['base', 'dim', 'highlight'].map((n) => h('canvas', { class: `books-layer books-${n}`, 'aria-hidden': 'true' }));
  const [baseCanvas, dimCanvas, hiCanvas] = canvases;
  dimCanvas.hidden = true;
  const overlay = svg('svg', { class: 'books-svg', 'aria-hidden': 'true' });
  const marker = h('div', { class: 'books-marker', 'aria-hidden': 'true' });
  const stack = h('div', { class: 'books-stack' }, ...canvases, overlay, marker);
  const chart = h(
    'div',
    {
      class: 'books-chart',
      tabindex: '0',
      role: 'group',
      'aria-roledescription': 'chord diagram',
      'aria-label':
        'Books of the Bible. Use the arrow keys to move between books, Page Up and Page Down to jump between sections, Enter to list a book’s strongest links, and Escape to clear.',
    },
    stack,
  );
  const live = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });
  const legend = h(
    'ul',
    { class: 'legend', 'aria-label': 'Sections' },
    SECTIONS.map((s) => h('li', {}, h('span', { class: 'swatch', style: `background: var(${s.token})` }), s.name)),
  );
  const hint = h('p', { class: 'books-hint' });
  const panel = h('aside', { class: 'books-panel', 'aria-labelledby': 'books-panel-title' });
  figure.replaceChildren(
    controls,
    h('div', { class: 'books-layout' }, h('div', { class: 'books-main' }, chart, live, legend, hint), panel),
  );

  // --- State --------------------------------------------------------------------------
  // A selection is { type: 'book', a } or { type: 'pair', a, b } with a <= b.
  let self = initial.self;
  let pin = initial.pin; // chosen by click, second tap, Enter or the URL; drives the panel
  let hover = null; // mouse hover, a first tap or the keyboard cursor
  let sticky = false; // hover came from a tap or the keyboard, so it outlasts pointerleave
  let cursor = pin?.a ?? 0; // keyboard position
  let lastPointer = 'mouse';
  let L = null; // layout
  let colors = null;
  let dimStale = true;

  const value = (i, j) => (i === j && !self ? 0 : matrix[i][j]);
  const sheetQuery = window.matchMedia('(max-width: 720px)');

  // --- Layout -------------------------------------------------------------------------
  const measurer = document.createElement('canvas').getContext('2d');
  const hitCtx = document.createElement('canvas').getContext('2d');

  function layout() {
    const W = Math.round(Math.max(260, Math.min(MAX_SIZE, chart.clientWidth)));
    const narrow = W < NARROW;
    const font = narrow ? 9 : 12;
    const fontFamily = themeColor('--font-ui');
    measurer.font = `400 ${font}px ${fontFamily}`;
    const width = (t) => measurer.measureText(t).width;

    // Full names where they fit the label band, short names (“1 Thess”) where they don't.
    const maxRoom = narrow ? 30 : 92;
    const names = books.map((b) => (width(b.name) <= maxRoom ? b.name : index.shortName(b)));
    const widths = names.map(width);
    const room = Math.ceil(Math.max(...widths));
    const labelGap = narrow ? 9 : 14;
    const ringW = narrow ? 7 : 11;
    const rSec = W / 2 - font - 4; // section labels sit just outside this radius
    const rLabel = rSec - 8 - room;
    const rOut = rLabel - labelGap;
    const rIn = rOut - ringW;

    // Book arcs, sized by their total links; wider gaps between sections.
    const rows = books.map((_, i) => books.reduce((sum, _, j) => sum + value(i, j), 0));
    const total = rows.reduce((a, b) => a + b, 0);
    const k = (TAU - (N - SECTIONS.length) * BOOK_PAD - SECTIONS.length * SECTION_PAD) / total;
    let angle = SECTION_PAD / 2;
    const groups = books.map((_, i) => {
      if (i > 0) angle += secOf[i] === secOf[i - 1] ? BOOK_PAD : SECTION_PAD;
      const g = { index: i, startAngle: angle, endAngle: angle + rows[i] * k, value: rows[i] };
      angle = g.endAngle;
      return g;
    });

    // Each arc is split into one piece per linked book. Pieces run from the nearest
    // book anticlockwise to the nearest clockwise, so ribbons don't cross needlessly.
    const sub = books.map(() => []);
    for (const g of groups) {
      let a = g.startAngle;
      for (let d = N - 1; d >= 0; d--) {
        const j = (g.index + d) % N;
        const v = value(g.index, j);
        sub[g.index][j] = { index: g.index, startAngle: a, endAngle: a + v * k, value: v };
        a += v * k;
      }
    }

    // One ribbon per pair. Its colour comes from the book that cites the other more
    // (d3.chord's convention: the larger end is the source).
    const ribbon = d3ribbon().radius(rIn - 1);
    const chords = [];
    for (let i = 0; i < N; i++) {
      for (let j = i; j < N; j++) {
        if (value(i, j) + value(j, i) === 0) continue;
        let source = sub[i][j], target = sub[j][i];
        if (source.value < target.value) [source, target] = [target, source];
        const d = { source, target };
        chords.push({ ...d, a: i, b: j, value: i === j ? source.value : source.value + target.value, path: new Path2D(ribbon(d)) });
      }
    }
    chords.sort((x, y) => y.value - x.value); // small ribbons are drawn last, on top
    const byBook = books.map(() => []);
    const byPair = new Map();
    for (const c of chords) {
      byBook[c.a].push(c);
      if (c.b !== c.a) byBook[c.b].push(c);
      byPair.set(`${c.a}-${c.b}`, c);
    }

    // Radial labels, placed section by section (see placeLabels).
    const sep = (font + (narrow ? 1 : 2)) / rLabel;
    measurer.font = `italic 400 ${font}px ${fontFamily}`;
    const { labels, labelOf } = placeLabels(groups, names, widths, sep, room, width);

    // Section labels follow the circle. The arc they ride on is longer than the
    // section, so a label may spill into the gaps either side.
    measurer.font = `italic 400 ${font}px ${fontFamily}`;
    const sections = SECTIONS.map((s, si) => {
      const first = groups[secOf.indexOf(si)], last = groups[secOf.lastIndexOf(si)];
      const start = first.startAngle, end = last.endAngle;
      const options = [s.name, ...(SECTION_SHORT[s.name] ?? [])];
      const text = options.find((t) => width(t) / rSec <= end - start + SECTION_PAD * 0.8) ?? options.at(-1);
      return { start, end, mid: (start + end) / 2, text };
    });

    const result = { W, narrow, font, rIn, rOut, rLabel, rSec, sep, groups, chords, byBook, byPair, labels, labelOf, sections };
    if (import.meta.env.DEV) checkLabels(result);
    return result;
  }

  // Dev-only guard: every label's angle lies inside its own section's span.
  // Results also go on window.__labelCheck for the Playwright checks.
  function checkLabels({ W, labels, groups }) {
    const bad = [];
    for (const l of labels) {
      const si = secOf[l.books[0]];
      const first = groups[secOf.indexOf(si)], last = groups[secOf.lastIndexOf(si)];
      if (l.books.some((i) => secOf[i] !== si) || l.angle < first.startAngle || l.angle > last.endAngle) {
        bad.push(`${l.text} (${SECTIONS[si].name})`);
      }
    }
    window.__labelCheck = { view: 'books', W, self, labels: labels.length, groups: labels.filter((l) => l.kind === 'group').map((l) => l.text), bad };
    if (bad.length) console.error(`Book labels outside their section at ${W}px: ${bad.join(', ')}`);
  }

  // Book labels never leave their own section's span, and move at most a few label
  // widths from their book (leader lines fan out only within the section). Where a
  // section can't fit them all, its smallest books lose their labels one by one, and
  // each run of two or more unlabelled books gets one italic group label instead,
  // like the Arcs view. Unlabelled books still name themselves in the preview.
  // Returns the labels in angular order and, per book, the index of its own label (or -1).
  function placeLabels(groups, names, widths, sep, room, italicWidth) {
    const mid = (g) => (g.startAngle + g.endAngle) / 2;
    const maxShift = 3 * sep;
    const labels = [];
    for (let si = 0; si < SECTIONS.length; si++) {
      const members = groups.filter((g) => secOf[g.index] === si).map((g) => g.index);
      const start = groups[members[0]].startAngle, end = groups[members.at(-1)].endAngle;
      const margin = Math.min(sep / 2, (end - start) / 2);
      const kept = new Set(members);
      const dropOrder = [...members].sort((a, b) => groups[a].value - groups[b].value || b - a);
      for (;;) {
        const items = sectionItems(members, kept, si, groups, names, widths, room, italicWidth);
        const angles = spread(items.map((it) => it.mid), sep, start + margin, end - margin);
        const fits = angles && items.every((it, n) => Math.abs(angles[n] - it.mid) <= maxShift + (it.end - it.start) / 2);
        // A section with no book labels left has a single group label, which always fits.
        if (fits || kept.size === 0) {
          items.forEach((it, n) => labels.push({ ...it, angle: angles ? angles[n] : (start + end) / 2 }));
          break;
        }
        kept.delete(dropOrder.find((i) => kept.has(i)));
      }
    }
    const labelOf = books.map(() => -1);
    labels.forEach((l, n) => {
      if (l.kind === 'book') labelOf[l.books[0]] = n;
    });
    return { labels, labelOf };

    // Label items for one section: kept books, plus a group label per run of 2+ dropped
    // books. Runs don't cross from one part of a section to another (Major to Minor
    // Prophets), and a named part never gets two group labels: the books between its
    // first and last run lose their labels too, so the runs merge into one.
    function sectionItems(members, keptIn, si, groups, names, widths, room, italicWidth) {
      const kept = new Set(keptIn);
      for (const part of Object.keys(GROUP_NAMES)) {
        const inPart = members.filter((i) => books[i].section === part);
        const dropped = inPart.filter((i) => !kept.has(i));
        const runs = dropped.filter((i, n) => n === 0 || dropped[n - 1] !== inPart[inPart.indexOf(i) - 1]).length;
        if (runs >= 2) for (let i = dropped[0]; i <= dropped.at(-1); i++) kept.delete(i);
      }
      const items = [];
      let run = [];
      const flush = () => {
        if (run.length >= 2) {
          const first = groups[run[0]], last = groups[run.at(-1)];
          const part = books[run[0]].section;
          const sameName = run.every((i) => books[i].section === part) && part !== SECTIONS[si].name;
          const options = [
            ...(sameName ? GROUP_NAMES[part] ?? [] : []),
            `${index.shortName(books[run[0]])}–${index.shortName(books[run.at(-1)])}`,
            `${run.length} books`,
          ];
          const text = options.find((t) => italicWidth(t) <= room) ?? options.at(-1);
          items.push({ kind: 'group', books: run, start: first.startAngle, end: last.endAngle, mid: (first.startAngle + last.endAngle) / 2, text, width: italicWidth(text) });
        }
        run = [];
      };
      for (const i of members) {
        if (run.length && books[i].section !== books[run[0]].section) flush();
        if (kept.has(i)) {
          flush();
          const g = groups[i];
          items.push({ kind: 'book', books: [i], start: g.startAngle, end: g.endAngle, mid: mid(g), text: names[i], width: widths[i] });
        } else run.push(i);
      }
      flush();
      return items;
    }
  }

  // Places labels at least `sep` apart within [lo, hi], keeping each run of crowded
  // labels centred on the books it labels. `desired` is sorted, as books run clockwise
  // in canonical order. Returns null if they can't fit.
  function spread(desired, sep, lo, hi) {
    if ((desired.length - 1) * sep > hi - lo + 1e-9) return null;
    const place = (c) => {
      const centred = c.sum / c.items.length - ((c.items.length - 1) * sep) / 2;
      c.start = Math.min(Math.max(centred, lo), hi - (c.items.length - 1) * sep);
    };
    let clusters = desired.map((a, i) => ({ items: [i], sum: a, start: a }));
    clusters.forEach(place);
    for (let merged = true; merged; ) {
      merged = false;
      const next = [];
      for (const c of clusters) {
        const prev = next.at(-1);
        if (prev && prev.start + prev.items.length * sep > c.start) {
          prev.items.push(...c.items);
          prev.sum += c.sum;
          place(prev);
          merged = true;
        } else next.push(c);
      }
      clusters = next;
    }
    const out = [];
    for (const c of clusters) c.items.forEach((i, n) => (out[i] = c.start + n * sep));
    return out;
  }

  // --- SVG overlay: book arcs, labels, section labels ----------------------------------
  let arcEls = [], labelEls = [], cursorEl = null;

  function buildOverlay() {
    const { W } = L;
    overlay.setAttribute('viewBox', `${-W / 2} ${-W / 2} ${W} ${W}`);
    overlay.setAttribute('width', W);
    overlay.setAttribute('height', W);
    overlay.style.fontSize = `${L.font}px`;
    const arcPath = d3arc().innerRadius(L.rIn).outerRadius(L.rOut);
    const children = [];

    arcEls = L.groups.map((g) =>
      svg('path', { class: 'chord-arc', d: arcPath(g), style: `--c: var(${SECTIONS[secOf[g.index]].token})`, 'data-book': g.index, 'data-section': secOf[g.index] }),
    );
    children.push(...arcEls);

    // Leader lines from an arc to its label where the label had to move, and from
    // a bracket over a run of unlabelled books to their group label.
    const p = (rr, a) => pt(rr, a).join(',');
    const leaders = [];
    for (const l of L.labels) {
      if (l.kind === 'group') {
        const r = L.rOut + 4;
        leaders.push(`M${p(r - 3, l.start)}L${p(r, l.start)}A${r},${r} 0 0 1 ${p(r, l.end)}L${p(r - 3, l.end)}`);
        leaders.push(`M${p(r, l.mid)}L${p(L.rLabel - 2, l.angle)}`);
      } else if (angleGap(l.angle, l.mid) > 0.002) {
        leaders.push(`M${p(L.rOut + 1, l.mid)}L${p(L.rOut + 4, l.mid)}L${p(L.rLabel - 2, l.angle)}`);
      }
    }
    if (leaders.length) children.push(svg('path', { class: 'chord-leader', d: leaders.join('') }));

    labelEls = L.labels.map((l) => {
      const flip = l.angle > Math.PI;
      const deg = (l.angle * 180) / Math.PI - 90;
      const text = svg('text', {
        class: l.kind === 'group' ? 'chord-label chord-group-label' : 'chord-label',
        transform: `rotate(${deg}) translate(${L.rLabel},0)${flip ? ' rotate(180)' : ''}`,
        'text-anchor': flip ? 'end' : 'start',
        dy: '0.35em',
        'data-section': secOf[l.books[0]],
        'data-books': l.books.join(' '),
      });
      text.textContent = l.text;
      return text;
    });
    children.push(...labelEls);

    // Sections: a thin bracket around the circle with the name above it.
    for (const [si, s] of L.sections.entries()) {
      const r = L.rSec, large = s.end - s.start > Math.PI ? 1 : 0;
      children.push(
        svg('path', {
          class: 'chord-bracket',
          d: `M${p(r - 3, s.start)}L${p(r, s.start)}A${r},${r} 0 ${large} 1 ${p(r, s.end)}L${p(r - 3, s.end)}`,
        }),
      );
      // Text along an arc centred on the section; reversed on the lower half so it reads upright.
      const bottom = s.mid > Math.PI / 2 && s.mid < (3 * Math.PI) / 2;
      const rb = bottom ? r + 3 + L.font * 0.75 : r + 4;
      const [a0, a1] = bottom ? [s.mid + 1.4, s.mid - 1.4] : [s.mid - 1.4, s.mid + 1.4];
      const id = `books-sec-${si}`;
      children.push(svg('path', { id, class: 'chord-sec-path', d: `M${p(rb, a0)}A${rb},${rb} 0 0 ${bottom ? 0 : 1} ${p(rb, a1)}` }));
      const text = svg('text', { class: 'chord-sec-label', 'text-anchor': 'middle' });
      const tp = svg('textPath', { href: `#${id}`, startOffset: '50%' });
      tp.textContent = s.text;
      text.append(tp);
      children.push(text);
    }

    // Keyboard position, shown only while the chart has keyboard focus.
    cursorEl = svg('path', { class: 'chord-cursor' });
    children.push(cursorEl);
    overlay.replaceChildren(...children);
    updateCursor();
  }

  function updateCursor() {
    const g = L.groups[cursor];
    const pad = 0.004;
    cursorEl.setAttribute(
      'd',
      d3arc().innerRadius(L.rIn - 3).outerRadius(L.rOut + 3)({ startAngle: g.startAngle - pad, endAngle: g.endAngle + pad }),
    );
  }

  // Dims the arcs and labels of books not linked to the selection.
  function updateOverlay(sel, list) {
    const linked = new Set();
    if (sel) {
      linked.add(sel.a).add(sel.b ?? sel.a);
      for (const c of list) linked.add(c.a).add(c.b);
    }
    for (let i = 0; i < N; i++) arcEls[i].classList.toggle('is-dim', !!sel && !linked.has(i));
    // A group label counts as linked or active if any of its books is.
    L.labels.forEach((l, n) => {
      labelEls[n].classList.toggle('is-dim', !!sel && !l.books.some((i) => linked.has(i)));
      labelEls[n].classList.toggle('is-active', !!sel && l.books.some((i) => i === sel.a || i === sel.b));
    });
  }

  // --- Canvas ---------------------------------------------------------------------------
  function sizeCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(L.W * dpr);
    canvas.height = Math.round(L.W * dpr);
    canvas.style.width = canvas.style.height = `${L.W}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, (L.W / 2) * dpr, (L.W / 2) * dpr); // origin at the centre
    return ctx;
  }

  function paint(ctx, list, { dim = false, alpha = RIBBON_ALPHA } = {}) {
    ctx.globalAlpha = dim ? 0.6 : alpha;
    for (const c of list) {
      ctx.fillStyle = dim ? colors.dim : colors.sec[secOf[c.source.index]];
      ctx.fill(c.path);
    }
    ctx.globalAlpha = 1;
  }

  // Colour and dim layers: only on layout or theme changes.
  function drawAll() {
    performance.mark('books-draw-start');
    colors = { dim: themeColor('--dim'), sec: SECTIONS.map((s) => themeColor(s.token)) };
    stack.style.width = stack.style.height = `${L.W}px`;
    paint(sizeCanvas(baseCanvas), L.chords);
    dimStale = true;
    sizeCanvas(hiCanvas);
    performance.measure('books-draw', 'books-draw-start');
    drawHighlight();
  }

  function drawDim() {
    paint(sizeCanvas(dimCanvas), L.chords, { dim: true });
    dimStale = false;
  }

  const chordsOf = (sel) => (sel.type === 'book' ? L.byBook[sel.a] : [L.byPair.get(`${sel.a}-${sel.b}`)].filter(Boolean));

  // The only drawing on hover: the selection's ribbons in their pigments, over the dim layer.
  function drawHighlight() {
    const sel = hover ?? pin;
    const ctx = hiCanvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, hiCanvas.width, hiCanvas.height);
    ctx.restore();
    baseCanvas.hidden = !!sel;
    dimCanvas.hidden = !sel;
    if (!sel) return updateOverlay(null, []);
    if (dimStale) drawDim();
    const list = chordsOf(sel);
    paint(ctx, list, { alpha: 0.88 });
    updateOverlay(sel, list);
  }

  // --- Hit testing ------------------------------------------------------------------------
  function hitTest(x, y) {
    const dx = x - L.W / 2, dy = y - L.W / 2;
    const r = Math.hypot(dx, dy);
    let a = Math.atan2(dx, -dy);
    if (a < 0) a += TAU;
    if (r < L.rIn) {
      // Ribbons, topmost (last drawn) first. Path2D coordinates are centred like dx, dy.
      for (let k = L.chords.length - 1; k >= 0; k--) {
        const c = L.chords[k];
        if (hitCtx.isPointInPath(c.path, dx, dy)) return { type: 'pair', a: c.a, b: c.b };
      }
      return null;
    }
    if (r <= L.rOut + 4) {
      // On the ring: the arc under the pointer, or the nearest one in a gap.
      let best = -1, bestGap = SECTION_PAD;
      for (const g of L.groups) {
        const gap = a >= g.startAngle && a <= g.endAngle ? 0 : Math.min(angleGap(a, g.startAngle), angleGap(a, g.endAngle));
        if (gap < bestGap) [best, bestGap] = [g.index, gap];
      }
      return best >= 0 ? { type: 'book', a: best } : null;
    }
    // Over the labels: the nearest label, if the pointer is within its length. A group
    // label stands for several books; the one whose arc is nearest the pointer wins.
    let best = null, bestGap = L.sep * 0.75;
    for (const l of L.labels) {
      const gap = angleGap(a, l.angle);
      if (gap < bestGap && r <= L.rLabel + l.width + 6) [best, bestGap] = [l, gap];
    }
    if (!best) return null;
    const near = (i) => angleGap(a, (L.groups[i].startAngle + L.groups[i].endAngle) / 2);
    return { type: 'book', a: best.books.reduce((x, y) => (near(y) < near(x) ? y : x)) };
  }

  // --- Previews and announcements -----------------------------------------------------------
  function actionText(sel, how) {
    const what = sel.type === 'book' ? 'for its strongest links' : 'to see the top verse pairs';
    return { touch: `Tap again ${what}.`, key: `Press Enter ${what}.`, mouse: `Click ${what}.` }[how];
  }

  function pairTitle(a, b) {
    return a === b ? `Within ${name(a)}` : `${name(a)} and ${name(b)}`;
  }

  function previewNote(sel, how) {
    const action = h('span', { class: 'preview-action' }, actionText(sel, how));
    if (sel.type === 'book') {
      const top = partners[sel.a].slice(0, PREVIEW_BOOKS);
      return h(
        'div',
        {},
        h('span', {}, 'Most linked books, votes both ways:'),
        h(
          'ol',
          { class: 'preview-list' },
          top.map(([j, v]) => h('li', {}, h('span', {}, name(j)), h('span', { class: 'votes' }, v.toLocaleString('en')))),
        ),
        action,
      );
    }
    const { a, b } = sel;
    const lines =
      a === b
        ? [`${votesText(matrix[a][a])} for links inside the book.`]
        : [`From ${name(a)} to ${name(b)}: ${votesText(matrix[a][b])}`, `From ${name(b)} to ${name(a)}: ${votesText(matrix[b][a])}`];
    return h('div', {}, lines.map((t) => h('span', { class: 'preview-line' }, t)), action);
  }

  function placeMarker(x, y) {
    marker.style.left = `${x}px`;
    marker.style.top = `${y}px`;
  }

  // Sets the transient selection. `at` is where to anchor the preview (stack
  // coordinates); books anchor to the end of their label.
  function setHover(sel, { isSticky = false, how = 'mouse', at = null, announce = false } = {}) {
    sticky = isSticky && !!sel;
    if (!same(sel, hover)) {
      hover = sel;
      drawHighlight();
    }
    if (!sel) return hidePreview();
    marker.style.width = marker.style.height = '';
    if (L.narrow) {
      // On phones the preview opens above or below the whole circle, never over it,
      // so a second tap can reach the book or ribbon.
      placeMarker(0, 0);
      marker.style.width = marker.style.height = `${L.W}px`;
    } else if (sel.type === 'book') {
      // At the end of the book's label, or beside its arc if it has no label of its own.
      const l = L.labels[L.labelOf[sel.a]];
      const g = L.groups[sel.a];
      const [x, y] = l ? pt(L.rLabel + l.width + 4, l.angle) : pt(L.rOut + 6, (g.startAngle + g.endAngle) / 2);
      placeMarker(L.W / 2 + x, L.W / 2 + y);
    } else if (at) {
      placeMarker(at[0], at[1] + 12);
    }
    showPreview(marker, sel.type === 'book' ? name(sel.a) : pairTitle(sel.a, sel.b), previewNote(sel, how));
    if (announce && sel.type === 'book') {
      const top = partners[sel.a].slice(0, 3).map(([j]) => name(j));
      live.textContent = `${name(sel.a)}, ${SECTIONS[secOf[sel.a]].name}. Most linked to ${top.join(', ')}.`;
    }
  }

  // --- Selection and panel ------------------------------------------------------------------
  function setPin(sel, { focusPanel = false } = {}) {
    pin = sel;
    if (sel) cursor = sel.a;
    updateCursor();
    hover = null;
    sticky = false;
    hidePreview();
    writeQuery(self, pin, index);
    drawHighlight();
    renderPanel();
    if (focusPanel || (sel && sheetQuery.matches && document.activeElement === chart)) {
      panel.querySelector('h2')?.focus();
    }
    if (sel) live.textContent = `${sel.type === 'book' ? name(sel.a) : pairTitle(sel.a, sel.b)}: details shown${sheetQuery.matches ? '' : ' beside the chart'}.`;
  }

  let panelToken = 0;

  function renderPanel() {
    const mine = ++panelToken;
    const heading = (text) => h('h2', { id: 'books-panel-title', class: 'books-panel-title', tabindex: '-1' }, text);
    panel.classList.toggle('is-open', !!pin);
    if (!pin) {
      panel.replaceChildren(
        heading('Details'),
        h('p', { class: 'status' }, 'Click a book or a ribbon to list its strongest links here.'),
      );
      return;
    }
    const close = h('button', { type: 'button', class: 'books-close', 'aria-label': 'Close details' }, 'Close');
    close.addEventListener('click', () => {
      setPin(null);
      chart.focus();
    });
    const bookButton = (j, label) => {
      const b = h('button', { type: 'button', class: 'books-link' }, label);
      b.addEventListener('click', () => setPin({ type: 'book', a: j }, { focusPanel: true }));
      return b;
    };

    if (pin.type === 'book') {
      const i = pin.a;
      const list = partners[i];
      const top = list.slice(0, PANEL_BOOKS);
      const max = top[0]?.[1] ?? 1;
      const totalVotes = list.reduce((s, [, v]) => s + v, 0);
      panel.replaceChildren(
        h('div', { class: 'books-panel-head' }, heading(name(i)), close),
        h('p', { class: 'books-panel-meta' }, `${SECTIONS[secOf[i]].name} · ${votesText(totalVotes)} to and from other books`),
        h('h3', {}, 'Most linked books'),
        h(
          'ol',
          { class: 'books-partners' },
          top.map(([j, v]) => {
            const b = h(
              'button',
              { type: 'button', class: 'books-partner' },
              h('span', { class: 'books-partner-name' }, name(j)),
              h('span', { class: 'votes' }, v.toLocaleString('en'), h('span', { class: 'visually-hidden' }, ' votes')),
              h('span', { class: 'books-bar', style: `--c: var(${SECTIONS[secOf[j]].token}); --w: ${(v / max) * 100}%`, 'aria-hidden': 'true' }),
            );
            b.addEventListener('click', () => setPin({ type: 'pair', a: Math.min(i, j), b: Math.max(i, j) }, { focusPanel: true }));
            return h('li', {}, b);
          }),
        ),
        h('p', { class: 'books-panel-more' }, h('a', { href: `#/arcs?book=${books[i].abbr}` }, `See ${name(i)} chapter by chapter in the arc diagram`)),
      );
      return;
    }

    const { a, b } = pin;
    const status = h('p', { class: 'status' }, 'Loading verse pairs…');
    const meta =
      a === b
        ? `${votesText(matrix[a][a])} for links between verses in ${name(a)}.`
        : `From ${name(a)} to ${name(b)}: ${votesText(matrix[a][b])}. From ${name(b)} to ${name(a)}: ${votesText(matrix[b][a])}.`;
    panel.replaceChildren(
      h('div', { class: 'books-panel-head' }, heading(pairTitle(a, b)), close),
      h('p', { class: 'books-panel-meta' }, meta),
      h('p', { class: 'books-panel-books' }, 'Strongest links of ', bookButton(a, name(a)), ...(a === b ? [] : [' or ', bookButton(b, name(b))])),
      h('h3', {}, 'Top verse pairs'),
      status,
    );
    loadPairs(a, b).then(
      (items) => {
        if (mine !== panelToken || !panel.isConnected) return;
        status.replaceWith(
          items.length
            ? h('ol', { class: 'books-pairs' }, items.map(pairItem))
            : h('p', { class: 'status' }, 'No cross-references link these books.'),
        );
      },
      () => {
        if (mine !== panelToken || !panel.isConnected) return;
        status.textContent = 'Couldn’t load the verse pairs. Check your connection and try again.';
      },
    );
  }

  // The strongest links between two books, in either direction, with verse text.
  async function loadPairs(a, b) {
    const A = books[a], B = books[b];
    const [xa, xb] = await Promise.all([loadXrefs(A.abbr), loadXrefs(B.abbr)]);
    const inBook = (book) => (id) => id >= book.firstId && id <= book.lastId;
    const links = [];
    const collect = (xrefs, target) => {
      for (const v of xrefs.verses) for (const link of v.out) if (target(link[1])) links.push(link);
    };
    collect(xa, inBook(B));
    if (a !== b) collect(xb, inBook(A));
    links.sort((x, y) => y[3] - x[3] || x[0] - y[0]);
    const top = links.slice(0, TOP_PAIRS);
    const texts = await Promise.all(top.flatMap(([from, to]) => [getVerseText(index, from), getVerseText(index, to)]));
    return top.map((link, n) => ({ link, fromText: texts[2 * n], toText: texts[2 * n + 1] }));
  }

  function pairItem({ link: [from, toStart, toEnd, votes], fromText, toText }) {
    const toShown = trim(toText);
    const ref = (start, end) => h('a', { href: `#/verse/${index.osis(start)}`, class: 'ref-link' }, index.rangeLabel(start, end));
    return h(
      'li',
      {},
      h(
        'div',
        { class: 'books-pair-refs' },
        h('span', {}, ref(from, from), h('span', { 'aria-hidden': 'true' }, ' → '), h('span', { class: 'visually-hidden' }, ' cites '), ref(toStart, toEnd)),
        h('span', { class: 'votes' }, votesText(votes)),
      ),
      h('p', { class: 'books-pair-text' }, trim(fromText)),
      h('p', { class: 'books-pair-text' }, toShown + (toEnd > toStart && !toShown.endsWith('…') ? ' …' : '')),
    );
  }

  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pin) {
      setPin(null);
      chart.focus();
    }
  });

  // --- Pointer -------------------------------------------------------------------------------
  const local = (e) => {
    const r = stack.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  let moveFrame = 0, lastMove = null;
  stack.addEventListener('pointerdown', (e) => {
    lastPointer = e.pointerType;
  });
  // Hit testing ~2,000 ribbons is cheap, but still at most once per frame.
  stack.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    lastPointer = 'mouse';
    lastMove = local(e);
    if (moveFrame) return;
    moveFrame = requestAnimationFrame(() => {
      moveFrame = 0;
      const hit = hitTest(...lastMove);
      stack.style.cursor = hit ? 'pointer' : '';
      if (hit || !sticky) setHover(hit, { at: lastMove });
    });
  });
  stack.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    cancelAnimationFrame(moveFrame);
    moveFrame = 0;
    if (!sticky) setHover(null);
  });
  // Mouse: click opens the details. Touch: the first tap previews, a second tap opens.
  stack.addEventListener('click', (e) => {
    const at = local(e);
    const hit = hitTest(...at);
    if (lastPointer === 'touch' || lastPointer === 'pen') {
      if (hit && sticky && same(hit, hover)) setPin(hit);
      else setHover(hit, { isSticky: true, how: 'touch', at });
    } else if (hit) {
      setPin(hit);
    }
  });
  // Tapping outside the chart clears a tapped preview.
  const onDocPointer = (e) => {
    if (!stack.isConnected) return document.removeEventListener('pointerdown', onDocPointer);
    if (sticky && !stack.contains(e.target) && !e.target.closest?.('.preview')) setHover(null);
  };
  document.addEventListener('pointerdown', onDocPointer);

  // --- Keyboard ---------------------------------------------------------------------------------
  chart.addEventListener('focus', () => {
    // Only for keyboard focus; a click also focuses the chart.
    if (chart.matches(':focus-visible')) setHover({ type: 'book', a: cursor }, { isSticky: true, how: 'key', announce: true });
  });
  chart.addEventListener('blur', () => {
    if (sticky) setHover(null);
  });
  chart.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    let i = cursor;
    const firstOf = (s) => secOf.indexOf(s);
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown': i = (i + 1) % N; break;
      case 'ArrowLeft':
      case 'ArrowUp': i = (i - 1 + N) % N; break;
      case 'PageDown': i = firstOf((secOf[i] + 1) % SECTIONS.length); break;
      case 'PageUp': {
        const s = secOf[i];
        i = i > firstOf(s) ? firstOf(s) : firstOf((s - 1 + SECTIONS.length) % SECTIONS.length);
        break;
      }
      case 'Home': i = 0; break;
      case 'End': i = N - 1; break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        setPin({ type: 'book', a: cursor });
        return;
      case 'Escape':
        if (hover) setHover(null);
        else if (pin) setPin(null);
        return;
      default:
        return;
    }
    e.preventDefault();
    cursor = i;
    updateCursor();
    setHover({ type: 'book', a: i }, { isSticky: true, how: 'key', announce: true });
  });

  // --- Controls, theme and size ----------------------------------------------------------------
  selfToggle.addEventListener('change', () => {
    self = selfToggle.checked;
    if (!self && pin?.type === 'pair' && pin.a === pin.b) pin = null;
    hover = null;
    hidePreview();
    L = layout();
    buildOverlay();
    drawAll();
    writeQuery(self, pin, index);
    renderPanel();
  });

  const onTheme = () => {
    if (!stack.isConnected) return window.removeEventListener('themechange', onTheme);
    drawAll();
  };
  window.addEventListener('themechange', onTheme);

  let resizeTimer;
  const observer = new ResizeObserver(() => {
    if (!stack.isConnected) return observer.disconnect();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const W = Math.round(Math.max(260, Math.min(MAX_SIZE, chart.clientWidth)));
      if (W === L.W) return;
      setHover(null);
      L = layout();
      buildOverlay();
      drawAll();
      updateHint();
    }, 150);
  });

  function updateHint() {
    hint.textContent =
      (L.narrow
        ? 'Tap a book or a ribbon to see its links, and tap it again for details.'
        : 'Hover over a book or a ribbon to see its links, and click for details.') +
      ' Each ribbon takes the colour of the book that cites the other more; its width at each end shows the votes from that book.';
  }

  L = layout();
  buildOverlay();
  drawAll();
  updateHint();
  renderPanel();
  if (pin) writeQuery(self, pin, index); // normalise the URL (e.g. pair order)
  observer.observe(chart);
}
