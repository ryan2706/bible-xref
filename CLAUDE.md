# Bible Cross-Reference Explorer

## Goal

A static website, hosted on GitHub Pages at https://ryan2706.github.io/bible-xref/,
that visualizes Bible cross-references so people can see how verses connect
across the whole Bible.

## Views

1. **Verse explorer**: search plus a force-directed network graph of a verse's cross-references.
2. **Arc diagram**: every chapter of the Bible, with cross-references drawn as arcs on `<canvas>`.
3. **Chord diagram**: book-to-book cross-reference flows.

## Commands

- `npm run dev`: start the Vite dev server (http://localhost:5173/)
- `npm run build`: production build into `dist/`
- `npm run preview`: serve the production build locally
- `node scripts/build-data.mjs`: regenerate the static JSON in `public/data/`

## Tech rules

- Vite + vanilla JavaScript (ES modules) + D3.js. No backend, no database.
- All data is preprocessed into static JSON in `public/data/` by `scripts/build-data.mjs`.
- Always build fetch URLs with `import.meta.env.BASE_URL`, never a leading `/`,
  so paths work under the `/bible-xref/` subfolder on GitHub Pages.
  - Good: `` fetch(`${import.meta.env.BASE_URL}data/books/John.json`) ``
  - Bad: `fetch('/data/books/John.json')`
- Use canvas, not SVG, for anything with more than ~2,000 drawn elements.
- Keep every JSON file under 5 MB; split data per book and load lazily.
- Mobile-friendly, keyboard accessible, and supports light and dark mode.
- Hash-based routing (e.g. `#/verse/John.3.16`) so links are shareable.

## Data credits

- Cross-references: [OpenBible.info](https://www.openbible.info/labs/cross-references/) (CC BY 4.0). Attribution must stay visible in the site footer.
- Bible text: a public-domain translation (KJV or WEB).

## Workflow

- Make small changes, one task at a time.
- Run the dev server to check each change.
- After each task, tell the user exactly what to look at in the browser (URL/route and what they should see).
