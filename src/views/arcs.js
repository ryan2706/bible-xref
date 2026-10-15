// Arc diagram: all 1,189 chapters on one axis, with an arc for each pair of
// chapters that cross-reference each other (overview.json), drawn on canvas.
//
// Three stacked canvases: the arcs in colour, the same arcs in --dim, and a
// highlight layer. The first two are drawn only when the filter, size or theme
// changes; hovering just shows the dim layer and redraws the highlight layer.
import { h } from '../dom.js';
import { loadBooks, loadOverview } from '../data.js';
import { getIndex } from '../refs.js';
import { themeColor, isDark } from '../theme.js';
import { showPreview, hidePreview } from '../preview.js';

const DEFAULT_VOTES = 50;
const MAX_VOTES = 500;
const VOTES_STEP = 5;
const NARROW = 720; // below this the chart keeps a fixed width and scrolls sideways
const SCROLL_WIDTH = 1700;
const PAD_X = 6;
const TESTAMENT_GAP = 10;
const BAR_MAX = 32; // px for the longest chapter (Psalm 119)
const MAX_DPR = 2; // caps canvas memory on phones
const MIN_ARC_H = 9; // px, so links between neighbouring chapters clear the axis marker

// Names for runs of books labelled as a group when the chart is too crowded to
// label them one by one, longest first.
const GROUP_NAMES = {
  Law: ['Law'],
  History: ['History'],
  Poetry: ['Poetry'],
  'Major Prophets': ['Major Prophets', 'Major Proph.'],
  'Minor Prophets': ['Minor Prophets', 'Minor Proph.'],
  Gospels: ['Gospels'],
  'Pauline Epistles': ['Pauline letters', 'Paul'],
  'General Epistles': ['General letters', 'General'],
};

// Filters live in the hash so views can be shared: #/arcs?min=30&book=Isa
function readQuery(query, index, minVotes) {
  const params = new URLSearchParams(query);
  const min = Number(params.get('min'));
  const abbr = params.get('book')?.toLowerCase();
  return {
    min: Number.isFinite(min) && min > 0 ? Math.min(MAX_VOTES, Math.max(minVotes, Math.round(min / VOTES_STEP) * VOTES_STEP)) : DEFAULT_VOTES,
    book: index.books.find((b) => b.abbr.toLowerCase() === abbr) ?? null,
  };
}

function writeQuery(min, book) {
  const params = new URLSearchParams();
  if (min !== DEFAULT_VOTES) params.set('min', String(min));
  if (book) params.set('book', book.abbr);
  const query = params.toString();
  // replaceState doesn't fire hashchange, so the view isn't rebuilt.
  history.replaceState(null, '', query ? `#/arcs?${query}` : '#/arcs');
}

export async function renderArcs(container, [query = '']) {
  const title = h('h1', { class: 'view-title', tabindex: '-1' }, 'Chapter arcs');
  const figure = h('div', { class: 'arcs-figure' }, h('p', { class: 'status' }, 'Loading cross-references…'));
  container.replaceChildren(
    title,
    h(
      'p',
      { class: 'view-intro' },
      'Every chapter from Genesis to Revelation in one line, with an arc for each pair of chapters that cross-reference each other. Bars under the line show how long each chapter is.',
    ),
    figure,
  );
  document.title = 'Chapter arcs · Bible Cross-Reference Explorer';

  let books, overview;
  try {
    [books, overview] = await Promise.all([loadBooks(), loadOverview()]);
    await document.fonts.ready; // labels are measured
  } catch {
    if (title.isConnected) figure.replaceChildren(h('p', {}, 'Couldn’t load the cross-reference data. Check your connection and reload the page.'));
    return;
  }
  if (!title.isConnected) return;
  const index = getIndex(books);
  buildChart(figure, index, overview, readQuery(query, index, overview.minVotes));
}

