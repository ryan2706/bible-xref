// Radial layout for a verse's connections graph: the verse at the centre and each linked
// verse on a circle at its place in the Bible, Genesis at the lower left, round over the
// top (the Old Testament on the left, the New on the right) to Revelation at the lower
// right. Labels sit outside the circle and edges inside it, so they never cross. The
// circle is always whole and centred, however the links fall.
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

// The centre label goes in the band nearest the centre, just below it or else just above,
// that no edge passes through (edges are sampled along their real curves, bowed ones
// included) and clear of the end marks. Returns its top, relative to the centre.
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
        if (Math.abs(x - g.cx) < half) near.push(y - g.cy);
      }
    }
  });
  const marks = endMarks(g, o).map((m) => m.box);
  const clear = (top) =>
    !near.some((y) => y > top - o.edgeClear && y < top + cl.height + o.edgeClear) &&
    !marks.some((m) => overlaps(m, { left: g.cx - cl.width / 2, right: g.cx + cl.width / 2, top: g.cy + top, bottom: g.cy + top + cl.height }, o.pad));
  const below = o.rCenter + 4, above = -o.rCenter - 4 - cl.height;
  for (let d = 0; d < g.radius - o.r - below; d++) {
    if (clear(below + d)) return below + d;
    if (clear(above - d)) return above - d;
  }
  return g.radius;
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
  const x = g.cx + g.radius * Math.sin(angle), y = g.cy - g.radius * Math.cos(angle);
  const r = n.r ?? o.r;
  return {
    angle,
    x,
    y,
    r,
    dot: { left: x - r, right: x + r, top: y - r, bottom: y + r },
    label: labelBox(x, y, angle, r, n.labelWidth, o),
  };
}

const boxesOf = (p) => (p.label ? [p.dot, p.label] : [p.dot]);
// Nodes keep a wider berth from each other (dotPad, measured between the circles) than
// labels do, so their edges fan out.
const STRICT_PAD = 2;
const collide = (p, q, o, strict, dotPad = o.dotPad) =>
  Math.hypot(p.x - q.x, p.y - q.y) < p.r + q.r + (strict ? 0 : dotPad) ||
  [p.label && [p.label, q.dot], q.label && [q.label, p.dot], p.label && q.label && [p.label, q.label]].some(
    (pair) => pair && overlaps(pair[0], pair[1], strict ? STRICT_PAD : o.pad),
  );

// A node's dot may come close to an end mark (one at the very end sits on its tick), but
// its label may not cross the tick or share the mark's row nearby.
const hitsMark = (p, m, pad) => {
  const tick = { left: m.tick.x1 - 1, right: m.tick.x1 + 1, top: m.tick.y1, bottom: m.tick.y2 };
  return overlaps(p.dot, m.box, pad) || (p.label && (overlaps(p.label, m.zone, pad) || overlaps(p.label, tick, pad)));
};

