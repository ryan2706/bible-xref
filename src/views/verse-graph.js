// Radial graph of a verse and its strongest cross-references (SVG; at most 16 nodes).
// Linked verses sit around the verse in canonical order (see src/graph-layout.js), labels
// outside the ellipse and edges inside it. Colours come from CSS tokens, so theme changes
// need no redraw.
import { scaleSqrt } from 'd3';
import { attachPreview } from '../preview.js';
import { strongestLinks } from '../links.js';
import { radialLayout, edgeCurve, SPAN, SPLIT } from '../graph-layout.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const R = 8; // node radius
const R_CENTER = 13;
const LABEL_GAP = 5; // between a node and its label
const LABEL_HEIGHT = 15;
const LABELLED_WHEN_BUSY = 8;

const svg = (tag, attrs = {}) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

// The verses to draw (see strongestLinks). A verse that both cites and is cited by
// the centre verse becomes one node with two edges.
function buildGraph(centerId, out, incoming, index) {
  const candidates = strongestLinks(out, incoming);
  const nodes = new Map();
  const edges = [];
  for (const c of candidates) {
    if (!nodes.has(c.other)) {
      nodes.set(c.other, { id: c.other, label: index.rangeLabel(c.other, c.end, true), dirs: new Set(), votes: 0 });
    }
    const node = nodes.get(c.other);
    node.dirs.add(c.dir);
    node.votes = Math.max(node.votes, c.votes);
    edges.push({ node, dir: c.dir, votes: c.votes });
  }
  return { nodes: [...nodes.values()], edges };
}

function describe(node, index) {
  const how =
    node.dirs.size === 2 ? 'cites and is cited by this verse' : node.dirs.has('out') ? 'cited by this verse' : 'cites this verse';
  return `${index.label(node.id)}, ${how}, ${node.votes} votes`;
}

// An edge between the centre and a node, trimmed to the circles' edges. Two edges
// between the same pair bow to opposite sides. Returns the path and an arrowhead
// on its outer part, where edges have fanned apart, pointing from the citing verse
// to the cited one.
function edgeShape(c, p, bow, toNode, width) {
  const { x1, y1, x2, y2, qx, qy } = edgeCurve(c, p, bow, R_CENTER + 2, R + 2);
  // A point 70% of the way out along the curve, and the curve's direction there.
  const t = 0.7;
  const mx = (1 - t) ** 2 * x1 + 2 * t * (1 - t) * qx + t * t * x2, my = (1 - t) ** 2 * y1 + 2 * t * (1 - t) * qy + t * t * y2;
  const vx = (1 - t) * (qx - x1) + t * (x2 - qx), vy = (1 - t) * (qy - y1) + t * (y2 - qy);
  const vl = Math.hypot(vx, vy) || 1;
  const dir = toNode ? 1 : -1;
  const head = 7 + 1.6 * width, half = 3.5 + 0.9 * width;
  const ax = vx / vl, ay = vy / vl;
  const tx = mx + ax * dir * (head / 2), ty = my + ay * dir * (head / 2);
  const bx = mx - ax * dir * (head / 2), by = my - ay * dir * (head / 2);
  const arrow = `M${tx},${ty} L${bx - ay * half},${by + ax * half} L${bx + ay * half},${by - ax * half} z`;
  const d = toNode ? `M${x1},${y1} Q${qx},${qy} ${x2},${y2}` : `M${x2},${y2} Q${qx},${qy} ${x1},${y1}`;
  return { d, arrow };
}

// A stretch of the ellipse, clockwise from angle a to angle b.
function ellipseArc(L, a, b) {
  const pt = (t) => `${L.cx + L.rx * Math.sin(t)},${L.cy - L.ry * Math.cos(t)}`;
  return `M${pt(a)} A${L.rx},${L.ry} 0 ${b - a > Math.PI ? 1 : 0} 1 ${pt(b)}`;
}

/**
 * Draws the graph into container. Returns false if the verse has no links, otherwise
 * which kinds of mark were drawn ({ ot, nt, out, in, faint }) for the legend.
 */