function buildChart(figure, index, overview, initial) {
  const { chapters } = index;
  const N = chapters.length;
  const ntStart = index.books.find((b) => b.testament === 'NT').firstChapter;

  // --- Controls ---------------------------------------------------------------
  const slider = h('input', {
    type: 'range',
    id: 'arcs-votes',
    min: String(overview.minVotes),
    max: String(MAX_VOTES),
    step: String(VOTES_STEP),
    value: String(initial.min),
  });
  const votesOut = h('output', { for: 'arcs-votes', class: 'arcs-votes-value' });
  const bookSelect = h(
    'select',
    { id: 'arcs-book' },
    h('option', { value: '' }, 'All books'),
    ...['OT', 'NT'].map((t) =>
      h(
        'optgroup',
        { label: t === 'OT' ? 'Old Testament' : 'New Testament' },
        index.books
          .filter((b) => b.testament === t)
          .map((b) => h('option', { value: String(b.index), ...(b === initial.book ? { selected: '' } : {}) }, b.name)),
      ),
    ),
  );
  const count = h('p', { class: 'arcs-count', role: 'status' });
  const controls = h(
    'div',
    { class: 'arcs-controls' },
    h('div', { class: 'arcs-control' }, h('label', { for: 'arcs-votes' }, 'Minimum votes'), h('div', { class: 'arcs-slider' }, slider, votesOut)),
    h('div', { class: 'arcs-control' }, h('label', { for: 'arcs-book' }, 'Book'), bookSelect),
    count,
  );

  // --- Chart -------------------------------------------------------------------
  const canvases = ['base', 'dim', 'highlight'].map((name) => h('canvas', { class: `arcs-layer arcs-${name}`, 'aria-hidden': 'true' }));
  const [baseCanvas, dimCanvas, hiCanvas] = canvases;
  dimCanvas.hidden = true;
  const marker = h('div', { class: 'arcs-marker', 'aria-hidden': 'true' });
  const stack = h('div', { class: 'arcs-stack' }, ...canvases, marker);
  const live = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });
  const scroller = h(
    'div',
    {
      class: 'arcs-scroll',
      tabindex: '0',
      role: 'group',
      'aria-roledescription': 'arc diagram',
      'aria-label': 'Chapters. Use the left and right arrow keys to move between chapters, Page Up and Page Down to jump between books, and Enter to read the chapter.',
    },
    stack,
  );
  const legend = h(
    'ul',
    { class: 'legend', 'aria-label': 'Legend' },
    h('li', {}, h('span', { class: 'swatch ot' }), 'Old Testament to Old Testament'),
    h('li', {}, h('span', { class: 'swatch nt' }), 'New Testament to New Testament'),
    h('li', {}, h('span', { class: 'swatch cross' }), 'Between the Testaments'),
    h('li', {}, h('span', { class: 'swatch current' }), 'Selected chapter'),
  );
  const hint = h('p', { class: 'arcs-hint' });
  figure.replaceChildren(controls, scroller, live, legend, hint);

  // --- State ---------------------------------------------------------------------
  let minVotes = initial.min;
  let book = initial.book; // filter: only links touching this book
  let visible = []; // links passing the filter
  let byChapter = []; // chapter -> visible links touching it
  let L = null; // layout
  let hovered = -1;
  let pinned = false; // selected by tap or keyboard rather than mouse hover
  let lastPointer = 'mouse';

  function passes() {
    const lo = book?.firstChapter ?? 0;
    const hi = book ? lo + book.chapters - 1 : N - 1;
    const touches = (c) => c >= lo && c <= hi;
    return ([a, b, v]) => v >= minVotes && (!book || touches(a) || touches(b));
  }

  // Cheap enough (~1 ms) to run on every slider input, even when drawing lags behind.
  function showCount(n = overview.links.filter(passes()).length) {
    votesOut.value = `${minVotes}+`;
    const noun = n === 1 ? 'arc' : 'arcs';
    count.textContent = `${n.toLocaleString('en')} ${noun}${book ? ` touching ${book.name}` : ''}`;
  }

  function filter() {
    visible = overview.links.filter(passes());
    byChapter = Array.from({ length: N }, () => []);
    for (const link of visible) {
      byChapter[link[0]].push(link);
      byChapter[link[1]].push(link);
    }
    showCount(visible.length);
  }

  function layout() {
    const narrow = scroller.clientWidth < NARROW;
    const W = narrow ? SCROLL_WIDTH : scroller.clientWidth;
    const step = (W - 2 * PAD_X - TESTAMENT_GAP) / N;
    const x = (c) => PAD_X + (c + 0.5) * step + (c >= ntStart ? TESTAMENT_GAP : 0);
    const arcH = Math.round(Math.min(380, Math.max(200, W * 0.33)));
    const axisY = arcH + 6;
    const barTop = axisY + 2;
    const labelY = barTop + BAR_MAX + 16; // first row of book labels (baseline)
    const L = {
      W,
      narrow,
      step,
      x,
      axisY,
      barTop,
      labelY,
      groupY: labelY + 38, // first group row (baseline)
      H: labelY + 66,
      ry: arcH / ((x(N - 1) - x(0)) / 2), // vertical scale: the widest arc is arcH tall
      dividerX: x(ntStart) - step / 2 - TESTAMENT_GAP / 2,
      maxVerses: Math.max(...chapters.map((c) => c.verses)),
    };
    L.labels = placeLabels(L);
    return L;
  }

  // Book labels in two staggered rows: full names where the book is wide enough,
  // short names where crowded, bigger books first. Where a section loses two or
  // more labels (Minor Prophets, Pauline letters…), a bracketed group label spans
  // the whole section in the group rows below, next to the Testament labels.
  function placeLabels(L) {
    const ctx = baseCanvas.getContext('2d');
    ctx.font = labelFont();
    const span = (first, last) => [L.x(first) - L.step / 2, L.x(last) + L.step / 2];

    // Greedy placement into rows; returns the row used, or -1.
    const fits = (rows, a, z) => rows.findIndex((r) => r.every(([ra, rz]) => z <= ra || a >= rz));
    const centred = (x0, x1, w) => Math.min(Math.max((x0 + x1) / 2, w / 2 + 2), L.W - w / 2 - 2);

    const bookRows = [[], []];
    const books = [];
    const order = [...index.books].sort((a, b) => b.chapters - a.chapters || a.index - b.index);
    for (const b of order) {
      const [x0, x1] = span(b.firstChapter, b.firstChapter + b.chapters - 1);
      const text = ctx.measureText(b.name).width <= x1 - x0 + 6 ? b.name : index.shortName(b);
      const w = ctx.measureText(text).width;
      const x = centred(x0, x1, w);
      const row = fits(bookRows, x - w / 2 - 4, x + w / 2 + 4);
      if (row === -1) continue;
      bookRows[row].push([x - w / 2 - 4, x + w / 2 + 4]);
      books.push({ text, x, y: L.labelY + row * 16, book: b });
    }

    // Two group rows. A bracket sits just above its own row's text, so texts collide
    // with texts and brackets with brackets, and a row-1 bracket mustn't cross row-0 text.
    const textRows = [[], []], bracketRows = [[], []];

    const shown = new Set(books.map((l) => l.book));
    const groups = [];
    for (const sec of sections()) {
      const names = GROUP_NAMES[sec.section];
      if (!names || sec.books.filter((b) => !shown.has(b)).length < 2) continue;
      const last = sec.books.at(-1);
      const [x0, x1] = span(sec.books[0].firstChapter, last.firstChapter + last.chapters - 1);
      // Prefer the longest name that fits within the section; if none does, the
      // shortest, so the text spills as little as possible past the section's ends.
      const fitsSpan = (t) => ctx.measureText(t).width <= x1 - x0;
      const ordered = [...names.filter(fitsSpan), ...names.filter((t) => !fitsSpan(t)).reverse()];
      for (const text of ordered) {
        const w = ctx.measureText(text).width;
        const x = centred(x0, x1, w);
        const textBox = [x - w / 2 - 4, x + w / 2 + 4], bracket = [x0 + 1, x1 - 1];
        const row = [0, 1].find(
          (r) =>
            fits([textRows[r]], ...textBox) === 0 &&
            fits([bracketRows[r]], ...bracket) === 0 &&
            (r === 0 || fits([textRows[0].map(([a, z]) => [a + 4, z - 4])], ...bracket) === 0),
        );
        if (row === undefined) continue;
        textRows[row].push(textBox);
        bracketRows[row].push(bracket);
        groups.push({ text, x, x0, x1, y: L.groupY + row * 18, books: sec.books });
        break;
      }
    }
    if (import.meta.env.DEV) checkLabels(L, books, groups, ctx, span);
    return { books, groups };
  }

  // Dev-only guard: every label sits under its own section. A book label's centre and
  // a group label's centre and bracket must lie within the section's span; text that
  // overhangs the span's edge is listed separately. Results also go on
  // window.__labelCheck for the Playwright checks.
  function checkLabels(L, bookLabels, groupLabels, ctx, span) {
    const runs = sections().map((sec) => ({ ...sec, span: span(sec.books[0].firstChapter, sec.books.at(-1).firstChapter + sec.books.at(-1).chapters - 1) }));
    const runOf = (b) => runs.find((r) => r.books.includes(b));
    const bad = [], overhang = [];
    const check = (text, x, run, font, extra = true) => {
      const [lo, hi] = run.span;
      const w = ((ctx.font = font), ctx.measureText(text).width);
      if (x < lo || x > hi || !extra) bad.push(`${text} (${run.section})`);
      else if (x - w / 2 < lo - 0.5 || x + w / 2 > hi + 0.5) {
        overhang.push(`${text} (${run.section}) ${Math.max(lo - (x - w / 2), x + w / 2 - hi).toFixed(1)}px`);
      }
    };
    for (const l of bookLabels) check(l.text, l.x, runOf(l.book), labelFont());
    for (const g of groupLabels) {
      const run = runOf(g.books[0]);
      check(g.text, g.x, run, `italic ${labelFont()}`, g.x0 >= run.span[0] - 0.5 && g.x1 <= run.span[1] + 0.5);
    }
    window.__labelCheck = { view: 'arcs', W: L.W, labels: bookLabels.length + groupLabels.length, groups: groupLabels.map((g) => g.text), bad, overhang };
    if (bad.length) console.error(`Arc labels outside their section at ${L.W}px: ${bad.join(', ')}`);
  }

  // Runs of books in the same section and Testament, in canonical order.
  function sections() {
    const runs = [];
    for (const b of index.books) {
      const prev = runs.at(-1);
      if (prev && prev.section === b.section && prev.testament === b.testament) prev.books.push(b);
      else runs.push({ section: b.section, testament: b.testament, books: [b] });
    }
    return runs;
  }

  // --- Drawing -------------------------------------------------------------------
  const labelFont = (weight = 400) => `${weight} 12px ${themeColor('--font-ui')}`;

  function sizeCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(L.W * dpr);
    canvas.height = Math.round(L.H * dpr);
    canvas.style.width = `${L.W}px`;
    canvas.style.height = `${L.H}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function addArc(ctx, [a, b]) {
    const x1 = L.x(a), x2 = L.x(b);
    const rx = (x2 - x1) / 2;
    ctx.moveTo(x1, L.axisY);
    ctx.ellipse(x1 + rx, L.axisY, rx, Math.max(rx * L.ry, MIN_ARC_H), 0, Math.PI, 2 * Math.PI);
  }

  // Overlap grows with the number of arcs, so opacity falls with it: a filtered
  // view isn't washed out and the full set doesn't saturate. Additive blending
  // (dark mode) saturates sooner, so it gets less.
  const arcAlpha = (n) => Math.min(0.45, Math.max(0.015, (isDark() ? 500 : 800) / Math.max(n, 1)));

  // Light mode multiplies arcs onto the paper. Multiplying each stroke is very slow
  // in Chrome (each one re-reads the canvas), so arcs build up on this transparent
  // layer with normal blending and the layer is multiplied onto the paper once.
  const scratch = document.createElement('canvas');

  function drawLayer(ctx, colors, dim) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.paper;
    ctx.fillRect(0, 0, L.W, L.H);

    // Arcs build up where they overlap: additive on dark paper, multiply on light.
    const dark = isDark();
    const target = dim || dark ? ctx : sizeCanvas(scratch);
    ctx.globalCompositeOperation = dark ? 'lighter' : 'multiply';
    if (target !== ctx) target.globalCompositeOperation = 'source-over';
    drawArcs(target, colors, dim);
    if (target !== ctx) ctx.drawImage(scratch, 0, 0, L.W, L.H);

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    drawAxis(ctx, colors, dim);
  }

  function drawArcs(ctx, colors, dim) {
    ctx.globalAlpha = dim ? (isDark() ? 0.3 : 0.5) : arcAlpha(visible.length);
    ctx.lineWidth = 1;
    if (dim) {
      // One stroke for the lot: a flat grey wash, no build-up needed.
      ctx.beginPath();
      for (const link of visible) addArc(ctx, link);
      ctx.strokeStyle = colors.dim;
      ctx.stroke();
    } else {
      // One stroke per arc: arcs in a single path are rasterised as one shape,
      // so overlaps wouldn't build up.
      for (const link of visible) {
        const aNT = link[0] >= ntStart, bNT = link[1] >= ntStart;
        if (aNT === bNT) {
          ctx.strokeStyle = aNT ? colors.nt : colors.ot;
        } else {
          // OT↔NT arcs always run left (OT) to right (NT): lapis fading into gold.
          const g = ctx.createLinearGradient(L.x(link[0]), 0, L.x(link[1]), 0);
          g.addColorStop(0, colors.ot);
          g.addColorStop(1, colors.nt);
          ctx.strokeStyle = g;
        }
        ctx.beginPath();
        addArc(ctx, link);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function barRect(c) {
    const w = Math.max(L.step - (L.step > 2 ? 0.5 : 0), 0.75);
    const hgt = Math.max(1.5, (chapters[c].verses / L.maxVerses) * BAR_MAX);
    return [L.x(c) - w / 2, L.barTop, w, hgt];
  }

  function drawAxis(ctx, colors, dim) {
    // Chapter bars, hanging from the axis
    const inFilter = (c) => !book || (c >= book.firstChapter && c < book.firstChapter + book.chapters);
    for (let c = 0; c < N; c++) {
      ctx.fillStyle = dim || !inFilter(c) ? colors.dim : colors.muted;
      ctx.fillRect(...barRect(c));
    }
    // Book boundaries, between the bars and the labels
    ctx.fillStyle = colors.rule;
    for (const b of index.books) {
      ctx.fillRect(Math.round(L.x(b.firstChapter) - L.step / 2), L.barTop + BAR_MAX + 1, 1, 4);
    }
    // Testament divider
    ctx.fillStyle = colors.muted;
    ctx.fillRect(Math.round(L.dividerX), L.axisY - 6, 1, L.labelY - L.axisY + 22);

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    for (const label of L.labels.books) {
      const selected = book === label.book;
      ctx.font = labelFont(selected ? 700 : 400);
      ctx.fillStyle = selected ? colors.ink : colors.muted;
      ctx.fillText(label.text, label.x, label.y);
    }
    // Group labels in italics under a bracket spanning the section's books
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1;
    for (const label of L.labels.groups) {
      const y = label.y - 13.5, x0 = Math.round(label.x0) + 0.5, x1 = Math.round(label.x1) - 0.5;
      ctx.beginPath();
      ctx.moveTo(x0, y - 3);
      ctx.lineTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.lineTo(x1, y - 3);
      ctx.stroke();
      const selected = book && label.books.includes(book);
      ctx.font = `italic ${labelFont(selected ? 700 : 400)}`;
      ctx.fillStyle = selected ? colors.ink : colors.muted;
      ctx.fillText(label.text, label.x, label.y);
    }
    // Testament names sit in the chart's empty top corners, over their halves.
    ctx.font = labelFont(700);
    ctx.fillStyle = colors.muted;
    ctx.textAlign = 'left';
    ctx.fillText('Old Testament', PAD_X, 14);
    ctx.textAlign = 'right';
    ctx.fillText('New Testament', L.W - PAD_X, 14);
  }

  function readColors() {
    return {
      paper: themeColor('--paper'),
      ink: themeColor('--ink'),
      muted: themeColor('--ink-muted'),
      rule: themeColor('--rule'),
      dim: themeColor('--dim'),
      ot: themeColor('--arc-ot'),
      nt: themeColor('--arc-nt'),
      select: themeColor('--select'),
    };
  }

  let colors;
  let dimStale = true;
  // Redraws the colour layer, and the dim layer unless `dim` is false (while the
  // slider is dragged; it's drawn when the drag ends or on the next hover).
  // Only on filter, size or theme changes.
  function drawAll({ dim = true } = {}) {
    performance.mark('arcs-draw-start');
    colors = readColors();
    stack.style.width = `${L.W}px`;
    stack.style.height = `${L.H}px`;
    drawLayer(sizeCanvas(baseCanvas), colors, false);
    dimStale = true;
    if (dim) drawDim();
    sizeCanvas(hiCanvas);
    performance.measure('arcs-draw', 'arcs-draw-start');
    drawHighlight();
  }

  function drawDim() {
    drawLayer(sizeCanvas(dimCanvas), colors, true);
    dimStale = false;
  }

  // The only drawing that happens on hover: the hovered chapter's arcs in vermilion.
  function drawHighlight() {
    const ctx = hiCanvas.getContext('2d');
    ctx.clearRect(0, 0, L.W, L.H);
    dimCanvas.hidden = hovered < 0;
    if (hovered < 0) return;
    if (dimStale) drawDim();
    const links = byChapter[hovered];
    ctx.globalAlpha = Math.min(0.85, Math.max(0.35, 8 / Math.sqrt(Math.max(links.length, 1))));
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = colors.select;
    ctx.beginPath();
    for (const link of links) addArc(ctx, link);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Linked chapters' bars come back to full colour; the hovered one turns vermilion.
    ctx.fillStyle = colors.muted;
    for (const [a, b] of links) ctx.fillRect(...barRect(a === hovered ? b : a));
    ctx.fillStyle = colors.select;
    const [bx, by, bw, bh] = barRect(hovered);
    ctx.fillRect(bx - 0.5, by, Math.max(bw + 1, 2), bh);
    ctx.fillRect(L.x(hovered) - 4, L.axisY - 1, 8, 2);
  }

  // --- Interaction -------------------------------------------------------------------
  function chapterAtX(px) {
    const shifted = px > L.dividerX ? px - TESTAMENT_GAP : px;
    return Math.min(N - 1, Math.max(0, Math.floor((shifted - PAD_X) / L.step)));
  }

  function select(c, { pin = false, announce = false } = {}) {
    pinned = pin;
    if (c === hovered) return;
    hovered = c;
    drawHighlight();
    if (c < 0) {
      hidePreview();
      return;
    }
    const ch = chapters[c];
    const n = byChapter[c].length;
    const links = n === 0 ? 'No links' : `${n.toLocaleString('en')} ${n === 1 ? 'link' : 'links'}`;
    const touch = lastPointer === 'touch' && pin;
    const action = touch ? 'Tap again to read it.' : announce ? 'Press Enter to read it.' : 'Click to read it.';
    const note = `${links} at ${minVotes}+ votes${book ? ` touching ${book.name}` : ''}. ${action}`;
    // The popover anchors to a full-height marker, so it opens above or below the
    // chart rather than over the highlighted arcs.
    marker.style.left = `${L.x(c)}px`;
    marker.style.height = `${L.H}px`;
    showPreview(marker, index.chapterLabel(ch), note);
    if (announce) live.textContent = `${index.chapterLabel(ch)}: ${links.toLowerCase()}.`;
  }

  const open = (c) => {
    location.hash = `#/verse/${index.osis(chapters[c].firstId)}`;
  };

  stack.addEventListener('pointerdown', (e) => {
    lastPointer = e.pointerType;
  });
  stack.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    lastPointer = 'mouse';
    select(chapterAtX(e.clientX - stack.getBoundingClientRect().left));
  });
  stack.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !pinned) select(-1);
  });
  // A click (not fired after a scroll drag) opens the chapter. On touch the first
  // tap selects it and a second tap on the same chapter opens it.
  stack.addEventListener('click', (e) => {
    const c = chapterAtX(e.clientX - stack.getBoundingClientRect().left);
    if (lastPointer === 'touch' && !(pinned && c === hovered)) select(c, { pin: true });
    else open(c);
  });
  // Tapping outside the chart clears a tapped selection.
  const onDocPointer = (e) => {
    if (!stack.isConnected) return document.removeEventListener('pointerdown', onDocPointer);
    if (pinned && !stack.contains(e.target) && !e.target.closest?.('.preview')) select(-1);
  };
  document.addEventListener('pointerdown', onDocPointer);
  // The popover is positioned for the current scroll, so drop it when the chart scrolls.
  scroller.addEventListener('scroll', () => {
    if (hovered >= 0 && document.activeElement !== scroller) select(-1);
  });

  // Keyboard: arrows move by chapter, Page Up/Down by book, Enter reads.
  scroller.addEventListener('focus', () => {
    // Only for keyboard focus; a click also focuses the scroller.
    if (hovered < 0 && scroller.matches(':focus-visible')) select(book?.firstChapter ?? 0, { pin: true, announce: true });
  });
  scroller.addEventListener('blur', () => select(-1));
  scroller.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    let c = Math.max(hovered, 0);
    const bookOf = (i) => chapters[i].book;
    switch (e.key) {
      case 'ArrowRight': c = Math.min(N - 1, c + 1); break;
      case 'ArrowLeft': c = Math.max(0, c - 1); break;
      case 'PageDown': {
        const b = index.books[bookOf(c).index + 1];
        if (b) c = b.firstChapter;
        break;
      }
      case 'PageUp': {
        const b = bookOf(c);
        c = c > b.firstChapter ? b.firstChapter : index.books[b.index - 1]?.firstChapter ?? 0;
        break;
      }
      case 'Home': c = 0; break;
      case 'End': c = N - 1; break;
      case 'Enter':
        if (hovered >= 0) open(hovered);
        return;
      case 'Escape':
        select(-1);
        return;
      default:
        return;
    }
    e.preventDefault();
    scrollIntoView(c);
    select(c, { pin: true, announce: true });
  });

  function scrollIntoView(c) {
    const x = L.x(c), margin = 48;
    if (x < scroller.scrollLeft + margin) scroller.scrollLeft = x - margin;
    else if (x > scroller.scrollLeft + scroller.clientWidth - margin) scroller.scrollLeft = x - scroller.clientWidth + margin;
  }

  // While the slider is dragged the count updates on every input, but the arcs
  // redraw at most once per frame: a frame is only requested when none is pending,
  // so slow draws drop intermediate values instead of queueing them. The drag's
  // end ('change') always redraws the final value, dim layer included.
  let drawnKey = null;
  let framePending = false;
  const filterKey = () => `${minVotes}|${book?.index ?? ''}`;

  function redraw({ final }) {
    if (filterKey() === drawnKey) {
      if (final && dimStale) drawDim();
      return;
    }
    const keep = pinned ? hovered : -1;
    select(-1);
    filter();
    drawAll({ dim: final });
    drawnKey = filterKey();
    if (keep >= 0) select(keep, { pin: true });
  }

  slider.addEventListener('input', () => {
    minVotes = Number(slider.value);
    showCount();
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      redraw({ final: false });
    });
  });
  slider.addEventListener('change', () => {
    minVotes = Number(slider.value);
    redraw({ final: true });
    writeQuery(minVotes, book);
  });
  bookSelect.addEventListener('change', () => {
    book = bookSelect.value === '' ? null : index.books[Number(bookSelect.value)];
    redraw({ final: true });
    writeQuery(minVotes, book);
  });

  const onTheme = () => {
    if (!stack.isConnected) return window.removeEventListener('themechange', onTheme);
    drawAll();
  };
  window.addEventListener('themechange', onTheme);

  // Re-layout when the available width changes (only matters when the chart fits the page).
  let resizeTimer;
  const observer = new ResizeObserver(() => {
    if (!stack.isConnected) return observer.disconnect();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const narrow = scroller.clientWidth < NARROW;
      if (narrow && L.narrow) return;
      if (!narrow && !L.narrow && Math.abs(scroller.clientWidth - L.W) < 2) return;
      select(-1);
      L = layout();
      drawAll();
      updateHint();
    }, 150);
  });

  function updateHint() {
    hint.textContent = L.narrow
      ? 'Scroll sideways to see the whole Bible. Tap a chapter to see its links, and tap it again to read it.'
      : 'Hover over a chapter to see its links, and click to read it.';
  }

  filter();
  L = layout();
  drawAll();
  drawnKey = filterKey();
  updateHint();
  observer.observe(scroller);
}
