// Force-directed graph of a verse and its strongest cross-references (SVG; at
// most 16 nodes). Node colours come from CSS tokens, so theme changes need no redraw.
import { forceSimulation, forceLink, forceManyBody, scaleSqrt } from 'd3';
import { attachPreview } from '../preview.js';
import { strongestLinks } from '../links.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const R = 8; // node radius
const R_CENTER = 13;
const ARROW = 7;
const LABEL_GAP = 5; // between a node and its label
const LABEL_HALF_HEIGHT = 9;
const LABELLED_WHEN_BUSY = 8;

let stopCurrent = () => {};

const svg = (tag, attrs = {}) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

// Top links by votes across both directions. A verse that both cites and is cited
// by the centre verse becomes one node with two edges.
function buildGraph(centerId, out, incoming, index) {
  const candidates = strongestLinks(out, incoming);

  const nodes = new Map([[centerId, { id: centerId, center: true, label: index.label(centerId, true), dirs: new Set() }]]);
  const edges = [];
  for (const c of candidates) {
    if (!nodes.has(c.other)) {
      nodes.set(c.other, { id: c.other, label: index.rangeLabel(c.other, c.end, true), dirs: new Set(), votes: 0 });
    }
    const node = nodes.get(c.other);
    node.dirs.add(c.dir);
    node.votes = Math.max(node.votes, c.votes);
    edges.push(c.dir === 'out' ? { source: centerId, target: c.other, votes: c.votes, dir: 'out' } : { source: c.other, target: centerId, votes: c.votes, dir: 'in' });
  }
  return { nodes: [...nodes.values()], edges };
}

function describe(node, index) {
  const name = index.label(node.id);
  if (node.center) return `${name}, the current verse`;
  const how =
    node.dirs.size === 2 ? 'cites and is cited by this verse' : node.dirs.has('out') ? 'cited by this verse' : 'cites this verse';
  return `${name}, ${how}, ${node.votes} votes`;
}

// Quadratic curve between two nodes, bowed to one side so a pair of opposite
// edges between the same nodes stay visible. The end stops at the node's edge.
function edgePath(e) {
  const { x: x1, y: y1 } = e.source;
  const { x: x2, y: y2 } = e.target;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const bow = len * 0.12;
  const cx = (x1 + x2) / 2 - (dy / len) * bow;
  const cy = (y1 + y2) / 2 + (dx / len) * bow;
  const r = (e.target.center ? R_CENTER : R) + 2;
  const tx = x2 - cx, ty = y2 - cy;
  const tl = Math.hypot(tx, ty) || 1;
  return `M${x1},${y1} Q${cx},${cy} ${x2 - (tx / tl) * r},${y2 - (ty / tl) * r}`;
}

// The box a node and its visible label occupy (labels sit to the right of the node).
function box(n, x = n.x, y = n.y) {
  const half = Math.max(n.r, LABEL_HALF_HEIGHT);
  const right = n.showLabel ? n.r + LABEL_GAP + n.labelWidth : n.r;
  return { left: x - n.r, right: x + right, top: y - half, bottom: y + half };
}

const overlap = (a, b) => [Math.min(a.right, b.right) - Math.max(a.left, b.left), Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)];

function countOverlaps(nodes) {
  let count = 0;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const [ox, oy] = overlap(box(nodes[i]), box(nodes[j]));
      if (ox > 0.5 && oy > 0.5) count++;
    }
  }
  return count;
}