export function renderGraph(container, { centerId, out, incoming, index, maxHeight = Infinity }) {
  const { nodes, edges } = buildGraph(centerId, out, incoming, index);
  container.replaceChildren();
  if (edges.length === 0) return false;

  const width = Math.max(280, container.clientWidth);
  const maxVotes = Math.max(1, ...edges.map((e) => e.votes));
  const strokeWidth = scaleSqrt().domain([0, maxVotes]).range([1.25, 6]);
  const ntStart = index.books.find((b) => b.testament === 'NT').firstId;
  const lastId = index.books.at(-1).lastId;

  const root = svg('svg', {
    class: 'graph',
    role: 'group',
    'aria-label': `${index.label(centerId)} and ${nodes.length} of its most connected verses, placed around it in Bible order from Genesis to Revelation`,
  });
  const guide = svg('g', { class: 'graph-guide', 'aria-hidden': 'true' });
  const edgeLayer = svg('g', { class: 'graph-edges', 'aria-hidden': 'true' });
  const nodeLayer = svg('g', { class: 'graph-nodes' });
  root.append(guide, edgeLayer, nodeLayer);

  // Each node is an SVG link, so it is focusable and opens with Enter or a click.
  // Links follow canonical order, so Tab moves round the ellipse from Genesis to Revelation.
  nodes.sort((a, b) => a.id - b.id);
  const nodeEls = nodes.map((n) => {
    n.testament = index.testament(n.id) === 'OT' ? 'ot' : 'nt';
    const link = svg('a', { href: `#/verse/${index.osis(n.id)}`, class: `graph-node ${n.testament}`, 'aria-label': describe(n, index) });
    link.append(svg('circle', { r: R }));
    const text = svg('text', { 'dominant-baseline': 'central' });
    text.textContent = n.label;
    link.append(text);
    attachPreview(link, index, n.id, index.label(n.id), { tapTwice: true });
    nodeLayer.append(link);
    return link;
  });
  const center = svg('g', { class: 'graph-node is-current', 'aria-hidden': 'true' });
  const centerText = svg('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' });
  centerText.textContent = index.label(centerId, true);
  center.append(svg('circle', { r: R_CENTER }), centerText);
  nodeLayer.append(center);
  const endTexts = ['Genesis', 'Revelation'].map((name) => {
    const t = svg('text', { class: 'graph-end', 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    t.textContent = name;
    guide.append(t);
    return t;
  });
  // Hidden labels are drawn in an overlay on hover/focus, above every node.
  // (Moving the node itself to the top would change the keyboard tab order.)
  const overlay = svg('text', { class: 'graph-overlay-label', 'aria-hidden': 'true', 'dominant-baseline': 'central', visibility: 'hidden' });
  root.append(overlay);
  container.append(root);

  // Measure labels now that they're in the document (fonts are loaded by the caller).
  nodes.forEach((n, i) => {
    n.labelWidth = Math.ceil(nodeEls[i].querySelector('text').getComputedTextLength());
    n.showLabel = true;
  });
  const options = {
    width,
    maxHeight,
    ntStart,
    lastId,
    r: R,
    rCenter: R_CENTER,
    labelGap: LABEL_GAP,
    labelHeight: LABEL_HEIGHT,
    // A narrow column has height to spare, so the ellipse may grow taller to fit every label.
    maxAspect: width < 480 ? 2.4 : 1.6,
    centerLabel: { width: Math.ceil(centerText.getComputedTextLength()), height: LABEL_HEIGHT },
    endLabels: endTexts.map((t) => Math.ceil(t.getComputedTextLength())),
  };
  const layoutWith = () => radialLayout(nodes.map((n) => ({ id: n.id, labelWidth: n.showLabel ? n.labelWidth : 0, bothWays: n.dirs.size === 2 })), options);
  let L = layoutWith();
  // If the labels can't all fit, keep only the top nodes' labels, fewer until they fit;
  // the rest appear on hover/focus.
  const byVotes = [...nodes].sort((a, b) => b.votes - a.votes);
  for (let keep = LABELLED_WHEN_BUSY; L.overlapCount > 0 && keep >= 0; keep--) {
    const kept = new Set(byVotes.slice(0, keep));
    nodes.forEach((n, i) => {
      n.showLabel = kept.has(n);
      nodeEls[i].classList.toggle('label-on-demand', !n.showLabel);
    });
    L = layoutWith();
  }

  root.setAttribute('width', width);
  root.setAttribute('height', Math.ceil(L.height));
  root.setAttribute('viewBox', `0 0 ${width} ${Math.ceil(L.height)}`);

  // The ellipse itself, in two halves: lapis for the Old Testament, gold for the New.
  guide.prepend(
    svg('path', { class: 'graph-guide-ot', d: ellipseArc(L, -SPAN, -SPLIT) }),
    svg('path', { class: 'graph-guide-nt', d: ellipseArc(L, SPLIT, SPAN) }),
  );
  L.ends.forEach((m, i) => {
    endTexts[i].setAttribute('x', m.x);
    endTexts[i].setAttribute('y', (m.box.top + m.box.bottom) / 2);
  });

  nodes.forEach((n, i) => {
    const p = L.nodes[i];
    n.place = p;
    nodeEls[i].setAttribute('transform', `translate(${p.x},${p.y})`);
    const text = nodeEls[i].querySelector('text');
    const box = p.label;
    if (box) {
      text.setAttribute('x', box.left - p.x);
      text.setAttribute('y', (box.top + box.bottom) / 2 - p.y);
    } else {
      // On-demand labels sit beside the node, on its outer side.
      const side = Math.sin(p.angle) >= 0 ? 1 : -1;
      text.setAttribute('x', side * (R + LABEL_GAP));
      text.setAttribute('y', 0);
      text.setAttribute('text-anchor', side > 0 ? 'start' : 'end');
    }
  });
  const c = { x: L.cx, y: L.cy };
  center.setAttribute('transform', `translate(${c.x},${c.y})`);
  centerText.setAttribute('y', (L.centerLabel.top + L.centerLabel.bottom) / 2 - c.y);

  const edgeEls = new Map(nodes.map((n) => [n, []]));
  for (const e of edges) {
    const both = e.node.dirs.size === 2;
    const w = strokeWidth(e.votes);
    const { d, arrow } = edgeShape(c, e.node.place, both ? (e.dir === 'out' ? 1 : -1) : 0, e.dir === 'out', w);
    const kind = e.votes === 0 ? 'faint' : 'strong';
    const g = svg('g', { class: `graph-edge ${kind}` });
    g.append(svg('path', { class: 'graph-edge-line', d, 'stroke-width': w }), svg('path', { class: 'graph-arrow', d: arrow }));
    edgeLayer.append(g);
    edgeEls.get(e.node).push(g);
  }

  // Hover/focus: a node's edges darken, and a hidden label shows in the overlay.
  nodes.forEach((n, i) => {
    const el = nodeEls[i];
    const on = () => {
      for (const g of edgeEls.get(n)) {
        g.classList.add('is-hot');
        edgeLayer.append(g); // draw on top of the other edges
      }
      if (n.showLabel) return;
      const side = Math.sin(n.place.angle) >= 0 ? 1 : -1;
      overlay.textContent = n.label;
      overlay.setAttribute('x', n.place.x + side * (R + LABEL_GAP));
      overlay.setAttribute('y', n.place.y);
      overlay.setAttribute('text-anchor', side > 0 ? 'start' : 'end');
      overlay.setAttribute('visibility', 'visible');
    };
    const off = () => {
      for (const g of edgeEls.get(n)) g.classList.remove('is-hot');
      overlay.setAttribute('visibility', 'hidden');
    };
    el.addEventListener('mouseenter', on);
    el.addEventListener('focus', on);
    el.addEventListener('mouseleave', off);
    el.addEventListener('blur', off);
  });

  return {
    ot: nodes.some((n) => n.testament === 'ot'),
    nt: nodes.some((n) => n.testament === 'nt'),
    out: edges.some((e) => e.dir === 'out'),
    in: edges.some((e) => e.dir === 'in'),
    faint: edges.some((e) => e.votes === 0),
  };
}
