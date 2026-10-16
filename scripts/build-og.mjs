// The 1200×630 link-preview image (Open Graph / Twitter card), written to
// public/og-image.png before `vite build` copies public/ into dist/. It is the real
// arc diagram, drawn from public/data/overview.json the way src/views/arcs.js draws
// it, in the site's dark palette (read from src/style.css), with the site name.
// Chromium (from @playwright/test, which the tests need anyway) draws it on a canvas.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'public', 'data');
const OUT = path.join(ROOT, 'public', 'og-image.png');
const W = 1200, H = 630;
const MIN_VOTES = 50; // the arc diagram's default

// Dark tokens from the explicit dark-theme block, so the image follows the palette.
const css = fs.readFileSync(path.join(ROOT, 'src', 'style.css'), 'utf8');
const dark = css.match(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/)?.[1];
if (!dark) throw new Error("build-og: no :root[data-theme='dark'] block in src/style.css");
const token = (name) => {
  const v = dark.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
  if (!v) throw new Error(`build-og: ${name} missing from the dark theme`);
  return v;
};
const colors = Object.fromEntries(
  ['paper', 'ink', 'ink-muted', 'rule', 'arc-ot', 'arc-nt'].map((t) => [t, token(`--${t}`)]),
);

const overview = JSON.parse(fs.readFileSync(path.join(DATA, 'overview.json'), 'utf8'));
const books = JSON.parse(fs.readFileSync(path.join(DATA, 'books.json'), 'utf8'));
const ntStart = books.find((b) => b.testament === 'NT').firstChapter;
const links = overview.links.filter(([, , v]) => v >= MIN_VOTES).map(([a, b]) => [a, b]);

// Digits come from the site's own Newsreader Figures subset, as in --font-ui.
const figures = fs.readFileSync(path.join(ROOT, 'src', 'fonts', 'newsreader-figures.woff2')).toString('base64');
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;700&family=IM+Fell+English&family=Newsreader:ital,opsz,wght@1,6..72,400&display=block">
<style>@font-face{font-family:'Newsreader Figures';src:url(data:font/woff2;base64,${figures}) format('woff2');font-weight:400 700;unicode-range:U+0030-0039}
html,body{margin:0;background:${colors.paper}}canvas{display:block}</style>
</head><body><canvas width="${W}" height="${H}"></canvas></body></html>`;

// Runs in the page: the same geometry and opacity rules as arcs.js, at 1200px.
function draw({ W, H, N, ntStart, links, colors, fontsOk }) {
  const ctx = document.querySelector('canvas').getContext('2d');
  ctx.fillStyle = colors.paper;
  ctx.fillRect(0, 0, W, H);

  const PAD_X = 40, GAP = 14, axisY = H - 46, arcH = 400, MIN_ARC_H = 9;
  const w = (W - 2 * PAD_X - GAP) / N;
  const x = (c) => PAD_X + (c + 0.5) * w + (c >= ntStart ? GAP : 0);
  const ry = arcH / ((x(N - 1) - x(0)) / 2);
  const deg = new Array(N).fill(0);
  for (const [a, b] of links) deg[a]++, deg[b]++;
  const sorted = deg.filter((n) => n > 0).sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length * 0.75)] ?? 1;
  const base = Math.min(0.5, Math.max(0.02, 640 / links.length)) * 1.2;
  const alphaOf = ([a, b]) => Math.max(0.02, base * Math.min(1, (ref / Math.sqrt(deg[a] * deg[b])) ** 0.75));
  const arc = ([a, b], from, to) => {
    const x1 = x(a), rx = (x(b) - x1) / 2, r = Math.max(rx * ry, MIN_ARC_H);
    ctx.beginPath();
    ctx.moveTo(x1 + rx + rx * Math.cos(from), axisY + r * Math.sin(from));
    ctx.ellipse(x1 + rx, axisY, rx, r, 0, from, to);
    ctx.stroke();
  };
  const cross = (l) => (l[0] >= ntStart) !== (l[1] >= ntStart);
  ctx.lineWidth = 1.1;
  for (const l of [...links.filter(cross), ...links.filter((l) => !cross(l))]) {
    ctx.globalAlpha = alphaOf(l);
    if (!cross(l)) {
      ctx.strokeStyle = l[0] >= ntStart ? colors['arc-nt'] : colors['arc-ot'];
      arc(l, Math.PI, 2 * Math.PI);
    } else {
      ctx.strokeStyle = colors['arc-ot'];
      arc(l, Math.PI, 1.5 * Math.PI);
      ctx.strokeStyle = colors['arc-nt'];
      arc(l, 1.5 * Math.PI, 2 * Math.PI);
    }
  }
  ctx.globalAlpha = 1;

  // Axis, Testament divider and labels
  ctx.fillStyle = colors['ink-muted'];
  ctx.fillRect(x(0) - w / 2, axisY + 1, x(ntStart - 1) - x(0) + w, 1.5);
  ctx.fillRect(x(ntStart) - w / 2, axisY + 1, x(N - 1) - x(ntStart) + w, 1.5);
  ctx.fillRect(Math.round(x(ntStart) - w / 2 - GAP / 2), axisY - 8, 1.5, 22);
  const ui = (weight, size) => `${weight} ${size}px 'Newsreader Figures', 'Atkinson Hyperlegible Next', system-ui, sans-serif`;
  ctx.font = ui(700, 20);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText('Old Testament', PAD_X, axisY + 32);
  ctx.textAlign = 'right';
  ctx.fillText('New Testament', W - PAD_X, axisY + 32);

  // Site name, a line about it and the address, over the empty top of the chart
  ctx.textAlign = 'left';
  ctx.fillStyle = colors.ink;
  ctx.font = `76px 'IM Fell English', 'Iowan Old Style', Georgia, serif`;
  ctx.fillText('Bible Cross-Reference Explorer', PAD_X, 104);
  ctx.fillStyle = colors['ink-muted'];
  ctx.font = `italic 32px 'Newsreader', Georgia, serif`;
  ctx.fillText('How every chapter connects, across 340,000 cross-references', PAD_X, 152);
  ctx.textAlign = 'right';
  ctx.font = ui(400, 20);
  ctx.fillText('ryan2706.github.io/bible-xref', W - PAD_X, 40);
  return fontsOk;
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load', timeout: 20000 }).catch(() => {});
  // The fonts come from Google Fonts, as on the site. Without a network the image is
  // still drawn, in the fallback fonts, with a warning rather than a failed build.
  const fontsOk = await page.evaluate(async () => {
    try {
      await Promise.all([
        document.fonts.load("76px 'IM Fell English'"),
        document.fonts.load("italic 32px 'Newsreader'"),
        document.fonts.load("700 20px 'Atkinson Hyperlegible Next'"),
        document.fonts.load("400 20px 'Atkinson Hyperlegible Next'"),
        document.fonts.load("400 20px 'Newsreader Figures'", '0123456789'),
      ]);
      return document.fonts.check("76px 'IM Fell English'");
    } catch {
      return false;
    }
  });
  await page.evaluate(draw, { W, H, N: overview.chapterCount, ntStart, links, colors, fontsOk });
  await page.locator('canvas').screenshot({ path: OUT });
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(`Preview image: public/og-image.png, ${W}×${H}, ${links.length} arcs, ${kb} KB`);
  if (!fontsOk) console.warn('build-og: web fonts did not load; the preview image uses fallback fonts');
} finally {
  await browser.close();
}
