// Chart legends, laid out the same on every view and at every width: a wrapping row
// of swatch and text, right under the chart. A swatch is a kind ('ot', 'nt', 'cross',
// 'current'), a colour token ('--sec-law'), or an element (e.g. a small SVG edge).
import { h } from './dom.js';

function swatch(kind) {
  if (kind instanceof Node) return kind;
  if (kind.startsWith('--')) return h('span', { class: 'swatch', style: `background: var(${kind})` });
  return h('span', { class: `swatch ${kind}` });
}

// `items` are [swatch, text] pairs; falsy items are skipped, so a legend can list
// only the marks a chart actually draws.
export const legend = (items, label = 'Legend') =>
  h(
    'ul',
    { class: 'legend', 'aria-label': label },
    items.filter(Boolean).map(([kind, text]) => h('li', {}, swatch(kind), text)),
  );
