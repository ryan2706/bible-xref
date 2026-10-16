// The top of every view, the same everywhere: the title, a one-line intro, and a
// collapsible "How to read this". It starts open on a visitor's first visit to the
// site; after that, open or closed is remembered across views and visits
// (localStorage `how-to-open`: '1' open, '0' closed, missing on a first visit).
import { h } from './dom.js';

const OPEN_KEY = 'how-to-open';

function storedOpen() {
  try {
    const stored = localStorage.getItem(OPEN_KEY);
    if (stored !== null) return stored === '1';
    localStorage.setItem(OPEN_KEY, '1'); // first visit: open, and remembered as such
    return true;
  } catch {
    return true; // no storage: every visit is a first visit
  }
}

// `intro` is text or an array of children. Each `howTo` item is a paragraph's text,
// an array of a paragraph's children, or an element used as is. Returns the header
// and its parts, so a view can update the title or the guide later.
export function viewHeader(titleText, intro, howTo = []) {
  const title = h('h1', { class: 'view-title', tabindex: '-1' }, titleText);
  const header = h('header', { class: 'view-header' }, title, h('p', { class: 'view-intro' }, ...[intro].flat()));
  const guide = h('div', { class: 'how-to-body' }, ...howTo.map(paragraph));
  if (howTo.length) {
    const details = h('details', { class: 'how-to' }, h('summary', {}, 'How to read this'), guide);
    details.open = storedOpen();
    details.addEventListener('toggle', () => {
      try {
        localStorage.setItem(OPEN_KEY, details.open ? '1' : '0');
      } catch {}
    });
    header.append(details);
  }
  return { header, title, guide };
}

const paragraph = (item) => (item instanceof Node ? item : h('p', {}, ...[item].flat()));
