// Radial layout for a verse's connections graph: the verse at the centre and each linked
// verse on an ellipse at its place in the Bible, Genesis at the lower left, round over the
// top (the Old Testament on the left, the New on the right) to Revelation at the lower
// right. Labels sit outside the ellipse and edges inside it, so they never cross.
// No DOM code: scripts/build-thumbs.mjs uses it for the About thumbnail.

const DEG = Math.PI / 180;
const OPEN = 70 * DEG; // the gap at the bottom, between Revelation and Genesis
export const SPLIT = 3 * DEG; // the gap at the top, between the testaments
export const SPAN = Math.PI - OPEN / 2; // angles run from -SPAN (Gen 1:1) to SPAN (Rev 22:21)

const STEP = 0.4 * DEG; // how far each overlapping pair is pushed apart per pass

// Angle of a verse, clockwise from the top, by its canonical position within its testament.
export function canonicalAngle(id, ntStart, lastId) {
  return id < ntStart
    ? -SPAN + (SPAN - SPLIT) * (id / Math.max(1, ntStart - 1))
    : SPLIT + (SPAN - SPLIT) * ((id - ntStart) / Math.max(1, lastId - ntStart));
}

// An edge from the centre c to a node p as a quadratic curve, trimmed by r1 at the centre
// and r2 at the node. bow is 0 (straight) or ±1: a verse linked both ways has two edges,
// bowed to opposite sides. Returns the curve's end and control points.
export function edgeCurve(c, p, bow, r1, r2) {
  const dx = p.x - c.x, dy = p.y - c.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const x1 = c.x + ux * r1, y1 = c.y + uy * r1;
  const x2 = p.x - ux * r2, y2 = p.y - uy * r2;
  const off = bow * len * 0.14;
  return { x1, y1, x2, y2, qx: (x1 + x2) / 2 - uy * off, qy: (y1 + y2) / 2 + ux * off };
}

// The centre label goes just below the centre, in the first band no edge passes through
// (edges are sampled along their real curves, bowed ones included).
function centerLabelTop(placed, nodes, g, o) {
  const cl = o.centerLabel;
  const half = cl.width / 2 + o.edgeClear;
  const near = [];
  placed.forEach((p, i) => {
    for (const bow of nodes[i].bothWays ? [1, -1] : [0]) {
      const e = edgeCurve({ x: g.cx, y: g.cy }, p, bow, o.rCenter + 2, o.r + 2);
      for (let k = 0; k <= 60; k++) {
        const t = k / 60;
        const x = (1 - t) ** 2 * e.x1 + 2 * t * (1 - t) * e.qx + t * t * e.x2;
        const y = (1 - t) ** 2 * e.y1 + 2 * t * (1 - t) * e.qy + t * t * e.y2;
        if (Math.abs(x - g.cx) < half && y > g.cy) near.push(y - g.cy);
      }
    }
  });
  let top = o.rCenter + 4;
  while (top < g.ry && near.some((y) => y > top - o.edgeClear && y < top + cl.height + o.edgeClear)) top++;
  return top;
}

const clamp1 = (v) => Math.max(-1, Math.min(1, v));
const overlaps = (a, b, pad) =>
  a.left < b.right + pad && b.left < a.right + pad && a.top < b.bottom + pad && b.top < a.bottom + pad;

// The label's box, pushed outwards from the node: to the right of nodes on the right,
// to the left on the left, above near the top and below near the bottom.
function labelBox(x, y, angle, r, w, o) {
  if (!w) return null;
  const s = Math.sin(angle), c = Math.cos(angle);
  const ax = x + (r + o.labelGap) * s, ay = y - (r + o.labelGap) * c;
  const left = ax - (w * (1 - clamp1(2 * s))) / 2;
  const top = ay - (o.labelHeight * (1 + clamp1(2 * c))) / 2;
  return { left, top, right: left + w, bottom: top + o.labelHeight };
}

function place(n, angle, g, o) {
  const x = g.cx + g.rx * Math.sin(angle), y = g.cy - g.ry * Math.cos(angle);
  const r = n.r ?? o.r;
  return {
    angle,
    x,
    y,
    dot: { left: x - r, right: x + r, top: y - r, bottom: y + r },
    label: labelBox(x, y, angle, r, n.labelWidth, o),
  };
}

const boxesOf = (p) => (p.label ? [p.dot, p.label] : [p.dot]);
// Nodes keep a wider berth from each other than labels do, so their edges fan out.
const collide = (p, q, o, strict) =>
  overlaps(p.dot, q.dot, strict ? 0 : o.dotPad) ||
  [p.label && [p.label, q.dot], q.label && [q.label, p.dot], p.label && q.label && [p.label, q.label]].some(
    (pair) => pair && overlaps(pair[0], pair[1], strict ? 0 : o.pad),
  );

