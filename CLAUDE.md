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
- `src/preview.js`: `attachPreview(el, index, id, title)` adds the verse-text popover on
  hover/focus (one shared, dismissable popover). Works on HTML and SVG elements.
  `showPreview(anchor, title, note)` / `hidePreview()` drive the same popover by hand (e.g. for canvas);
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
  `sectionOf(book)` (the 8 chord-diagram sections, their order and colour tokens) from `src/sections.js`, which has
  no DOM code so the data build can import it too. Likewise `src/links.js` (`strongestLinks`: the 15 links a verse's
  graph draws) is shared by `verse-graph.js` and the thumbnail build.
- `src/dom.js`: `h(tag, attrs, ...children)`. Children are set as text, never parsed as HTML.
- `src/router.js` + `src/main.js`: hash routes (see the New view checklist below). A new view needs a route pattern here and an
  entry in the `views` map in `main.js`; the nav link's `data-view` must match.
- `src/search.js`: header search combobox (reference lookup only; free-text search will
  lazy-load `search.json`).
- `src/views/`: `verse.js` (reading + margin columns; a first-visit welcome band, dismissal kept in
  localStorage `welcome-dismissed`; previous/next verse buttons, also ← and → keys; a link to the chapter on
  the arc diagram), `verse-graph.js` (D3 force graph with
  label-aware box collision), `arcs.js` (chapter arc diagram: stacked colour / dim / highlight
  canvases, so hover only redraws the highlight layer; filters in `#/arcs?min=30&book=Isa`, and `&ch=Isa.53`
  starts with that chapter highlighted and keeps the pinned chapter in the URL; on phones that chapter is described
  in an inline line under the controls instead of the popover),
  `books.js` (chord diagram: ribbons on the same three stacked canvases with `isPointInPath` hit testing,
  book arcs and labels in an SVG overlay; labels never leave their section's span, and crowded runs
  collapse into one group label like "Minor Prophets"; details panel that becomes a bottom sheet below 720px;
  state in `#/books?pair=Isa-Matt`, `?book=Isa`, `&self=1`), `about.js` (About: reading column of
  ~66 characters, from 1100px a margin column of diagram thumbnails and a sticky "On this page" menu; below that,
  thumbnails sit above their sections; `#/about?s=arcs` opens at a section; thumbnails are the build's static SVGs,
  inlined so the theme tokens colour them), `placeholders.js` (not found).
- Page layout: header, views and footer share one centred column, `--page-max` (80rem) wide. `main` is a grid with
  `full` and `content` columns; every view's children sit in `content`, and a chart that needs more width can use
  `grid-column: full` (the arc diagram does, through a subgrid, so its controls and legend stay in the column).
- Label checks: in dev, `books.js` and `arcs.js` verify after every layout that each label sits inside its
  own section, log a console error if not, and put the result on `window.__labelCheck` for Playwright.
  `tests/books-labels.js` checks the rendered Books labels at 4 widths, both themes, self-links on/off.
- Canvas performance: never stroke per-arc with `multiply` (Chrome re-reads the canvas per stroke,
  ~100x slower). Accumulate on a transparent offscreen canvas and multiply that once, as `arcs.js` does.

## New view checklist

Follow this for every new view (`src/views/arcs.js` is the reference implementation).

1. **Route**: add a pattern to `routes` in `src/router.js`. If the view has filters, accept an
   optional query (`/^#\/arcs(?:\?(.*))?$/`) so filtered views can be shared.
2. **Register**: import the render function in `src/main.js` and add it to the `views` map.
   The nav link in `index.html` needs a matching `data-view`.
3. **Render function**: `renderX(container, params)`. Start with
   `h('h1', { class: 'view-title', tabindex: '-1' }, …)` (focus moves there after navigation),
   a `.view-intro` line, and set `document.title` to `"<View> · Bible Cross-Reference Explorer"`.
4. **Loading and errors**: show a `.status` "Loading…" line, load through `src/data.js` only,
   and show a plain-language error if a fetch fails. After every `await`, return early if the
   view's heading is no longer connected (the user navigated away).
5. **Reuse**: references and chapters via `src/refs.js`, previews via `src/preview.js`,
   colours via `themeColor()` and `SECTIONS` in `src/theme.js`, DOM via `h()`.
6. **Cleanup**: window and document listeners, observers and timers must remove themselves
   once the view's elements are disconnected (see `onTheme` and the `ResizeObserver` in `arcs.js`).
7. **Shareable state**: keep filters in the hash query (`#/arcs?min=30&book=Isa`), written with
   `history.replaceState` (no `hashchange`, so no re-render), omitting defaults, and restored on load.
   Ignore invalid values rather than erroring.
8. **Canvas** (more than ~2,000 marks): scale by `devicePixelRatio` (capped at 2), read colours from
   tokens and redraw on `themechange`, and draw expensive layers only when data, size or theme change.
   Hover and selection redraw only a light layer on top. Throttle redraws from continuous input
   (sliders) with `requestAnimationFrame`, never queueing frames, and do a final redraw on `change`.
9. **Interaction**: mouse hover, keyboard (focusable, arrow keys, Enter, Escape, announced through an
   `aria-live` region) and touch (tap replaces hover, a second tap activates).
10. **Responsive**: works at 390px. Wide charts scroll sideways in their own container; the page never does.
11. **Verify in Playwright**: both themes, 1280px and 390px, keyboard and tap paths, no console errors.
    Save screenshots under `.playwright-mcp/` (gitignored). For canvas views, report redraw times
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

Cleanup rules in the build script:

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
references beside it, like a printed reference Bible. Below ~720px the margin column
moves under the verse text. Content is left-aligned to the header.

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
| `--sec-law` | Law, madder | `#B1344A` | `#CF4F7E` |
| `--sec-history` | History (OT), ochre | `#A67708` | `#B0821E` |
| `--sec-poetry` | Poetry, verdigris | `#078C74` | `#1E9C86` |
| `--sec-prophets` | Major + Minor Prophets, vermilion | `#D2552B` | `#D86A3E` |
| `--sec-gospels` | Gospels + Acts, ultramarine | `#2F55C8` | `#6F8BE8` |
| `--sec-pauline` | Pauline letters, malachite | `#4B8F2E` | `#5E9E44` |
| `--sec-general` | General letters, Tyrian purple | `#7A3E9D` | `#A06FC8` |
| `--sec-revelation` | Revelation, orpiment | `#A07F0F` | `#A88C1C` |

Chart rules:

- **Arc diagram**: lapis for OT→OT, gold for NT→NT, a lapis→gold gradient for OT↔NT.
  Thin low-opacity strokes; `globalCompositeOperation` is `lighter` (additive) in dark
  mode and `multiply` in light mode so dense areas build up in both. Votes slider defaults to ~50.
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
- Pushing to main deploys the site: `.github/workflows/deploy.yml` builds it (which regenerates `public/data/`
  from `data-raw/`) and publishes `dist/` to GitHub Pages.
