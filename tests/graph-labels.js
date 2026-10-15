// Verse graph label check: no visible label may touch an edge, an arrowhead, another
// label, another node or the Genesis/Revelation marks, or leave the SVG. Runs a set of
// verses at 1440, 1280, 1100, 1000, 720 and 390px in light and dark, plus a negative
// control that moves a label onto an edge and must be flagged.
//
// A review found "1 Tim 1:15–16", "John 10:28" and "Rom 5:10" crossed by edges in John 3:16's
// old force layout. Since the graph now splits its places between directions, John 3:16 no
// longer draws the first and last of those, so they are checked in graphs that do: John 3:16
// (John 10:28), Rom 5:6 (Rom 5:10) and Luke 19:10 (1 Tim 1:15). They must stay visible (not
// hidden until hover) and clear.
//
// It measures the rendered SVG in screen pixels: label boxes from getBoundingClientRect,
// edges sampled every 2px along each path, arrowheads by their corners and centre.
//
// Needs the dev server (npm run dev). Written as a Playwright `(page) => …` function:
// run it with the Playwright MCP tool `browser_run_code` (filename: tests/graph-labels.js).
// It returns { runs, control, failures }: control must be 'flagged' and failures empty
// (each failure row lists its violations, missing labels and console errors).
async (page) => {
  const BASE = 'http://localhost:5173/bible-xref/#/verse/';
  const VERSES = ['John.3.16', 'Isa.53.5', 'Rom.5.6', 'Luke.19.10', 'Rom.5.10', 'John.10.28', '1Tim.1.15', 'Gen.1.1', 'Ps.23.1', 'Rev.22.21', 'Matt.5.3'];
  const MUST_SHOW = { 'John.3.16': ['John 10:28'], 'Rom.5.6': ['Rom 5:10'], 'Luke.19.10': ['1 Tim 1:15'] };

  const measure = (mustShow) =>
    page.evaluate((mustShow) => {
      const svg = document.querySelector('svg.graph');
      const frame = svg.getBoundingClientRect();
      const rect = (el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      };
      const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const inside = (p, r) => p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom;
      const toScreen = (el, x, y) => {
        const m = el.getScreenCTM();
        return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
      };

      const labels = [];
      for (const node of svg.querySelectorAll('.graph-node')) {
        const text = node.querySelector('text');
        if (getComputedStyle(text).visibility === 'hidden') continue;
        labels.push({ name: text.textContent, box: rect(text), node, dot: node.querySelector('circle') });
      }
      const hidden = [...svg.querySelectorAll('.graph-node.label-on-demand text')].map((t) => t.textContent);

      // Points along every edge line and arrowhead.
      const edgePoints = [];
      for (const path of svg.querySelectorAll('.graph-edge-line')) {
        const len = path.getTotalLength();
        for (let s = 0; s <= len; s += 2) {
          const p = path.getPointAtLength(s);
          edgePoints.push(toScreen(path, p.x, p.y));
        }
      }
      for (const arrow of svg.querySelectorAll('.graph-arrow')) {
        const pts = arrow.getAttribute('d').match(/-?\d*\.?\d+(?:e-?\d+)?/g).map(Number);
        const corners = [0, 2, 4].map((i) => toScreen(arrow, pts[i], pts[i + 1]));
        edgePoints.push(...corners, { x: (corners[0].x + corners[1].x + corners[2].x) / 3, y: (corners[0].y + corners[1].y + corners[2].y) / 3 });
      }
      const marks = [...svg.querySelectorAll('.graph-end')].map((t) => ({ name: t.textContent, box: rect(t) }));

      const violations = [];
      labels.forEach((l, i) => {
        const where = l.name;
        if (edgePoints.some((p) => inside(p, l.box))) violations.push(`${where}: crosses an edge`);
        for (const m of labels.slice(i + 1)) if (hit(l.box, m.box)) violations.push(`${where}: overlaps label ${m.name}`);
        for (const m of labels) if (m !== l && hit(l.box, rect(m.dot))) violations.push(`${where}: overlaps node ${m.name}`);
        for (const m of marks) if (hit(l.box, m.box)) violations.push(`${where}: overlaps ${m.name}`);
        if (l.box.left < frame.left - 0.5 || l.box.right > frame.right + 0.5 || l.box.top < frame.top - 0.5 || l.box.bottom > frame.bottom + 0.5)
          violations.push(`${where}: outside the graph`);
      });
      const shown = new Set(labels.map((l) => l.name));
      const missing = (mustShow || []).filter((name) => !shown.has(name));
      return { violations, missing, hidden, labels: labels.length, W: Math.round(frame.width), H: Math.round(frame.height) };
    }, mustShow);

  // Negative control: put John 10:28's label on the midpoint of its own edge.
  const control = async () => {
    await page.evaluate(() => {
      const node = [...document.querySelectorAll('.graph-node')].find((n) => n.querySelector('text').textContent === 'John 10:28');
      const edge = [...document.querySelectorAll('.graph-edge-line')].find((p) => {
        const end = p.getPointAtLength(p.getTotalLength());
        const start = p.getPointAtLength(0);
        const t = node.transform.baseVal.consolidate().matrix;
        return [start, end].some((q) => Math.hypot(q.x - t.e, q.y - t.f) < 14);
      });
      const mid = edge.getPointAtLength(edge.getTotalLength() / 2);
      const t = node.transform.baseVal.consolidate().matrix;
      const text = node.querySelector('text');
      text.dataset.saved = `${text.getAttribute('x')},${text.getAttribute('y')}`;
      text.setAttribute('x', mid.x - t.e - 20);
      text.setAttribute('y', mid.y - t.f);
    });
    const r = await measure();
    return r.violations.some((v) => v.startsWith('John 10:28: crosses an edge')) ? 'flagged' : 'MISSED';
  };

  const rows = [];
  let runs = 0;
  let controlResult = 'not run';
  for (const scheme of ['light', 'dark']) {
    for (const width of [1440, 1280, 1100, 1000, 720, 390]) {
      const ctx = await page.context().browser().newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
      await ctx.addInitScript(() => localStorage.setItem('welcome-dismissed', '1'));
      const p = await ctx.newPage();
      const errors = [];
      p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      p.on('pageerror', (e) => errors.push(String(e)));
      page = p;
      for (const [i, ref] of VERSES.entries()) {
        if (i === 0) await p.goto(BASE + ref);
        else
          await p.evaluate((h) => {
            window.__oldGraph = document.querySelector('svg.graph');
            location.hash = h;
          }, '#/verse/' + ref);
        // The new verse's graph is done once its legend is in.
        await p.waitForFunction(() => {
          const g = document.querySelector('svg.graph');
          return g && g !== window.__oldGraph && document.querySelector('.graph-section .legend');
        });
        await p.waitForTimeout(150);
        const r = await measure(MUST_SHOW[ref]);
        runs++;
        if (ref === 'John.3.16' && width === 1440 && scheme === 'light') controlResult = await control();
        if (r.violations.length || r.missing.length || errors.length) rows.push({
          scheme,
          width,
          ref,
          W: r.W,
          H: r.H,
          labels: r.labels,
          hidden: r.hidden.length ? r.hidden.join(', ') : 'none',
          violations: r.violations.length ? r.violations : 'none',
          missing: r.missing.length ? r.missing : 'none',
          errors: errors.length ? errors.splice(0) : 'none',
        });
      }
      await ctx.close();
    }
  }
  return { runs, control: controlResult, failures: rows };
}
