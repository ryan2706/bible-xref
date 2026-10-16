// Where a chapter sits on the arc diagram, worked out from the chart's own geometry
// (src/views/arcs.js: PAD_X 6, TESTAMENT_GAP 10, and when zoomed in to a book,
// FOCUS_SHARE 0.8 and FOCUS_MAX 16). Returns the point to tap and the chapter's width.
export function chapterPoint(page, osisChapter, focusAbbr = null) {
  return page.evaluate(
    async ([want, focusAbbr]) => {
      const books = await (await fetch('data/books.json')).json();
      const [abbr, n] = want.split('.');
      const N = books.reduce((s, b) => s + b.chapters, 0);
      const ntStart = books.find((b) => b.testament === 'NT').firstChapter;
      const target = books.find((b) => b.abbr === abbr).firstChapter + Number(n) - 1;
      const focus = books.find((b) => b.abbr === focusAbbr);
      document.querySelector('.arcs-scroll').scrollIntoView({ block: 'center' });
      const r = document.querySelector('.arcs-stack').getBoundingClientRect();
      const avail = r.width - 22;
      const even = avail / N;
      const wide = focus ? Math.max(even, Math.min((avail * 0.8) / focus.chapters, 16)) : even;
      const rest = focus ? (avail - wide * focus.chapters) / (N - focus.chapters) : even;
      const inFocus = (c) => focus && c >= focus.firstChapter && c < focus.firstChapter + focus.chapters;
      let x = 6;
      for (let c = 0; c < target; c++) x += inFocus(c) ? wide : rest;
      if (target >= ntStart) x += 10;
      const width = inFocus(target) ? wide : rest;
      return { x: r.left + x + width / 2, y: r.top + r.height * 0.5, width };
    },
    [osisChapter, focusAbbr],
  );
}
