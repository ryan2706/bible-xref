# Bible Cross-Reference Explorer

## Goal

A static website, hosted on GitHub Pages at https://ryan2706.github.io/bible-xref/,
that visualizes Bible cross-references so people can see how verses connect
across the whole Bible.

## Views

1. **Verse explorer**: search plus a force-directed network graph of a verse's cross-references.
2. **Arc diagram**: every chapter of the Bible, with cross-references drawn as arcs on `<canvas>`.
3. **Chord diagram**: book-to-book cross-reference flows.
4. **About**: what the site shows, data sources and how to read the diagrams.

## Commands

- `npm run dev`: regenerate data, then start the Vite dev server (http://localhost:5173/bible-xref/)
- `npm run build`: regenerate data, then production build into `dist/`
- `npm run preview`: serve the production build locally
- `npm run build:data`: regenerate the static JSON in `public/data/` (prints a size table)
- `npm run build:og`: redraw `public/og-image.png`, the 1200×630 link-preview image (run by `prebuild` after
  `build:data`; needs Playwright's Chromium, and Google Fonts for the type, falling back with a warning offline)
- `npm test`: production build, then every Playwright test in `tests/` against it, served by `vite preview` at
  http://localhost:4173/bible-xref/ (~20 s). `npx playwright test` reruns the tests without rebuilding;
  `npx playwright test smoke` runs one file.

## Code map

Shared modules. Reuse these in new views instead of re-implementing them.

- `src/data.js`: every data fetch. Builds URLs from `BASE_URL` and caches each file's
  promise in memory, so a book is downloaded once. `loadBooks`, `loadVerses(abbr)`,
  `loadXrefs(abbr)`, `loadOverview()`, `loadBookMatrix()`, `loadThumb(name)` (SVG markup as text),
  `getVerseText(index, id)`. Add the
  loader for `search.json` here.
- `src/refs.js`: verse IDs and references. `getIndex(books)` (memoised) gives `locate(id)`,
  `label(id, short)`, `rangeLabel(start, end, short)`, `osis(id)`, `idOf(book, ch, v)`,
  `parseOsis("John.3.16")`, `testament(id)`, `shortName(book)`, book autocomplete, and
  `chapters` (every chapter in canonical order, indexed like overview.json) with `chapterLabel(ch)`. `parseTypedRef(text, index)`
  parses what people type ("jn 3 16", "1 John 4:8", "psalm 23 1"). Never format or parse references by hand:
  a single psalm is "Psalm 23:1" / "Psalm 119" in `label`, `rangeLabel` and `chapterLabel`, while `book.name`
  ("Psalms") is for the book as a whole (book labels, menus, the chord diagram).
- `src/preview.js`: `attachPreview(el, index, id, title, { tapTwice })` adds the verse-text popover on
  hover/focus (one shared, dismissable popover). Works on HTML and SVG elements. Pass `tapTwice: true` for links
  inside charts (first tap previews, second opens); text links leave it off and open on a single tap.
  `showPreview(anchor, title, note)` / `hidePreview()` drive the same popover by hand (e.g. for canvas);
  `trim(text, max)` shortens verse text at a word break with " …" (use it, never a local copy);
  `note` is a string or an element (e.g. a list). `attachNote(button, title, note)` opens a fixed note on hover,
  focus or tap.
- `src/votes.js`: votes explained one way everywhere. `VOTES_HELP` (the wording), `votesText(n)` ("986 votes"),
  `votesEl(n)` (the same as a span, unit quieter) and `votesHelp()` (the "?" button; put one by the first use of
  votes on each view).
- `src/theme.js`: light/dark toggle, `isDark()`, and a `themechange` window event. The button's label names
  the theme it switches to ("Switch to light"); CSS picks the visible half so it is right from first paint, and a
  click announces "Dark theme on" through the header's `.theme-status` live region. Between 721 and 1099px the header
  tightens to stay on one line: the button shows only its icon (label kept for screen readers, `title` tooltip) and
  `search.js` shortens the placeholder.
  `themeColor('--arc-ot')` reads a colour token for canvas drawing. It re-exports `SECTIONS` and
  `sectionOf(book)` (the 8 chord-diagram sections, their order and colour tokens) and `GROUP_NAMES` (names for a run of
  books labelled together, longest first, keyed by books.json section or chord section; one rule for short forms:
  whole words, never clipped with a full stop, so "Minor" like "Paul" and "General", not "Minor Proph."; both charts
  use it) from `src/sections.js`, which has
  no DOM code so the data build can import it too. Likewise `src/links.js` (`strongestLinks`: the 15 verses a verse's
  graph draws, up to 8 it references and 7 that reference it by votes, unused places going to the other side; a
  verse linked both ways takes one place and keeps both links) and `src/graph-layout.js` (`radialLayout`: places those verses round a true circle, centred across the
  graph with the verse at its centre, as large as the width (labels on both sides) and `maxHeight` allow, in
  canonical order: Genesis lower left, OT up the left, NT down the right, Revelation lower right, each verse kept on
  its testament's half and never shifted or squashed when the links are one-sided; it nudges crowded nodes apart in
  order (balancing pushes, then sweeps for long jams) until no label overlaps, and reports any that still do in
  `clashing`; labels outside the circle, edges inside; "Genesis" and "Revelation" hang from ticks dropped from the
  ends, on their own row under the gap, where no verse label reaches) are shared by `verse-graph.js` and the
  thumbnail build.
- `src/dom.js`: `h(tag, attrs, ...children)`. Children are set as text, never parsed as HTML.
- `src/view-header.js`: `viewHeader(title, intro, howTo)` returns `{ header, title, guide }`: the h1, a one-sentence
  `.view-intro`, and a `<details class="how-to">` "How to read this", open on a visitor's first visit to the site and
  then as they last left it, across views and visits (localStorage `how-to-open`: `'1'` open, `'0'` closed, missing on
  a first visit). Every view starts with it, Verse included; per-view hints (what colours mean, how to
  hover/tap, keyboard keys) go in `howTo`, not in loose paragraphs around the chart. A `howTo` item is a paragraph's
  text, an array of its children, or an element (keep a reference to update it, as Arcs and Books do for the
  width-dependent hint).
- `src/controls.js`: chart controls, the same on every view. `controlBar(...items)`, `control({ label, for, help, body })`
  (label row with an optional "?" over a control row, so all labels share a baseline), `toggleSwitch(id, checked)`
  (`{ input, body }`: a `role="switch"` checkbox styled as an ink switch with an On/Off word; use it, never a bare
  checkbox) and `controlStatus()` (a live count in the control row, e.g. "8,404 arcs").
- `src/legend.js`: `legend(items, label)`: one wrapping row of `[swatch, text]` pairs right under the chart, the same
  at every width. A swatch is `'ot'`, `'nt'`, `'cross'`, `'current'`, a colour token (`'--sec-law'`) or an element
  (the verse graph's edge swatches); falsy items are skipped. Keep labels short ("Old Testament", "Selected chapter")
  so the row wraps the same way on phones.
- `src/version.js`: `kjvMark(attrs)`, "KJV" in small caps linking to About → Credits (`#/about?s=credits`). It sits
  beside the reference in the Verse view's heading and in verse-text previews (`preview.js` adds it when the popover
  shows verse text, out of the tab order), not in notes or chart previews.
- Footer (`index.html`): one line, the OpenBible.info credit (CC BY 4.0) and a link to About, which has the full
  credits.
- `src/router.js` + `src/main.js`: hash routes (see the New view checklist below). A new view needs a route pattern here and an
  entry in the `views` map in `main.js`; the nav link's `data-view` must match. Each route part is decoded exactly
  once: path parts by the router, query parts (marked `query: true`) left encoded for `URLSearchParams`; a malformed
  escape anywhere shows the not-found page. After navigation `main.js` moves focus to the new h1 only if no later
  navigation started and focus is still where the navigation left it (the link or button used, or the page).
- `src/search.js`: header search combobox (reference lookup only; free-text search will
  lazy-load `search.json`).
- `src/views/`: `verse.js` (the verse text and the cross-references load independently, and a failed one shows
  `loadError(message, retry)`, an error with a Retry button, in its own place while the other stays; the h1 reads
  "Loading…" until books.json is in, never a hand-formatted reference; the verse text and the graph sit in
  `.verse-main`, which is `display: contents` below 1100px (text and graph left, lists in the margin column right; below
  720px text, lists, graph) and from 1100px the left column, the reference lists in a narrow right column; there it
  gets `.is-sticky` while it fits in the window, and the graph takes the verse text's reading width (`--measure`) and
  left edge, and the height the text leaves under the sticky top, shrinking down to `MIN_GRAPH` (260px) so the column
  stays sticky on laptop screens (1366×768); a verse too long for that gets a graph sized to the window and the column
  scrolls; the graph redraws
  when the column's width, the window's height or the text above it changes; hovering or focusing a reference in the
  lists lights up its dot and that direction's edge in the graph (`linker`), and hovering a dot lights up its rows;
  the legend lists only the kinds of mark the graph
  draws; a first-visit welcome band, dismissal kept in
  localStorage `welcome-dismissed`; previous/next verse buttons, also ← and → keys; a link to the chapter on
  the arc diagram), `verse-graph.js` (radial SVG graph from `radialLayout`: edges thick by votes with
  an arrowhead 70% of the way out, a node's edges darken and its dot gets a ring on hover/focus, also driven from
  outside by the returned `highlight(id, dir)`, with `onHighlight(id)` reporting graph hovers; if the labels can't all fit, the
  lowest-voted label still overlapping is hidden until hover, one at a time until none overlap), `arcs.js` (chapter arc diagram: stacked colour / dim / highlight
  canvases, so hover only redraws the highlight layer; filters in `#/arcs?min=30&book=Isa`, and `&ch=Isa.53`
  starts with that chapter highlighted and keeps the pinned chapter in the URL; below 720px that chapter is described
  in an inline line under the controls instead of the popover; the hover/tap hint is in "How to read this"; up to
  three numbered notes (Psalms and Isaiah, Paul's letters, the Synoptics) with numbers worked out from the arcs shown,
  markers on the axis, and hover/focus/click highlighting their arcs; hidden while a book is chosen or by the "Show notes"
  switch, kept in localStorage `arcs-notes-hidden`; the "Old Testament"/"New Testament" labels are inset to the page column even though the chart is wider; the chart
  always fits the screen (it never scrolls sideways), where chapters are under `MIN_TAP` (4px) wide (~0.3px on phones,
  ~0.8px on tablets), so a touch tap selects a whole book, at any width, and the inline line offers "Zoom in to <Book>"
  and previous/next book buttons (one-chapter books are under a pixel wide); zooming in is focus plus context
  (`widthsFor`): the book's chapters get up to `FOCUS_MAX` (16px) each, within `FOCUS_SHARE` (80%) of the width, every
  other book is squeezed proportionally into the rest, and arcs keep their real ends; `&zoom=Isa` (older `zoom=1`
  links zoom to the `&ch=` chapter's book); the change animates over `FOCUS_MS`, redrawing only the colour layer per
  frame, and jumps under reduced motion; the focus line (`.arcs-focus`) names the book, "Show the whole Bible" and
  previous/next buttons that move the zoom; taps inside the zoomed book always pick chapters, however narrow (Psalms
  gets ~1.8px at 390px), taps elsewhere pick books; where the zoomed book's chapters are under `CHIPS_BELOW` (8px),
  the focus line adds a sideways-scrolling row of 44px chapter chips (`.arcs-chips`, one tab stop, arrow keys/Home/End
  move between them) that pick a chapter as a chart tap does and open it when picked again, kept in sync with chart
  taps and scrolled to keep the selected chip in view; notes are hidden while zoomed),
  `books.js` (chord diagram: ribbons on the same three stacked canvases with `isPointInPath` hit testing,
  book arcs and labels in an SVG overlay, 11px on phones and 12px otherwise; labels never leave their section's span,
  and crowded runs collapse into one group label like "Minor Prophets" or "3 books", which selects the whole run
  (its preview lists the books, its panel lets you choose one); details panel that becomes a bottom sheet below 720px;
  with no selection in the URL it opens on Isaiah (`START_BOOK`), its panel under the chart even on phones, with three
  suggested pairs; state in `#/books?pair=Isa-Matt`, `?book=Isa`, `?books=Nah-Zeph`, `&self=1`), `about.js` (About: reading column of
  ~66 characters, from 1100px a margin column of diagram thumbnails and a sticky "On this page" menu; below that,
  thumbnails sit above their sections; `#/about?s=arcs` opens at a section; thumbnails are the build's static SVGs,
  inlined so the theme tokens colour them), `placeholders.js` (not found).
- Page layout: header, views and footer share one centred column, `--page-max` (80rem) wide. `main` is a grid with
  `full` and `content` columns; every view's children sit in `content`, and a chart that needs more width can use
  `grid-column: full` (the arc diagram does, through a subgrid, so its controls and legend stay in the column).
- Tests (`tests/`, `@playwright/test`, config in `playwright.config.js`): `tests/fixtures.js` exports a `test`
  that fails on any console error or uncaught exception, and `skipWelcome(context)`; import `test`/`expect` from
  it, not from `@playwright/test`. `smoke.spec.js` covers each view's main paths and shared URLs (search, verse
  steps across Malachi → Matthew, graph dots, list ↔ graph highlighting, the sticky two-column layout from 1100px and
  the stacked order at 390px, Arcs `?ch=`/`?book=`/`?min=`, Books opening on Isaiah and `?pair=`,
  About's thumbnails, every view in both themes). Label checks: in dev, `books.js` and `arcs.js` also verify after
  every layout that each label sits inside its own section, log a console error if not, and put the result on
  `window.__labelCheck`. `books-labels.spec.js` measures the rendered Books labels at 4 widths, both themes,
  self-links on/off. `graph-labels.spec.js` checks that no verse-graph label touches an edge, arrowhead, node,
  other label or end tick, or sits beside "Genesis"/"Revelation" (on their row within 24px), that those marks touch
  no edge, node or each other, that no two dots overlap, and that the graph is a true circle centred on the verse, for 11 verses at 6 widths
  in both themes ("John 10:28" in John 3:16, "Rom 5:10" in Rom 5:6 and "1 Tim 1:15" in Luke 19:10 must stay
  visible, except 1 Tim 1:15 at 390px, where one half of the circle can't hold all its graph's labels). Both have a negative control that must be flagged (the graph test two: a label on an edge, and
  "Revelation" beside a verse label).
  `arcs-zoom.spec.js` covers the Arcs zoom at 390, 768 and 1024px with touch (Psalms, Jude, previous/next,
  the keyboard, the animation and reduced motion) and the chapter chips (Psalms and Isaiah at 390px, Psalms at 768px), placing taps with `chapterPoint()` from `arcs-helpers.js`, which
  mirrors the chart's geometry (update it if `PAD_X`, `TESTAMENT_GAP` or the focus constants change).
  `regressions.spec.js` holds a test per code-review finding (numbered as in the review); `build-data.spec.js`
  builds from a copy of `data-raw/` (`DATA_RAW`, `DATA_OUT`, `DATA_MAX_BYTES` overrides, for tests only) and checks
  that a bad row or an oversized file fails the build. Tests that break a fetch on purpose allow its console error
  with `test.use({ allowedErrors: [/Failed to load resource/] })`.
- Canvas performance: never stroke per-arc with `multiply` (Chrome re-reads the canvas per stroke,
  ~100x slower). If a blend mode is ever needed, accumulate on a transparent offscreen canvas and blend that once.

## New view checklist

Follow this for every new view (`src/views/arcs.js` is the reference implementation).

1. **Route**: add a pattern to `routes` in `src/router.js`. If the view has filters, accept an
   optional query (`/^#\/arcs(?:\?(.*))?$/`) so filtered views can be shared.
2. **Register**: import the render function in `src/main.js` and add it to the `views` map.
   The nav link in `index.html` needs a matching `data-view`.
3. **Render function**: `renderX(container, params)`. Start with `viewHeader()` from `src/view-header.js`
   (the h1 that focus moves to after navigation, a one-sentence intro and "How to read this"), and set
   `document.title` to `"<View> · Bible Cross-Reference Explorer"`. Controls come from `src/controls.js` and
   the legend from `src/legend.js`, directly under the chart.
4. **Loading and errors**: show a `.status` "Loading…" line, load through `src/data.js` only,
   and show a plain-language error if a fetch fails. After every `await`, return early if the
   view's heading is no longer connected (the user navigated away).
5. **Reuse**: references and chapters via `src/refs.js`, previews via `src/preview.js`,
   colours via `themeColor()` and `SECTIONS` in `src/theme.js`, DOM via `h()`.
6. **Cleanup**: window and document listeners, observers and timers must remove themselves
   once the view's elements are disconnected (see `onTheme` and the `ResizeObserver` in `arcs.js`).
7. **Shareable state**: keep filters in the hash query (`#/arcs?min=30&book=Isa`), written with
   `history.replaceState` (no `hashchange`, so no re-render), omitting defaults, and restored on load. Never write
   once the hash is another view's: removing a focused chart fires its `blur` as the next view renders, so blur
   handlers check `isConnected` and `writeQuery` checks the hash (see `arcs.js`).
   Ignore invalid values rather than erroring.
8. **Canvas** (more than ~2,000 marks): scale by `devicePixelRatio` (capped at 2), read colours from
   tokens and redraw on `themechange`, and draw expensive layers only when data, size or theme change.
   Hover and selection redraw only a light layer on top. Throttle redraws from continuous input
   (sliders) with `requestAnimationFrame`, never queueing frames, and do a final redraw on `change`.
9. **Interaction**: mouse hover, keyboard (focusable, arrow keys, Enter, Escape, announced through an
   `aria-live` region) and touch. Charts use tap-to-preview, tap-again-to-open (tap replaces hover); text
   links open on a single tap.
10. **Responsive**: works at 390px. Wide charts scroll sideways in their own container; the page never does.
11. **Verify in Playwright**: both themes, 1280px and 390px, keyboard and tap paths, no console errors.
    Add smoke tests for the view and its shared URLs to `tests/smoke.spec.js` and its route to the
    console-error test there; `npm test` must pass. Save screenshots under `.playwright-mcp/` (gitignored). For canvas views, report redraw times
    (with 4x CPU throttling for anything driven by a slider).
12. **Docs**: add the view to the code map above and any new shared helpers to their module's entry.

## Tech rules

- Vite + vanilla JavaScript (ES modules) + D3.js. No backend, no database.
- All data is preprocessed into static JSON in `public/data/` by `scripts/build-data.mjs`.
- Always build fetch URLs with `import.meta.env.BASE_URL`, never a leading `/`,
  so paths work under the `/bible-xref/` subfolder on GitHub Pages.
  - Good: `` fetch(`${import.meta.env.BASE_URL}data/verses/John.json`) ``
  - Bad: `fetch('/data/verses/John.json')`
- Use canvas, not SVG, for anything with more than ~2,000 drawn elements.
- Keep every JSON file under 5 MB; split data per book and load lazily.
- Mobile-friendly, keyboard accessible, and supports light and dark mode.
- Hash-based routing (e.g. `#/verse/John.3.16`) so links are shareable.

## Data

- `data-raw/` holds the unmodified sources and is committed (see `data-raw/README.md`). Never edit it; handle quirks in `scripts/build-data.mjs`.
- `public/data/` is generated by `build:data` (run automatically by `prebuild`/`predev`) and is gitignored.
- Verse IDs are integers in canonical order (Gen 1:1 = 0, Rev 22:21 = 31101). Book files are named by OSIS abbreviation (`Gen`, `1Sam`, `Ps`, `3John`).

Files in `public/data/`:

- `books.json`: per book `name`, `abbr`, `testament`, `section`, `chapters`, `versesPerChapter`, `firstId`, `lastId`, `firstChapter`.
- `verses/<abbr>.json`: `{ abbr, firstId, lastId, text: [...] }`, display text indexed by `id - firstId`.
- `xrefs/<abbr>.json`: `{ abbr, firstId, lastId, verses: [{ out, in }] }`. Each link is
  `[fromId, toStartId, toEndId, votes]` (`toEndId === toStartId` for a single verse), sorted by votes descending.
  `in` lists every verse inside a target range, not just its start.
- `search.json`: lowercase search text by verse id (straight apostrophes, æ → ae). It is ~4 MB, so lazy-load it
  only when the user runs a free-text search, never on startup or for reference lookups like "John 3:16".
- `overview.json`: `{ chapterCount, minVotes, links: [[chapterA, chapterB, votes]] }`, undirected, by range start
  verse, within-chapter links excluded, summed votes >= 10. The arc diagram's votes slider should default to ~50.
- `book-matrix.json`: `{ books, matrix }`, directed `matrix[fromBook][toBook]` = summed votes (diagonal included).
- `thumbs/arcs.svg`, `thumbs/books.svg`, `thumbs/graph.svg`: About page thumbnails from `scripts/build-thumbs.mjs`
  (~170 KB, ~27 KB gzipped, in all). No colours inside: marks carry classes (`a-ot`, `c0`…`c7`, `g-sel`…) coloured
  in `style.css` from the theme tokens. Arcs whose ends share a 4-unit bin are merged and drawn more opaque; only the
  ribbons carrying 90% of the votes are drawn.

Link previews: `index.html` has Open Graph and Twitter card tags with absolute URLs
(`https://ryan2706.github.io/bible-xref/…`). Their image, `public/og-image.png` (gitignored), comes from
`scripts/build-og.mjs`: the real arc diagram from `overview.json` at the default 50+ votes, drawn on a canvas in
Chromium with the arc view's opacity rules and the dark tokens read from `src/style.css`, plus the site name.
README screenshots live in `docs/screenshots/` (1280px, light theme); retake them when a view changes visibly.

Cleanup rules in the build script (it exits with an error, so nothing deploys, on any file over 5 MB, any
cross-reference row it can't parse, or a `MARGIN_NOTES` entry that stops matching):

- `3John.1.15` (not in KJV versification) is mapped to `3John.1.14`.
- Negative-vote links are dropped; zero-vote links are kept (the UI fades them).
- 19 verses had KJV margin notes leaked onto the end (e.g. `…: Heb. Jehovah-tsidkenu`). They are stripped via an
  exact-match list (`MARGIN_NOTES`); the build fails if an entry stops matching.
- Stray spaces before punctuation (`LORD .`) are removed; curly apostrophes and æ/Æ stay in display text.

## Design

Reverent and scholarly but modern: illuminated manuscript meets data journalism.
Tokens live in `src/style.css` as CSS custom properties; canvas code should read
colours from them (and redraw on the `themechange` window event), never hard-code hexes.

Type:

- **IM Fell English**: only the site title and the drop cap on the selected verse.
- **Newsreader**: verse text and headings.
- **Atkinson Hyperlegible Next**: interface, controls and chart labels. Its zero is slashed, so every digit
  comes from `Newsreader Figures`, a self-hosted digits-only subset (`src/fonts/`, first in `--font-ui`).
  Verse references (`.ref-link`, popover titles, verse steps) are set in Newsreader.

Layout: the verse view is a reading column (~36rem) with a margin column of
references beside it, like a printed reference Bible. From 1100px the left column also holds
the connections graph under the verse, sized to the column, and stays in view (sticky) while
the reference lists scroll. Below ~720px the margin column moves under the verse text.
Content is left-aligned to the header.

Palette (all chart colours pass the dataviz validator: lightness band, chroma, CVD
separation, normal-vision floor, ≥3:1 against the background):

| Token | Role | Light | Dark |
|---|---|---|---|
| `--paper` | background | `#F2F5F1` | `#0F1730` (night lapis) |
| `--ink` | text | `#20251F` | `#E8E3D3` |
| `--ink-muted` | secondary text | `#545B53` | `#AFAA9A` |
| `--rule` | dividers (decorative) | `#D5DBD3` | `#2A3350` |
| `--arc-ot` | OT→OT arcs, lapis | `#2C4FA3` | `#6F8DE6` |
| `--arc-nt` | NT→NT arcs, gold | `#A97A1E` | `#B08629` |
| `--select` | selection in arc and verse views only, vermilion | `#C23B22` | `#F0775A` |
| `--dim` | de-emphasised marks during selection | `#C9CEC7` | `#3A4258` |
| `--edge` | verse-graph edges: `--ink-muted` 75% into `--paper` | `#7C827B` (3.6:1) | `#878580` (4.8:1) |
| `--sec-law` | Law, madder | `#B1344A` | `#CF4F7E` |
| `--sec-history` | History (OT), ochre | `#A67708` | `#B0821E` |
| `--sec-poetry` | Poetry, verdigris | `#078C74` | `#1E9C86` |
| `--sec-prophets` | Major + Minor Prophets, vermilion | `#D2552B` | `#D86A3E` |
| `--sec-gospels` | Gospels + Acts, ultramarine | `#2F55C8` | `#6F8BE8` |
| `--sec-pauline` | Pauline letters, malachite | `#4B8F2E` | `#5E9E44` |
| `--sec-general` | General letters, Tyrian purple | `#7A3E9D` | `#A06FC8` |
| `--sec-revelation` | Revelation, orpiment | `#A07F0F` | `#A88C1C` |

Chart rules:

- **Arc diagram**: lapis for OT→OT, gold for NT→NT; an OT↔NT arc is lapis up to its apex and gold
  down from it (never a blended gradient, which turns grey-brown). Thin low-opacity strokes with normal
  (`source-over`) blending in both themes, so dense areas build up to the pigment itself, never grey (multiply)
  or pale yellow (additive). Arcs between busy chapters (NT letters, Psalms) are fainter, so dense areas still show
  single arcs. Votes slider defaults to ~50.
- **Vermilion means selection** in the arc and verse views, and nothing else. When something
  is selected there, every other mark switches to `--dim`.
- **The chord diagram never uses vermilion**, because the Prophets pigment is also a vermilion.
  Selected ribbons keep their section pigment and everything else switches to `--dim`.
- **Chord diagram**: the 8 section pigments, in the fixed order above (never cycled or
  re-ordered by a filter), always with direct section labels. Non-adjacent pairs
  (e.g. ochre and orpiment) look alike, so colour is never the only cue.
- Chart text uses ink tokens, never the series colour.

## Data credits

- Cross-references: [OpenBible.info](https://www.openbible.info/labs/cross-references/) (CC BY 4.0). Attribution must stay visible in the site footer.
- Bible text: King James Version (public domain), via thiagobodruk/bible.

## Workflow

- Make small changes, one task at a time.
- Run the dev server to check each change.
- After each task, tell the user exactly what to look at in the browser (URL/route and what they should see).
- This is a solo project: when I say commit and push, push to main directly.
- Pushing to main deploys the site: `.github/workflows/deploy.yml` runs `npm test` (which builds the site,
  regenerating `public/data/` from `data-raw/`, and runs the Playwright tests against it) and publishes `dist/` to
  GitHub Pages only if every test passes. Run `npm test` before pushing.
