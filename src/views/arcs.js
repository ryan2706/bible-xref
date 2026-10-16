// Arc diagram: all 1,189 chapters on one axis, with an arc for each pair of
// chapters that cross-reference each other (overview.json), drawn on canvas.
//
// Three stacked canvases: the arcs in colour, the same arcs in --dim, and a
// highlight layer. The first two are drawn only when the filter, size or theme
// changes; hovering just shows the dim layer and redraws the highlight layer.
import { h } from '../dom.js';
import { loadBooks, loadOverview } from '../data.js';
import { getIndex } from '../refs.js';
import { themeColor, isDark, GROUP_NAMES } from '../theme.js';
import { showPreview, hidePreview } from '../preview.js';
import { votesHelp } from '../votes.js';
import { viewHeader } from '../view-header.js';
import { controlBar, control, controlStatus, toggleSwitch } from '../controls.js';
import { legend as makeLegend } from '../legend.js';

const DEFAULT_VOTES = 50;
const MAX_VOTES = 500;
const VOTES_STEP = 5;
const NARROW = 720; // below this the chapter is described inline, under the controls
// A chapter narrower than this can't be picked by a tap: taps on the fitted chart select
// a whole book instead, and zooming in widens the chart to give each chapter this much.
const MIN_TAP = 4;
const PAD_X = 6;
const TESTAMENT_GAP = 10;
const BAR_MAX = 32; // px for the longest chapter (Psalm 119)
const MAX_DPR = 2; // caps canvas memory on phones
const MAX_CANVAS_PX = 4e6; // and so does this, per canvas, for the wide zoomed-in chart
const MIN_ARC_H = 9; // px, so links between neighbouring chapters clear the axis marker
const NOTES_KEY = 'arcs-notes-hidden';

function storedNotesHidden() {
  try {
    return localStorage.getItem(NOTES_KEY) === '1';
  } catch {
    return false;
  }
}

// Filters and the selected chapter live in the hash so views can be shared:
// #/arcs?min=30&book=Isa&ch=Isa.53
function readQuery(query, index, minVotes) {
  const params = new URLSearchParams(query);
  const min = Number(params.get('min'));
  const abbr = params.get('book')?.toLowerCase();
  return {
    min: Number.isFinite(min) && min > 0 ? Math.min(MAX_VOTES, Math.max(minVotes, Math.round(min / VOTES_STEP) * VOTES_STEP)) : DEFAULT_VOTES,
    book: index.books.find((b) => b.abbr.toLowerCase() === abbr) ?? null,
    ch: readChapter(params.get('ch'), index),
    zoom: params.get('zoom') === '1',
  };
}

// "Isa.53" -> chapter index into index.chapters, or -1 if it isn't a real chapter.
function readChapter(value, index) {
  const m = /^(.+)\.(\d+)$/.exec(value ?? '');
  if (!m) return -1;
  const book = index.books.find((b) => b.abbr.toLowerCase() === m[1].toLowerCase());
  const chapter = Number(m[2]);
  return book && chapter >= 1 && chapter <= book.chapters ? book.firstChapter + chapter - 1 : -1;
}

function writeQuery(min, book, zoom, chapter) {
  const params = new URLSearchParams();
  if (min !== DEFAULT_VOTES) params.set('min', String(min));
  if (book) params.set('book', book.abbr);
  if (zoom) params.set('zoom', '1');
  if (chapter) params.set('ch', `${chapter.book.abbr}.${chapter.chapter}`);
  const query = params.toString();
  // Never over another view's URL (e.g. a late event as this view is being replaced).
  if (!location.hash.startsWith('#/arcs')) return;
  // replaceState doesn't fire hashchange, so the view isn't rebuilt.
  history.replaceState(null, '', query ? `#/arcs?${query}` : '#/arcs');
}

export async function renderArcs(container, [query = '']) {
  // The interaction hint depends on the chart's width, so buildChart fills it in.
  const hint = h('p', {});
  const { header, title } = viewHeader(
    'Chapter arcs',
    'Every chapter of the Bible on one line, joined by its cross-references.',
    [
      'Each arc joins two chapters that cross-reference each other. Lapis arcs stay within the Old Testament, gold arcs within the New, and arcs between the Testaments turn from lapis to gold at their highest point. Where many arcs overlap the colour deepens, so dense bands show the most connected passages.',
      'Bars under the line show how long each chapter is. Numbered markers on the line point to the notes.',
      hint,
      'Lower “Minimum votes” to see more links, or choose a book to see only the links that touch it.',
    ],
  );
  const figure = h('div', { class: 'arcs-figure' }, h('p', { class: 'status' }, 'Loading cross-references…'));
  container.replaceChildren(header, figure);
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
  buildChart(figure, hint, index, overview, readQuery(query, index, overview.minVotes));
}