// Collision force on node+label boxes: pushes overlapping pairs apart along
// the axis where they overlap least. The fixed centre node never moves.
function forceBoxes(padding = 4, strength = 0.6) {
  let nodes = [];
  const force = () => {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const ba = box(a, a.x + a.vx, a.y + a.vy);
        const bb = box(b, b.x + b.vx, b.y + b.vy);
        let [ox, oy] = overlap(ba, bb);
        ox += padding;
        oy += padding;
        if (ox <= 0 || oy <= 0) continue;
        const shareA = a.fx != null ? 0 : b.fx != null ? 1 : 0.5;
        if (ox < oy) {
          const dir = ba.left + ba.right < bb.left + bb.right ? -1 : 1;
          a.vx += dir * ox * strength * shareA;
          b.vx -= dir * ox * strength * (1 - shareA);
        } else {
          const dir = ba.top + ba.bottom < bb.top + bb.bottom ? -1 : 1;
          a.vy += dir * oy * strength * shareA;
          b.vy -= dir * oy * strength * (1 - shareA);
        }
      }
    }
  };
  force.initialize = (n) => (nodes = n);
  return force;
}

// Keeps every node, and room for its full label (shown on hover if hidden), inside the SVG.
function forceBounds(width, height) {
  let nodes = [];
  const force = () => {
    for (const n of nodes) {
      if (n.fx != null) continue;
      const minX = n.r + 4;
      // A label wider than the graph can't fit; keep the node itself on screen.
      const maxX = Math.max(minX, width - n.r - LABEL_GAP - n.labelWidth - 4);
      const minY = LABEL_HALF_HEIGHT + 4, maxY = height - LABEL_HALF_HEIGHT - 4;
      const x = n.x + n.vx, y = n.y + n.vy;
      if (x < minX) n.vx = minX - n.x;
      else if (x > maxX) n.vx = maxX - n.x;
      if (y < minY) n.vy = minY - n.y;
      else if (y > maxY) n.vy = maxY - n.y;
    }
  };
  force.initialize = (n) => (nodes = n);
  return force;
}

