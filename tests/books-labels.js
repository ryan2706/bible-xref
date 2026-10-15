// Books view label check: every visible label (book or group) must sit inside its own
// section's angular span. Runs at 1280, 1000, 720 and 390px, in light and dark, with
// self-links off and on (the circle re-lays out), plus a negative control that plants
// a label in the wrong section and must be flagged.
//
// It measures the rendered SVG rather than the layout's numbers: each label's angle
// comes from its transform, each section's span from sampling the drawn arcs.
//
// Needs the dev server (npm run dev). Written as a Playwright `(page) => …` function:
// run it with the Playwright MCP tool `browser_run_code` (filename: tests/books-labels.js).
// It returns one row per run; every row must show violations 'none', dev 'none',
// errors 'none', and the control rows 'flagged'.
async (page) => {
  const URL = 'http://localhost:5173/bible-xref/#/books';
  // Measures the rendered SVG: label anchor angle from its transform, section spans by
  // sampling each section's arc paths. Independent of the layout's own numbers.
  const measure = () =>
    page.evaluate(() => {
      const TAU = 2 * Math.PI;
      const ang = (x, y) => { let a = Math.atan2(x, -y); return a < 0 ? a + TAU : a; };
      const spans = {};
      for (const arc of document.querySelectorAll('.chord-arc')) {
        const s = arc.dataset.section, len = arc.getTotalLength();
        for (let t = 0; t <= 40; t++) {
          const p = arc.getPointAtLength((len * t) / 40);
          const a = ang(p.x, p.y);
          spans[s] ??= [Infinity, -Infinity];
          spans[s][0] = Math.min(spans[s][0], a);
          spans[s][1] = Math.max(spans[s][1], a);
        }
      }
      const bookSection = {};
      for (const arc of document.querySelectorAll('.chord-arc')) bookSection[arc.dataset.book] = arc.dataset.section;
      const svg = document.querySelector('.books-svg');
      // Label transform in the SVG's own (centred) user space, without the viewBox offset.
      const toUser = svg.getCTM().inverse();
      const local = (el) => toUser.multiply(el.getCTM());
      const rLabel = Math.hypot(local(document.querySelector('.chord-label')).e, local(document.querySelector('.chord-label')).f);
      const out = { labels: 0, groups: [], violations: [], minMarginPx: Infinity };
      for (const el of document.querySelectorAll('.chord-label')) {
        out.labels++;
        const m = local(el); // origin of the label = its anchor on the label circle
        const a = ang(m.e, m.f);
        const s = el.dataset.section;
        const [lo, hi] = spans[s];
        const mixed = el.dataset.books.split(' ').some((b) => bookSection[b] !== s);
        if (el.classList.contains('chord-group-label')) out.groups.push(el.textContent);
        const margin = Math.min(a - lo, hi - a) * rLabel;
        out.minMarginPx = Math.min(out.minMarginPx, margin);
        if (a < lo || a > hi || mixed) out.violations.push(`${el.textContent} @${a.toFixed(3)} not in [${lo.toFixed(3)}, ${hi.toFixed(3)}]${mixed ? ' (mixed sections)' : ''}`);
      }
      out.minMarginPx = +out.minMarginPx.toFixed(1);
      out.dev = window.__labelCheck?.bad;
      out.W = svg.getAttribute('width');
      return out;
    });

  // Negative control: a Prophets label rotated into the Gospels span must be flagged.
  const control = async () => {
    await page.evaluate(() => {
      const real = document.querySelector('.chord-label[data-section="4"]');
      const fake = real.cloneNode(true);
      fake.textContent = 'CONTROL';
      fake.dataset.section = '3';
      fake.dataset.books = '38'; // Malachi
      real.after(fake);
    });
    const r = await measure();
    await page.evaluate(() => [...document.querySelectorAll('.chord-label')].find((e) => e.textContent === 'CONTROL').remove());
    return r.violations.filter((v) => v.startsWith('CONTROL')).length === 1 ? 'flagged' : 'MISSED';
  };

  const rows = [];
  for (const scheme of ['light', 'dark']) {
    for (const width of [1280, 1000, 720, 390]) {
      const ctx = await page.context().browser().newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
      const p = await ctx.newPage();
      const errors = [];
      p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      p.on('pageerror', (e) => errors.push(String(e)));
      await p.goto(URL);
      await p.waitForSelector('.chord-label');
      await p.waitForTimeout(200);
      page = p;
      for (const self of [false, true]) {
        if (self) {
          await p.click('#books-self');
          await p.waitForTimeout(200);
        }
        const r = await measure();
        const ctl = width === 1280 && !self ? await control() : undefined;
        rows.push({ ...(ctl ? { control: ctl } : {}), scheme, width, self, W: r.W, labels: r.labels, groups: r.groups.join(' | '), minMarginPx: r.minMarginPx, violations: r.violations.length ? r.violations : 'none', dev: r.dev?.length ? r.dev : 'none', errors: errors.length ? errors : 'none' });
      }
      await ctx.close();
    }
  }
  return rows;
}