function buildChart(figure, hint, index, overview, initial) {
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
  const count = controlStatus();
  const notesSwitch = toggleSwitch('arcs-notes', !storedNotesHidden());
  const notesToggle = notesSwitch.input;
  // Phones open on the whole Bible fitted to the screen; this switches to the wider,
  // sideways-scrolling chart and back. Shown only where the chart would scroll.
  const zoomButton = h('button', { type: 'button', class: 'arcs-zoom' });
  const controls = controlBar(
    control({ label: 'Minimum votes', for: 'arcs-votes', help: votesHelp(), body: [slider, votesOut] }),
    control({ label: 'Book', for: 'arcs-book', body: bookSelect }),
    control({ label: 'Show notes', for: 'arcs-notes', body: notesSwitch.body }),
    zoomButton,
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
  const legend = makeLegend([
    ['ot', 'Old Testament'],
    ['nt', 'New Testament'],
    ['cross', 'Between the Testaments'],
    ['current', 'Selected chapter'],
  ]);
  // Notes on what's worth seeing, numbered like their markers on the chart.
  const notesList = h('ol', { class: 'arcs-notes', 'aria-label': 'Notes on the chart' });
  const markers = h('div', { class: 'arcs-markers', 'aria-hidden': 'true' });
  stack.append(markers);
  // On phones a chapter opened from a link is described here, under the controls,
  // rather than in a popover that would cover them.
  const chapterLine = h('p', { class: 'arcs-chapter' });
  chapterLine.hidden = true;
  figure.replaceChildren(controls, notesList, chapterLine, scroller, live, legend);

  // --- State ---------------------------------------------------------------------
  let minVotes = initial.min;
  let book = initial.book; // filter: only links touching this book
  let visible = []; // links passing the filter
  let byChapter = []; // chapter -> visible links touching it
  let L = null; // layout
  let hovered = -1;
  let pinned = false; // selected by tap, keyboard or the URL rather than mouse hover
  let sharedCh = -1; // the pinned chapter as written to the URL
  let ignoreScroll = false; // the next scroll event is ours (centring a chapter), not the user's
  let inline = false; // the selected chapter is described in chapterLine, not the popover
  let lastPointer = 'mouse';
  let zoom = initial.zoom; // touch screens: the wide, scrolling chart instead of the fitted one
  let notes = []; // see buildNotes
  let note = -1; // the note whose arcs are highlighted
  let notePinned = false; // by a click, tap or the keyboard rather than hover
  let tapped = null; // fitted chart: the book a tap selected (chapters are too thin to tap)
  const coarse = () => matchMedia('(pointer: coarse)').matches;

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

  // A typical chapter's number of arcs (the 75th percentile of chapters with any);
  // arcs between chapters busier than this are drawn fainter.
  function densityRef() {
    const deg = byChapter.map((l) => l.length).filter((n) => n > 0).sort((a, b) => a - b);
    return deg[Math.floor(deg.length * 0.75)] ?? 1;
  }

  function layout() {
    const narrow = scroller.clientWidth < NARROW;
    const scrolls = zoom;
    const W = scrolls ? Math.ceil(2 * PAD_X + TESTAMENT_GAP + N * MIN_TAP) : scroller.clientWidth;
    const step = (W - 2 * PAD_X - TESTAMENT_GAP) / N;
    const x = (c) => PAD_X + (c + 0.5) * step + (c >= ntStart ? TESTAMENT_GAP : 0);
    const arcH = Math.round(Math.min(380, Math.max(scrolls ? 200 : 150, W * 0.33)));
    const axisY = arcH + 6;
    const barTop = axisY + 2;
    const labelY = barTop + BAR_MAX + 16; // first row of book labels (baseline)
    // The chart is wider than the page column on wide screens; its Testament labels
    // stay inside the column, lined up with the controls above.
    const columnInset = scrolls ? 0 : controls.getBoundingClientRect().left - scroller.getBoundingClientRect().left;
    const L = {
      W,
      narrow,
      scrolls,
      inset: Math.max(PAD_X, columnInset),
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
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR, Math.sqrt(MAX_CANVAS_PX / (L.W * L.H)));
    canvas.width = Math.round(L.W * dpr);
    canvas.height = Math.round(L.H * dpr);
    canvas.style.width = `${L.W}px`;
    canvas.style.height = `${L.H}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  // The arc from chapter a to b, or the part of it between two angles (π is its
  // left foot, 1.5π the apex, 2π its right foot).
  function addArc(ctx, [a, b], from = Math.PI, to = 2 * Math.PI) {
    const x1 = L.x(a), x2 = L.x(b);
    const rx = (x2 - x1) / 2, ry = Math.max(rx * L.ry, MIN_ARC_H);
    ctx.moveTo(x1 + rx + rx * Math.cos(from), L.axisY + ry * Math.sin(from));
    ctx.ellipse(x1 + rx, L.axisY, rx, ry, 0, from, to);
  }

  // Overlap grows with the number of arcs, so opacity falls with it: a filtered
  // view isn't washed out and the full set doesn't saturate.
  const arcAlpha = (n) => Math.min(0.5, Math.max(0.02, (isDark() ? 640 : 760) / Math.max(n, 1)));

  // Arcs build up with normal blending, so where many overlap the colour tends to
  // the pigment itself: never to grey-brown (multiply) or pale yellow (additive).
  function drawLayer(ctx, colors, dim) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.paper;
    ctx.fillRect(0, 0, L.W, L.H);
    drawArcs(ctx, colors, dim);
    ctx.globalAlpha = 1;
    drawAxis(ctx, colors, dim);
  }

  function drawArcs(ctx, colors, dim) {
    ctx.lineWidth = 1;
    if (dim) {
      // One stroke for the lot: a flat grey wash, no build-up needed.
      ctx.globalAlpha = isDark() ? 0.3 : 0.5;
      ctx.beginPath();
      for (const link of visible) addArc(ctx, link);
      ctx.strokeStyle = colors.dim;
      ctx.stroke();
    } else {
      // One stroke per arc: arcs in a single path are rasterised as one shape,
      // so overlaps wouldn't build up. Arcs between busy chapters (the NT letters,
      // Psalms) are fainter, so the densest areas still show single arcs rather
      // than a solid block of pigment.
      const base = arcAlpha(visible.length);
      const ref = densityRef();
      const alphaOf = ([a, b]) => Math.max(0.02, base * Math.min(1, (ref / Math.sqrt(byChapter[a].length * byChapter[b].length)) ** 0.75));
      // Arcs between the Testaments first, so the arcs within each lie on top.
      const cross = (l) => (l[0] >= ntStart) !== (l[1] >= ntStart);
      for (const link of [...visible.filter(cross), ...visible.filter((l) => !cross(l))]) {
        ctx.globalAlpha = alphaOf(link);
        if (!cross(link)) {
          ctx.strokeStyle = link[0] >= ntStart ? colors.nt : colors.ot;
          ctx.beginPath();
          addArc(ctx, link);
          ctx.stroke();
          continue;
        }
        // OT↔NT arcs always run left (OT) to right (NT): lapis up to the apex and
        // gold down from it, never a mix of the two.
        ctx.strokeStyle = colors.ot;
        ctx.beginPath();
        addArc(ctx, link, Math.PI, 1.5 * Math.PI);
        ctx.stroke();
        ctx.strokeStyle = colors.nt;
        ctx.beginPath();
        addArc(ctx, link, 1.5 * Math.PI, 2 * Math.PI);
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
    // Testament names sit in the chart's empty top corners, over their halves,
    // inside the page column.
    ctx.font = labelFont(700);
    ctx.fillStyle = colors.muted;
    ctx.textAlign = 'left';
    ctx.fillText('Old Testament', L.inset, 14);
    ctx.textAlign = 'right';
    ctx.fillText('New Testament', L.W - L.inset, 14);
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

  // The only drawing that happens on hover: the hovered chapter's arcs, or a
  // note's, in vermilion.
  function drawHighlight() {
    const ctx = hiCanvas.getContext('2d');
    ctx.clearRect(0, 0, L.W, L.H);
    const links = hovered >= 0 ? byChapter[hovered] : tapped ? bookLinks(tapped) : note >= 0 ? notes[note].links : null;
    dimCanvas.hidden = !links;
    markers.querySelectorAll('.arcs-marker-dot').forEach((m) => m.classList.toggle('is-active', Number(m.dataset.note) === note));
    if (!links) return;
    if (dimStale) drawDim();
    ctx.globalAlpha = Math.min(0.85, Math.max(0.2, 8 / Math.sqrt(Math.max(links.length, 1))));
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = colors.select;
    ctx.beginPath();
    for (const link of links) addArc(ctx, link);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (tapped) {
      // The book's span on the axis in vermilion.
      const x0 = L.x(tapped.firstChapter) - L.step / 2, x1 = L.x(tapped.firstChapter + tapped.chapters - 1) + L.step / 2;
      ctx.fillStyle = colors.select;
      ctx.fillRect(Math.min(x0, (x0 + x1) / 2 - 3), L.axisY - 1, Math.max(x1 - x0, 6), 2);
      return;
    }
    if (hovered < 0) return;
    // Linked chapters' bars come back to full colour; the hovered one turns vermilion.
    ctx.fillStyle = colors.muted;
    for (const [a, b] of links) ctx.fillRect(...barRect(a === hovered ? b : a));
    ctx.fillStyle = colors.select;
    const [bx, by, bw, bh] = barRect(hovered);
    ctx.fillRect(bx - 0.5, by, Math.max(bw + 1, 2), bh);
    ctx.fillRect(L.x(hovered) - 4, L.axisY - 1, 8, 2);
  }

  // --- Notes ---------------------------------------------------------------------------
  // Two or three things worth seeing, worked out from the arcs currently shown, so
  // the numbers follow the slider. Hidden while a book is chosen.
  const bookBy = (abbr) => index.books.find((b) => b.abbr === abbr);
  const inBook = (c, b) => c >= b.firstChapter && c < b.firstChapter + b.chapters;
  const bookMid = (b) => b.firstChapter + (b.chapters - 1) / 2;

  function buildNotes() {
    if (book || !notesToggle.checked) return [];
    const isNT = (c) => c >= ntStart;
    const sectionOfCh = (c) => chapters[c].book.section;
    const [ps, isa] = [bookBy('Ps'), bookBy('Isa')];
    const cross = visible.filter(([a, b]) => isNT(a) !== isNT(b));
    const fromPsIsa = cross.filter(([a]) => inBook(a, ps) || inBook(a, isa));

    // Arcs within each section; Paul's letters lead at every vote level we offer,
    // but only say so when it's true.
    const within = {};
    for (const [a, b] of visible) if (sectionOfCh(a) === sectionOfCh(b)) within[sectionOfCh(a)] = (within[sectionOfCh(a)] ?? 0) + 1;
    const paul = index.books.filter((b) => b.section === 'Pauline Epistles');
    const paulLinks = visible.filter(([a, b]) => sectionOfCh(a) === 'Pauline Epistles' && sectionOfCh(b) === 'Pauline Epistles');
    const paulChapters = paul.reduce((n, b) => n + b.chapters, 0);
    const most = Object.entries(within).every(([sec, n]) => sec === 'Pauline Epistles' || n < paulLinks.length);

    const synoptic = ['Matt', 'Mark', 'Luke'].map(bookBy);
    const synOf = (c) => synoptic.find((b) => inBook(c, b));
    const synLinks = visible.filter(([a, b]) => synOf(a) && synOf(b) && synOf(a) !== synOf(b));

    const n = (k) => k.toLocaleString('en');
    return [
      {
        title: 'Psalms and Isaiah',
        text: `${Math.round((100 * fromPsIsa.length) / Math.max(cross.length, 1))}% of the arcs between the Testaments start in these two books.`,
        links: fromPsIsa,
        at: [bookMid(ps), bookMid(isa)],
      },
      {
        title: 'Paul’s letters',
        text: `${n(paulLinks.length)} arcs join their ${paulChapters} chapters to one another${most ? ', more than in any other group of books' : ''}.`,
        links: paulLinks,
        at: [(paul[0].firstChapter + paul.at(-1).firstChapter + paul.at(-1).chapters - 1) / 2],
      },
      {
        title: 'Matthew, Mark and Luke',
        text: `${n(synLinks.length)} short arcs join the first three Gospels, which tell many of the same stories.`,
        links: synLinks,
        at: [bookMid(synoptic[1])],
      },
    ].filter((nt) => nt.links.length > 0);
  }

  function renderNotes() {
    const keep = notes[note]?.title;
    notes = buildNotes();
    note = notes.findIndex((nt) => nt.title === keep);
    if (note < 0) notePinned = false;
    notesList.hidden = markers.hidden = notes.length === 0;
    notesList.replaceChildren(
      ...notes.map((nt, i) => {
        const button = h(
          'button',
          { type: 'button', class: 'arcs-note', 'aria-pressed': String(notePinned && note === i) },
          h('span', { class: 'arcs-note-num', 'aria-hidden': 'true' }, String(i + 1)),
          h('span', {}, h('strong', {}, nt.title), ' ', nt.text),
        );
        button.addEventListener('mouseenter', () => !notePinned && !pinned && setNote(i));
        button.addEventListener('mouseleave', () => !notePinned && setNote(-1));
        button.addEventListener('focus', () => button.matches(':focus-visible') && !notePinned && setNote(i));
        button.addEventListener('blur', () => !notePinned && setNote(-1));
        button.addEventListener('click', () => setNote(notePinned && note === i ? -1 : i, { pin: true }));
        button.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && note >= 0) setNote(-1);
        });
        return h('li', {}, button);
      }),
    );
    placeMarkers();
  }

  // Numbered markers just above the axis, over the books each note is about.
  function placeMarkers() {
    markers.replaceChildren(
      ...notes.flatMap((nt, i) =>
        nt.at.map((c) => h('span', { class: 'arcs-marker-dot', 'data-note': String(i), style: `left: ${L.x(Math.floor(c)) + (c % 1) * L.step}px; top: ${L.axisY - 22}px` }, String(i + 1))),
      ),
    );
  }

  function setNote(i, { pin = false } = {}) {
    if (i >= 0 && hovered >= 0) select(-1);
    if (i >= 0) clearBook();
    notePinned = pin && i >= 0;
    note = i;
    notesList.querySelectorAll('.arcs-note').forEach((b, k) => b.setAttribute('aria-pressed', String(notePinned && k === i)));
    drawHighlight();
    if (i >= 0) live.textContent = `${notes[i].title}: ${notes[i].links.length.toLocaleString('en')} arcs highlighted.`;
  }

  notesToggle.addEventListener('change', () => {
    try {
      if (notesToggle.checked) localStorage.removeItem(NOTES_KEY);
      else localStorage.setItem(NOTES_KEY, '1');
    } catch {}
    if (!notesToggle.checked) setNote(-1);
    renderNotes();
  });

  // --- Zoom (touch screens) ----------------------------------------------------------------
  // Offered wherever taps are likely; kept while zoomed in (e.g. from a shared link) to zoom out.
  function updateZoom() {
    zoomButton.hidden = !(L.narrow || coarse() || zoom);
    zoomButton.textContent = zoom ? 'Show the whole Bible' : 'Zoom in';
  }

  zoomButton.addEventListener('click', () => {
    if (!zoom && tapped) return zoomInTo(tapped);
    zoom = !zoom;
    const keep = pinned ? hovered : -1;
    const keepInline = inline;
    select(-1);
    relayout();
    if (keep >= 0) {
      if (L.scrolls) centre(keep);
      select(keep, { pin: true, inline: keepInline });
    } else {
      scroller.scrollLeft = 0;
    }
    writeQuery(minVotes, book, zoom, chapters[sharedCh]);
    live.textContent = zoom ? 'Zoomed in. Scroll sideways to move through the chapters.' : 'Showing the whole Bible.';
  });

  // --- Books (fitted chart, touch) -----------------------------------------------------
  // Chapters are under MIN_TAP wide there (about 0.3px on phones, 0.8px on tablets), so a
  // tap selects the whole book, described in the inline line with a button that zooms in
  // to it, where taps pick chapters.
  function bookLinks(b) {
    const links = new Set();
    for (let c = b.firstChapter; c < b.firstChapter + b.chapters; c++) for (const l of byChapter[c]) links.add(l);
    return [...links];
  }

  function selectBook(b, { focusStep = 0 } = {}) {
    select(-1);
    if (note >= 0) setNote(-1);
    tapped = b;
    const n = bookLinks(b).length;
    const links = n === 0 ? 'no links' : `${n.toLocaleString('en')} ${n === 1 ? 'link' : 'links'}`;
    const zoomTo = h('button', { type: 'button', class: 'arcs-zoom' }, `Zoom in to ${b.name}`);
    zoomTo.addEventListener('click', () => zoomInTo(b));
    // Books of one or two chapters are under a pixel wide, so they're reached by stepping.
    const step = (d, label) => {
      const next = index.books[b.index + d];
      if (!next) return [];
      const button = h('button', { type: 'button', class: 'arcs-step', 'data-step': String(d), 'aria-label': `${d < 0 ? 'Previous' : 'Next'} book: ${next.name}` }, label(index.shortName(next)));
      button.addEventListener('click', () => selectBook(next, { focusStep: d }));
      return [button];
    };
    chapterLine.replaceChildren(
      h('strong', {}, b.name),
      `: ${links} at ${minVotes}+ votes.`,
      h('span', { class: 'arcs-chapter-actions' }, zoomTo, ...step(-1, (n) => `‹ ${n}`), ...step(1, (n) => `${n} ›`)),
    );
    chapterLine.hidden = false;
    // Stepping keeps focus on the same side's button (or the other, at either end of the Bible).
    if (focusStep) (chapterLine.querySelector(`[data-step="${focusStep}"]`) ?? chapterLine.querySelector('.arcs-step'))?.focus();
    drawHighlight();
    live.textContent = `${b.name}: ${links}.`;
  }

  function clearBook() {
    if (!tapped) return;
    tapped = null;
    chapterLine.hidden = true;
    drawHighlight();
  }

  function zoomInTo(b) {
    clearBook();
    zoom = true;
    relayout();
    centre(Math.round(b.firstChapter + (b.chapters - 1) / 2));
    writeQuery(minVotes, book, zoom, chapters[sharedCh]);
    live.textContent = `Zoomed in to ${b.name}. Tap a chapter to see its links.`;
  }

  // --- Interaction -------------------------------------------------------------------
  function chapterAtX(px) {
    const shifted = px > L.dividerX ? px - TESTAMENT_GAP : px;
    return Math.min(N - 1, Math.max(0, Math.floor((shifted - PAD_X) / L.step)));
  }

  // A pinned chapter is kept in the URL (&ch=Isa.53); hover isn't.
  function select(c, options = {}) {
    selectChapter(c, options);
    const ch = pinned && hovered >= 0 ? hovered : -1;
    if (ch === sharedCh) return;
    sharedCh = ch;
    writeQuery(minVotes, book, zoom, chapters[ch]);
  }

  function selectChapter(c, { pin = false, announce = false, inline: inlineNote = false } = {}) {
    clearBook();
    if (c >= 0 && note >= 0) setNote(-1);
    pinned = pin;
    if (c === hovered) return;
    hovered = c;
    inline = c >= 0 && inlineNote;
    chapterLine.hidden = !inline;
    drawHighlight();
    if (c < 0) {
      hidePreview();
      return;
    }
    const ch = chapters[c];
    const n = byChapter[c].length;
    const links = n === 0 ? 'No links' : `${n.toLocaleString('en')} ${n === 1 ? 'link' : 'links'}`;
    // How to open it depends on how the chapter was chosen: a tap, the keyboard, or a
    // mouse (or a link, which counts as the device's usual pointer).
    const touch = pin && (lastPointer === 'touch' || (document.activeElement !== scroller && matchMedia('(hover: none)').matches));
    const keyboard = document.activeElement === scroller;
    const action = touch ? 'Tap again to read it.' : keyboard ? 'Press Enter to read it.' : 'Click to read it.';
    const message = `${links} at ${minVotes}+ votes${book ? ` touching ${book.name}` : ''}. ${action}`;
    // The popover anchors to a full-height marker, so it opens above or below the
    // chart rather than over the highlighted arcs.
    marker.style.left = `${L.x(c)}px`;
    marker.style.height = `${L.H}px`;
    if (inline) {
      hidePreview();
      chapterLine.replaceChildren(
        h('strong', {}, index.chapterLabel(ch)),
        `: ${links.toLowerCase()} at ${minVotes}+ votes${book ? ` touching ${book.name}` : ''}. `,
        h('a', { href: `#/verse/${index.osis(ch.firstId)}` }, `Read ${index.chapterLabel(ch)}`),
      );
    } else {
      showPreview(marker, index.chapterLabel(ch), message);
    }
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
    if (notePinned) return; // a note chosen by click stays until a chapter is clicked
    select(chapterAtX(e.clientX - stack.getBoundingClientRect().left));
  });
  stack.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !pinned && !tapped) select(-1);
  });
  // A click (not fired after a scroll drag) opens the chapter. On touch the first
  // tap selects it and a second tap on the same chapter opens it.
  stack.addEventListener('click', (e) => {
    const c = chapterAtX(e.clientX - stack.getBoundingClientRect().left);
    if (lastPointer === 'touch' && L.step < MIN_TAP) return selectBook(chapters[c].book);
    // With a note's arcs showing, the first click switches to the chapter's arcs.
    if (notePinned) return select(c, { pin: lastPointer === 'touch' });
    if (lastPointer === 'touch' && !(pinned && c === hovered)) select(c, { pin: true });
    else open(c);
  });
  // Tapping outside the chart clears a tapped selection.
  const onDocPointer = (e) => {
    if (!stack.isConnected) return document.removeEventListener('pointerdown', onDocPointer);
    if ((pinned || tapped) && !stack.contains(e.target) && !e.target.closest?.('.preview, .arcs-chapter, .arcs-zoom')) select(-1);
  };
  document.addEventListener('pointerdown', onDocPointer);
  // The popover is positioned for the current scroll, so drop it when the chart scrolls.
  scroller.addEventListener('scroll', () => {
    if (ignoreScroll) return void (ignoreScroll = false);
    // (The inline description doesn't depend on scroll position, so it stays.)
    if (hovered >= 0 && !inline && document.activeElement !== scroller) select(-1);
  });

  // Keyboard: arrows move by chapter, Page Up/Down by book, Enter reads.
  scroller.addEventListener('focus', () => {
    // Only for keyboard focus; a click also focuses the scroller.
    if (hovered < 0 && scroller.matches(':focus-visible')) select(book?.firstChapter ?? 0, { pin: true, announce: true });
  });
  // (Zooming keeps the chapter, so focus moving to the zoom button doesn't clear it,
  // and a tapped book stays until a tap elsewhere.)
  // (Opening a chapter removes the focused chart, which also blurs it: nothing to clear then.)
  scroller.addEventListener('blur', (e) => scroller.isConnected && e.relatedTarget !== zoomButton && !tapped && select(-1));
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
    const keepInline = inline;
    const keepBook = tapped;
    select(-1);
    filter();
    renderNotes();
    drawAll({ dim: final });
    drawnKey = filterKey();
    if (keepBook) selectBook(keepBook);
    if (keep >= 0) select(keep, { pin: true, inline: keepInline });
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
    writeQuery(minVotes, book, zoom, chapters[sharedCh]);
  });
  bookSelect.addEventListener('change', () => {
    book = bookSelect.value === '' ? null : index.books[Number(bookSelect.value)];
    redraw({ final: true });
    writeQuery(minVotes, book, zoom, chapters[sharedCh]);
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
      if (!stack.isConnected) return observer.disconnect(); // navigated away meanwhile
      const narrow = scroller.clientWidth < NARROW;
      if (narrow !== L.narrow) {
        select(-1);
        return relayout();
      }
      // The zoomed-in chart has a fixed width; the fitted one follows the page.
      if (L.scrolls || Math.abs(scroller.clientWidth - L.W) < 2) return;
      select(-1);
      relayout();
    }, 150);
  });

  function relayout() {
    L = layout();
    drawAll();
    placeMarkers();
    updateHint();
    updateZoom();
  }

  function updateHint() {
    hint.textContent = !L.narrow && !coarse()
      ? 'Hover over a chapter to see its links, and click to read it.'
      : L.step >= MIN_TAP
        ? 'Scroll sideways to move through the Bible. Tap a chapter to see its links, and tap it again to read it.'
        : 'Tap a book to see its links, then zoom in to it to pick single chapters.';
  }

  filter();
  L = layout();
  renderNotes();
  drawAll();
  drawnKey = filterKey();
  updateHint();
  updateZoom();
  observer.observe(scroller);

  // A chapter in the URL (e.g. from a verse's "See this chapter on the arc diagram")
  // starts highlighted, centred if the chart scrolls.
  if (initial.ch >= 0) {
    centre(initial.ch);
    // Phones describe it inline; wider screens use the popover.
    select(initial.ch, { pin: true, announce: true, inline: L.narrow });
  }

  function centre(c) {
    const target = Math.max(0, Math.round(L.x(c) - scroller.clientWidth / 2));
    if (scroller.scrollWidth > scroller.clientWidth && target !== scroller.scrollLeft) {
      ignoreScroll = true;
      scroller.scrollLeft = target;
    }
  }
}