export function renderGraph(container, { centerId, out, incoming, index }) {
  stopCurrent();
  const { nodes, edges } = buildGraph(centerId, out, incoming, index);
  container.replaceChildren();
  if (edges.length === 0) return false;

  const width = Math.max(280, container.clientWidth);
  const height = width < 480 ? 340 : 420;
  const maxVotes = Math.max(1, ...edges.map((e) => e.votes));
  const strokeWidth = scaleSqrt().domain([0, maxVotes]).range([1, 6]);

  const root = svg('svg', {
    class: 'graph',
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    role: 'group',
    'aria-label': `${index.label(centerId)} and its ${edges.length} strongest cross-references`,
  });
  const defs = svg('defs');
  for (const kind of ['strong', 'faint']) {
    const marker = svg('marker', {
      id: `arrow-${kind}`,
      viewBox: `0 0 ${ARROW} ${ARROW}`,
      refX: ARROW,
      refY: ARROW / 2,
      markerWidth: ARROW,
      markerHeight: ARROW,
      markerUnits: 'userSpaceOnUse',
      orient: 'auto',
    });
    marker.append(svg('path', { d: `M0,0 L${ARROW},${ARROW / 2} L0,${ARROW} z`, class: `arrowhead ${kind}` }));
    defs.append(marker);
  }
  root.append(defs);

  const edgeLayer = svg('g', { class: 'graph-edges', 'aria-hidden': 'true' });
  const edgeEls = edges.map((e) => {
    const kind = e.votes === 0 ? 'faint' : 'strong';
    const path = svg('path', { class: `graph-edge ${kind}`, 'stroke-width': strokeWidth(e.votes), 'marker-end': `url(#arrow-${kind})` });
    edgeLayer.append(path);
    return path;
  });
  root.append(edgeLayer);

  // Each node is an SVG link, so it is focusable and opens with Enter or a click.
  const nodeLayer = svg('g', { class: 'graph-nodes' });
  const nodeEls = nodes.map((n) => {
    const testament = index.testament(n.id) === 'OT' ? 'ot' : 'nt';
    const link = svg('a', {
      href: `#/verse/${index.osis(n.id)}`,
      class: `graph-node ${n.center ? 'is-current' : testament}`,
      'aria-label': describe(n, index),
    });
    if (n.center) link.setAttribute('aria-current', 'page');
    link.append(svg('circle', { r: n.center ? R_CENTER : R }));
    const text = svg('text', { x: (n.center ? R_CENTER : R) + LABEL_GAP, y: 4 });
    text.textContent = n.label;
    link.append(text);
    if (!n.center) attachPreview(link, index, n.id, index.label(n.id));
    nodeLayer.append(link);
    return link;
  });
  root.append(nodeLayer);
  container.append(root);

  // Measure labels now that they're in the document (fonts are loaded by the caller).
  nodes.forEach((n, i) => {
    n.r = n.center ? R_CENTER : R;
    n.labelWidth = nodeEls[i].querySelector('text').getComputedTextLength();
    n.showLabel = true;
  });

  const centre = nodes[0];
  centre.fx = width / 2;
  centre.fy = height / 2;
  // Start the other nodes in a ring around the centre so the layout grows outwards.
  const resetPositions = () =>
    nodes.slice(1).forEach((n, i, rest) => {
      const angle = (2 * Math.PI * i) / rest.length;
      n.x = centre.fx + Math.cos(angle) * 60;
      n.y = centre.fy + Math.sin(angle) * 60;
      n.vx = n.vy = 0;
    });

  const makeSim = () =>
    forceSimulation(nodes)
      .force(
        'link',
        forceLink(edges)
          .id((d) => d.id)
          .distance((e) => 175 - 70 * (e.votes / maxVotes))
          .strength(0.6),
      )
      .force('charge', forceManyBody().strength(-320))
      .force('boxes', forceBoxes())
      .force('bounds', forceBounds(width, height))
      .stop();

  // Keep labels only on the current verse and the top nodes by votes; the rest
  // appear on hover/focus. Hidden labels no longer take up room in the layout.
  let busy = false;
  const showFewerLabels = () => {
    busy = true;
    const keep = new Set(
      nodes
        .filter((n) => !n.center)
        .sort((a, b) => b.votes - a.votes)
        .slice(0, LABELLED_WHEN_BUSY),
    );
    nodes.forEach((n, i) => {
      n.showLabel = n.center || keep.has(n);
      nodeEls[i].classList.toggle('label-on-demand', !n.showLabel);
    });
  };

  // Lay out once off-screen to see whether all labels fit.
  resetPositions();
  makeSim().tick(300);
  if (countOverlaps(nodes) > 0) showFewerLabels();

  const draw = () => {
    edges.forEach((e, i) => edgeEls[i].setAttribute('d', edgePath(e)));
    nodes.forEach((n, i) => nodeEls[i].setAttribute('transform', `translate(${n.x},${n.y})`));
  };

  // Hidden labels are drawn in an overlay on hover/focus, above every node.
  // (Moving the node itself to the top would change the keyboard tab order.)
  const overlay = svg('text', { class: 'graph-overlay-label', 'aria-hidden': 'true', visibility: 'hidden' });
  root.append(overlay);
  nodes.forEach((n, i) => {
    const el = nodeEls[i];
    const reveal = () => {
      if (n.showLabel) return;
      overlay.textContent = n.label;
      overlay.setAttribute('x', n.x + n.r + LABEL_GAP);
      overlay.setAttribute('y', n.y + 4);
      overlay.setAttribute('visibility', 'visible');
    };
    const conceal = () => overlay.setAttribute('visibility', 'hidden');
    el.addEventListener('mouseenter', reveal);
    el.addEventListener('focus', reveal);
    el.addEventListener('mouseleave', conceal);
    el.addEventListener('blur', conceal);
  });

  resetPositions();
  const sim = makeSim();
  // Safety net: if the final layout still has overlapping labels, thin them out.
  const settle = () => {
    if (!busy && countOverlaps(nodes) > 0) showFewerLabels();
  };
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    sim.tick(300);
    draw();
    settle();
  } else {
    sim.on('tick', draw).on('end', settle).restart();
  }
  stopCurrent = () => sim.stop();
  return true;
}