// Spreads crowded nodes along the circle, keeping their canonical order, until no node
// or label overlaps another (or the passes run out). Returns the placements and overlap count.
function relax(nodes, g, o) {
  const order = nodes.map((n, i) => i).sort((i, j) => nodes[i].angle0 - nodes[j].angle0 || nodes[i].id - nodes[j].id);
  const angle = nodes.map((n) => n.angle0);
  const at = (i) => place(nodes[i], angle[i], g, o);
  // The "Genesis" and "Revelation" marks at the ends of the circle are fixed obstacles.
  const marks = endMarks(g, o);
  // A crowded half can't give every node the full berth: share out what its arc holds,
  // or the passes jam with some nodes still touching.
  const dotPad = [-1, 1].map((side) => {
    const n = nodes.filter((nd) => Math.sign(nd.angle0) === side).length;
    const arc = (SPAN - SPLIT) * g.radius;
    return n < 2 ? o.dotPad : Math.max(1, Math.min(o.dotPad, arc / (n - 1) - 2 * o.r - 1));
  });
  const lo = (i) => (nodes[i].angle0 < 0 ? -SPAN : SPLIT), hi = (i) => (nodes[i].angle0 < 0 ? -SPLIT : SPAN);
  const padFor = (i, j) => Math.min(dotPad[nodes[i].angle0 < 0 ? 0 : 1], dotPad[nodes[j].angle0 < 0 ? 0 : 1]);
  let placed = nodes.map((n, i) => at(i));
  for (let pass = 0; pass < 80; pass++) {
    let moved = false;
    for (let a = 0; a < order.length; a++) {
      for (let b = a + 1; b < order.length; b++) {
        const i = order[a], j = order[b];
        if (!collide(placed[i], placed[j], o, false, padFor(i, j))) continue;
        angle[i] -= STEP;
        angle[j] += STEP;
        moved = true;
      }
      const i = order[a];
      for (const m of marks) {
        if (!hitsMark(placed[i], m, o.pad)) continue;
        angle[i] -= Math.sign(m.angle) * STEP;
        moved = true;
      }
    }
    if (!moved) break;
    // Keep each verse on its testament's half and in canonical order.
    for (let a = 0; a < order.length; a++) {
      const i = order[a];
      angle[i] = Math.max(lo(i), Math.min(hi(i), angle[i]));
      if (a > 0) angle[i] = Math.max(angle[i], angle[order[a - 1]]);
    }
    placed = nodes.map((n, i) => at(i));
  }
  // Those pushes balance each crowd round its canonical places, but a long jam moves only a
  // step a pass. Finish with sweeps: each node pushed clockwise clear of every node before it
  // (and the Genesis mark), then anticlockwise clear of every node after it (and the
  // Revelation mark), as far as its half allows.
  const clash = (i, others, mark) =>
    others.some((j) => collide(placed[i], placed[j], o, false, padFor(i, j))) || (mark && hitsMark(placed[i], mark, o.pad));
  for (let sweep = 0; sweep < 6; sweep++) {
    let moved = false;
    for (let a = 0; a < order.length; a++) {
      const i = order[a], before = order.slice(0, a);
      while (angle[i] < hi(i) && clash(i, before, marks[0])) {
        angle[i] = Math.min(hi(i), angle[i] + STEP);
        placed[i] = at(i);
        moved = true;
      }
    }
    for (let a = order.length - 1; a >= 0; a--) {
      const i = order[a], after = order.slice(a + 1);
      const floor = a > 0 ? Math.max(lo(i), angle[order[a - 1]]) : lo(i);
      while (angle[i] > floor && clash(i, after, marks[1])) {
        angle[i] = Math.max(floor, angle[i] - STEP);
        placed[i] = at(i);
        moved = true;
      }
    }
    if (!moved) break;
  }
  // Count what still overlaps, with a little margin: rendered text can be a pixel taller than labelHeight.
  let count = 0;
  const clashing = new Set();
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      if (!collide(placed[i], placed[j], o, true)) continue;
      count++;
      clashing.add(i).add(j);
    }
    for (const m of marks) {
      if (!hitsMark(placed[i], m, STRICT_PAD)) continue;
      count++;
      clashing.add(i);
    }
  }
  return { placed, overlapCount: count, clashing };
}

// "Genesis" and "Revelation" hang from a tick dropped from each end of the circle, on a row
// of their own under the gap: below the lowest a verse label can reach (the label of a node
// at the very end), Genesis reading right from its tick and Revelation ending at its, so
// neither ever sits beside a verse label. If the gap is too narrow for both side by side,
// Revelation's drops another line.
const TICK_GAP = 4; // between a tick and its label
const END_CLEAR = 30; // no verse label within this of an end label's row (see hitsMark)
function endMarks(g, o) {
  if (!o.endLabels) return [];
  const h = o.endLabelHeight ?? o.labelHeight;
  const marks = [-SPAN, SPAN].map((angle, i) => {
    const x = g.cx + g.radius * Math.sin(angle), y = g.cy - g.radius * Math.cos(angle);
    const top = y - (o.r + o.labelGap) * Math.cos(angle) + o.labelHeight + o.pad;
    const w = o.endLabels[i];
    const left = i === 0 ? x + TICK_GAP : x - TICK_GAP - w;
    return { angle, x, y, box: { left, right: left + w, top, bottom: top + h } };
  });
  const [gen, rev] = marks;
  if (gen.box.right + o.pad > rev.box.left) rev.box = { ...rev.box, top: gen.box.bottom + STRICT_PAD, bottom: gen.box.bottom + STRICT_PAD + h };
  for (const m of marks) {
    m.tick = { x1: m.x, y1: m.y, x2: m.x, y2: m.box.bottom };
    m.zone = { ...m.box, left: m.box.left - END_CLEAR, right: m.box.right + END_CLEAR };
  }
  return marks;
}