// Spreads crowded nodes along the ellipse, keeping their canonical order, until no node
// or label overlaps another (or the passes run out). Returns the placements and overlap count.
function relax(nodes, g, o) {
  const order = nodes.map((n, i) => i).sort((i, j) => nodes[i].angle0 - nodes[j].angle0 || nodes[i].id - nodes[j].id);
  const angle = nodes.map((n) => n.angle0);
  const at = (i) => place(nodes[i], angle[i], g, o);
  // The "Genesis" and "Revelation" marks at the ends of the ellipse are fixed obstacles.
  const marks = endMarks(g, o);
  let placed = nodes.map((n, i) => at(i));
  for (let pass = 0; pass < 500; pass++) {
    let moved = false;
    for (let a = 0; a < order.length; a++) {
      for (let b = a + 1; b < order.length; b++) {
        const i = order[a], j = order[b];
        if (!collide(placed[i], placed[j], o)) continue;
        angle[i] -= STEP;
        angle[j] += STEP;
        moved = true;
      }
      const i = order[a];
      for (const m of marks) {
        if (!boxesOf(placed[i]).some((box) => overlaps(box, m.box, o.pad))) continue;
        angle[i] -= Math.sign(m.angle) * STEP;
        moved = true;
      }
    }
    if (!moved) break;
    // Keep inside the span and in canonical order.
    for (let a = 0; a < order.length; a++) {
      const i = order[a];
      angle[i] = Math.max(-SPAN, Math.min(SPAN, angle[i]));
      if (a > 0) angle[i] = Math.max(angle[i], angle[order[a - 1]]);
    }
    placed = nodes.map((n, i) => at(i));
  }
  let count = 0;
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) if (collide(placed[i], placed[j], o, true)) count++;
    for (const m of marks) if (boxesOf(placed[i]).some((box) => overlaps(box, m.box, 0))) count++;
  }
  return { placed, overlapCount: count };
}

// "Genesis" and "Revelation", centred just past each end of the ellipse, in the open gap.
function endMarks(g, o) {
  if (!o.endLabels) return [];
  return [
    [-SPAN - 9 * DEG, o.endLabels[0]],
    [SPAN + 9 * DEG, o.endLabels[1]],
  ].map(([angle, w]) => {
    const x = g.cx + g.rx * Math.sin(angle), y = g.cy - g.ry * Math.cos(angle);
    return { angle, x, y, box: { left: x - w / 2, right: x + w / 2, top: y - o.labelHeight / 2, bottom: y + o.labelHeight / 2 } };
  });
}

/**
 * nodes: [{ id, labelWidth (0 for no label), bothWays?, r? }] — every linked verse, not the centre.
 * options: width, maxHeight, ntStart, lastId, r (node radius), rCenter, labelGap,
 * labelHeight, pad, maxRadius, maxAspect (tallest ry / rx), centerLabel ({ width, height } or null), endLabels ([w, w] or null).
 * Returns { width, height, cx, cy, rx, ry, nodes: [{ angle, x, y, dot, label }],
 * centerLabel (box), ends ([{ angle, x, y, box }]), overlapCount }, everything in SVG units.
 */
export function radialLayout(nodes, options) {
  const o = { r: 8, rCenter: 13, labelGap: 5, labelHeight: 14, pad: 4, dotPad: 10, edgeClear: 6, maxAspect: 1.6, maxRadius: 190, maxHeight: Infinity, edgePad: 6, ...options };
  const prepared = nodes.map((n) => ({ ...n, angle0: canonicalAngle(n.id, o.ntStart, o.lastId) }));
  // Room for labels on each side: a graph with only New Testament links needs none on the left.
  const widest = (side) => Math.max(0, ...prepared.filter((n) => Math.sign(n.angle0) === side).map((n) => n.labelWidth));
  const leftRoom = widest(-1), rightRoom = widest(1);
  const beside = o.edgePad + o.r + o.labelGap; // between the ellipse and a side label
  const cl = o.centerLabel;
  const reserve = o.r + o.labelGap + o.labelHeight + o.edgePad; // above and below the ellipse
  const ryMax = Math.max(60, (o.maxHeight - 2 * reserve) / 2);

  let rx = Math.max(60, Math.min(o.maxRadius, (o.width - leftRoom - rightRoom) / 2 - beside));
  // Centre the drawing, ellipse and side labels together.
  const cx = (o.width + leftRoom - rightRoom) / 2;
  // A little taller than wide: the sides, where labels stack, get more room.
  let ry = Math.min(rx * 1.3, ryMax);
  let result;
  for (let attempt = 0; attempt < 24; attempt++) {
    const g = { cx, cy: 0, rx, ry };
    const { placed, overlapCount } = relax(prepared, g, o);
    const boxes = placed.flatMap(boxesOf);
    const left = Math.min(...boxes.map((b) => b.left)), right = Math.max(...boxes.map((b) => b.right));
    const fits = left >= o.edgePad && right <= o.width - o.edgePad;
    result = { g, placed, overlapCount };
    if (fits && overlapCount === 0) break;
    if (!fits && rx > 60) rx *= 0.94;
    else if (ry < Math.min(ryMax, rx * o.maxAspect)) ry = Math.min(ryMax, rx * o.maxAspect, ry * 1.08);
    else break;
  }

  // Shift everything down so the top of the drawing sits at edgePad, then size the height.
  const { g, placed, overlapCount } = result;
  const ends = endMarks(g, o);
  const all = [...placed.flatMap(boxesOf), ...ends.map((m) => m.box), { top: -g.ry, bottom: g.ry }];
  const clTop = cl ? centerLabelTop(placed, prepared, g, o) : 0;
  const centerLabel = cl ? { left: g.cx - cl.width / 2, right: g.cx + cl.width / 2, top: clTop, bottom: clTop + cl.height } : null;
  if (centerLabel) all.push(centerLabel);
  const dy = o.edgePad - Math.min(...all.map((b) => b.top));
  const height = Math.max(...all.map((b) => b.bottom)) + dy + o.edgePad;
  const shiftBox = (b) => b && { ...b, top: b.top + dy, bottom: b.bottom + dy };
  return {
    width: o.width,
    height,
    cx: g.cx,
    cy: g.cy + dy,
    rx: g.rx,
    ry: g.ry,
    nodes: placed.map((p) => ({ ...p, y: p.y + dy, dot: shiftBox(p.dot), label: shiftBox(p.label) })),
    centerLabel: shiftBox(centerLabel),
    ends: ends.map((m) => ({ ...m, y: m.y + dy, box: shiftBox(m.box) })),
    overlapCount,
  };
}
