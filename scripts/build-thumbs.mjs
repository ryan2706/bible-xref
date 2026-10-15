// Small static SVG thumbnails of the three diagrams for the About page, written to
// public/data/thumbs/ by build-data.mjs. They carry no colours: every mark has a class
// that src/style.css colours with the theme tokens, so the About page inlines them and
// they follow light and dark like the rest of the page.
import fs from 'node:fs';
import path from 'node:path';
import { chord as d3chord, ribbon as d3ribbon, arc as d3arc } from 'd3';
import { sectionOf } from '../src/sections.js';
import { strongestLinks } from '../src/links.js';
import { radialLayout, SPAN, SPLIT } from '../src/graph-layout.js';

export const ARCS_MIN_VOTES = 50; // the arc diagram's default

const SVG = (viewBox, cls, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" class="thumb-svg ${cls}">${body}</svg>\n`;
// One decimal is plenty at thumbnail size; drop trailing zeros.
const round = (d) => d.replace(/-?\d*\.\d+(?:e-?\d+)?/g, (n) => String(Math.round(+n * 10) / 10));

// Chapter arcs: every chapter on one axis and an arc per pair of chapters with at least
// ARCS_MIN_VOTES votes. Arcs whose ends fall in the same 2-unit bins are merged into one,
// drawn more opaque the more arcs it stands for, so dense areas still build up.
function arcsSvg({ chapterCount: N, ntStartChapter, links }) {
  const W = 500, H = 200, PAD = 2, GAP = 6, BIN = 4;
  const step = (W - 2 * PAD - GAP) / N;
  const x = (c) => PAD + (c + 0.5) * step + (c >= ntStartChapter ? GAP : 0);
  const bin = (c) => Math.round(x(c) / BIN) * BIN;
  const axisY = H - 1.5;
  const ryScale = (H - 6) / ((x(N - 1) - x(0)) / 2);
  const ALPHA = 0.07; // per arc; n merged arcs = n stacked strokes

  const merged = new Map();
  for (const [a, b, votes] of links) {
    if (votes < ARCS_MIN_VOTES) continue;
    const x1 = bin(a), x2 = bin(b);
    if (x1 === x2) continue;
    const kind = a >= ntStartChapter ? 'nt' : b >= ntStartChapter ? 'x' : 'ot';
    const key = `${kind} ${x1} ${x2}`;
    merged.set(key, (merged.get(key) || 0) + 1);
  }
  // Group by kind and opacity level (8 levels), so each path needs no attributes.
  const groups = new Map();
  for (const [key, n] of merged) {
    const [kind, x1, x2] = key.split(' ');
    const level = Math.min(8, Math.max(1, Math.round((1 - (1 - ALPHA) ** n) * 8)));
    const rx = (x2 - x1) / 2;
    const d = `M${x1} ${axisY}a${rx} ${Math.max(3, Math.round(rx * ryScale))} 0 0 1 ${x2 - x1} 0`;
    const g = `${kind} ${level}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(`<path d="${d}"/>`);
  }
  // Cross-Testament arcs shade lapis to gold. The gradient uses each arc's own
  // bounding box, which runs from its OT end to its NT end.
  let body =
    '<defs><linearGradient id="thumb-arcs-x"><stop offset="0" class="a-stop-ot"/><stop offset="1" class="a-stop-nt"/></linearGradient></defs>' +
    `<g fill="none" stroke-width=".75">`;
  for (const [g, paths] of [...groups].sort()) {
    const [kind, level] = g.split(' ');
    const gradient = kind === 'x' ? ' stroke="url(#thumb-arcs-x)"' : '';
    body += `<g class="a-${kind}"${gradient} stroke-opacity="${level / 8}">${paths.join('')}</g>`;
  }
  body += `</g><rect class="a-axis" x="0" y="${axisY}" width="${W}" height="1"/>`;
  return { svg: SVG(`0 0 ${W} ${H}`, 'thumb-arcs', round(body)), marks: merged.size };
}

// Book links: book arcs in their section pigments and a ribbon per pair of books,
// coloured by the book that cites the other more (self-links left out, as by default).
// The smallest ribbons are hairlines at this size, so only the ones that together carry
// RIBBON_SHARE of the votes are drawn.
function booksSvg({ books, matrix }) {
  const R = 100, rOut = R - 1, rIn = rOut - 7, RIBBON_SHARE = 0.9;
  const sec = books.map(sectionOf);
  const m = matrix.map((row, i) => row.map((v, j) => (i === j ? 0 : v)));
  const layout = d3chord().padAngle(0.008)(m);
  const value = (c) => c.source.value + c.target.value;
  const chords = [...layout].sort((a, b) => value(b) - value(a));
  const total = chords.reduce((s, c) => s + value(c), 0);
  let sum = 0;
  const kept = chords.filter((c) => (sum += value(c)) - value(c) < total * RIBBON_SHARE);

  const ribbon = d3ribbon().radius(rIn - 1);
  const arc = d3arc().innerRadius(rIn).outerRadius(rOut);
  let body = '<g fill-opacity=".72">';
  for (const c of kept) body += `<path class="c${sec[c.source.index]}" d="${ribbon(c)}"/>`;
  body += '</g>';
  for (const g of layout.groups) body += `<path class="c${sec[g.index]}" d="${arc(g)}"/>`;
  return { svg: SVG(`${-R} ${-R} ${2 * R} ${2 * R}`, 'thumb-books', round(body)), marks: kept.length, of: chords.length };
}

// Verse explorer: John 3:16 and the same strongest links as its connections graph, with
// the same radial layout (canonical order round an ellipse), scaled to fit. No labels.
function graphSvg({ centerId, out, incoming, isNT, books }) {
  const W = 400, H = 300, R = 9, R_CENTER = 14;
  const links = strongestLinks(out, incoming);
  const ids = [...new Set(links.map((l) => l.other))];
  const L = radialLayout(
    ids.map((id) => ({ id, labelWidth: 0 })),
    { width: W, maxHeight: H, ntStart: books.find((b) => b.testament === 'NT').firstId, lastId: books.at(-1).lastId, r: R, rCenter: R_CENTER, labelHeight: 0, dotPad: 6, maxRadius: 400 },
  );
  // Scale the ellipse (plus node radius) to fill the thumbnail.
  const k = Math.min((W / 2 - R - 4) / L.rx, (H / 2 - R - 4) / L.ry);
  const px = (x) => (W / 2 + (x - L.cx) * k).toFixed(1), py = (y) => (H / 2 + (y - L.cy) * k).toFixed(1);
  const at = new Map(ids.map((id, i) => [id, L.nodes[i]]));
  const maxVotes = Math.max(1, ...links.map((l) => l.votes));

  const arc = (a, b) => {
    const pt = (t) => `${px(L.cx + L.rx * Math.sin(t))},${py(L.cy - L.ry * Math.cos(t))}`;
    return `M${pt(a)} A${(L.rx * k).toFixed(1)},${(L.ry * k).toFixed(1)} 0 0 1 ${pt(b)}`;
  };
  let body = `<path class="g-guide-ot" d="${arc(-SPAN, -SPLIT)}"/><path class="g-guide-nt" d="${arc(SPLIT, SPAN)}"/>`;
  body += '<g class="g-edge">';
  for (const l of links) {
    const p = at.get(l.other);
    const w = (1.5 + 4.5 * Math.sqrt(l.votes / maxVotes)).toFixed(1);
    body += `<line x1="${px(L.cx)}" y1="${py(L.cy)}" x2="${px(p.x)}" y2="${py(p.y)}" stroke-width="${w}"/>`;
  }
  body += '</g>';
  for (const id of ids) body += `<circle class="${isNT(id) ? 'g-nt' : 'g-ot'}" cx="${px(at.get(id).x)}" cy="${py(at.get(id).y)}" r="${R}"/>`;
  body += `<circle class="g-sel" cx="${px(L.cx)}" cy="${py(L.cy)}" r="${R_CENTER}"/>`;
  return { svg: SVG(`0 0 ${W} ${H}`, 'thumb-graph', round(body)), marks: ids.length + 1 };
}

export function writeThumbs(dir, data) {
  fs.mkdirSync(dir, { recursive: true });
  const results = { arcs: arcsSvg(data), books: booksSvg(data), graph: graphSvg(data) };
  for (const [name, r] of Object.entries(results)) fs.writeFileSync(path.join(dir, `${name}.svg`), r.svg);
  return results;
}