/**
 * nodes: [{ id, labelWidth (0 for no label), bothWays?, r? }] — every linked verse, not the centre.
 * options: width, maxHeight, ntStart, lastId, r (node radius), rCenter, labelGap,
 * labelHeight, pad, maxRadius, centerLabel ({ width, height } or null), endLabels ([w, w] or null).
 * Returns { width, height, cx, cy, radius, nodes: [{ angle, x, y, dot, label }],
 * centerLabel (box), ends ([{ angle, x, y, tick, box, zone }]), overlapCount, clashing (indices of
 * the nodes still overlapping something) }, everything in SVG units.
 */
export function radialLayout(nodes, options) {
  const o = { r: 8, rCenter: 13, labelGap: 5, labelHeight: 14, pad: 4, dotPad: 10, edgeClear: 6, maxRadius: 190, maxHeight: Infinity, edgePad: 6, ...options };
  const prepared = nodes.map((n) => ({ ...n, angle0: canonicalAngle(n.id, o.ntStart, o.lastId) }));
  const cl = o.centerLabel;
  const cx = o.width / 2;
  // Above the circle: a label over a node at the top. Below it: the lowest of the circle and
  // the end marks (at most two lines under the labels of nodes at the ends).
  const above = o.r + o.labelGap + o.labelHeight;
  const belowEnds = o.r + o.labelGap + o.labelHeight + o.pad + 2 * (o.endLabelHeight ?? o.labelHeight);
  const heightFor = (radius) => o.edgePad + above + radius + Math.max(radius, radius * -Math.cos(SPAN) + belowEnds) + o.edgePad;
  // The largest circle the height allows, and the width (with room for the widest label on each side).
  // Never smaller than the circle whose busiest half holds its dots without touching.
  const busiest = Math.max(...[-1, 1].map((side) => prepared.filter((n) => Math.sign(n.angle0) === side).length));
  const rMin = Math.max(40, ((busiest - 1) * (2 * o.r + 2)) / (SPAN - SPLIT));
  let radius = o.maxRadius;
  while (radius > rMin && heightFor(radius) > o.maxHeight) radius -= 2;
  const widest = Math.max(0, ...prepared.map((n) => n.labelWidth));
  radius = Math.max(rMin, Math.min(radius, o.width / 2 - o.edgePad - (widest ? o.r + o.labelGap + widest : o.r)));

  // Labels near the top and bottom need less width than the widest at the sides, so start
  // larger and shrink until everything fits inside the width. A label still outside it at the
  // smallest circle counts as overlapping, so the caller can hide it.
  const fitsAt = (radius) => {
    const g = { cx, cy: 0, radius };
    let { placed, overlapCount, clashing } = relax(prepared, g, o);
    const out = (b) => b.left < o.edgePad || b.right > o.width - o.edgePad;
    placed.forEach((p, i) => {
      if (!p.label || !out(p.label)) return;
      overlapCount++;
      clashing.add(i);
    });
    const fits = !placed.some((p) => out(p.dot) || (p.label && out(p.label))) && !endMarks(g, o).some((m) => out(m.box));
    return { g, placed, overlapCount, clashing, fits };
  };
  let result = fitsAt(radius);
  for (let grow = radius * 1.04; result.fits && grow <= o.maxRadius && heightFor(grow) <= o.maxHeight; grow *= 1.04) {
    const bigger = fitsAt(grow);
    if (!bigger.fits || bigger.overlapCount > result.overlapCount) break;
    result = bigger;
  }
  while (!result.fits && result.g.radius > rMin) result = fitsAt(Math.max(rMin, result.g.radius * 0.96));

  // Shift everything down so the top of the drawing sits at edgePad, then size the height.
  const { g, placed, overlapCount, clashing } = result;
  const ends = endMarks(g, o);
  const all = [...placed.flatMap(boxesOf), ...ends.map((m) => m.box), { top: -g.radius - (o.labelHeight ? above : o.r), bottom: g.radius }];
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
    radius: g.radius,
    nodes: placed.map((p) => ({ ...p, y: p.y + dy, dot: shiftBox(p.dot), label: shiftBox(p.label) })),
    centerLabel: shiftBox(centerLabel),
    ends: ends.map((m) => ({ ...m, y: m.y + dy, tick: { ...m.tick, y1: m.tick.y1 + dy, y2: m.tick.y2 + dy }, box: shiftBox(m.box), zone: shiftBox(m.zone) })),
    overlapCount,
    clashing: [...clashing],
  };
}
