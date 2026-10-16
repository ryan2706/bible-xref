// A short text preview of a verse, shown when a reference is hovered or focused.
// One shared popover for the whole page. It stays open while the pointer is over
// it, and Escape closes it (WCAG 1.4.13).
import { h } from './dom.js';
import { getVerseText } from './data.js';
import { kjvMark } from './version.js';

const PREVIEW_CHARS = 160;
let popover;
let current = null; // the element the popover is attached to
let hideTimer;
let token = 0;

function ensurePopover() {
  if (popover) return popover;
  popover = h('div', { class: 'preview', role: 'tooltip', id: 'verse-preview', hidden: '' });
  popover.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  popover.addEventListener('mouseleave', scheduleHide);
  document.body.append(popover);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !popover.hidden) hide();
  });
  window.addEventListener('hashchange', hide);
  return popover;
}

function place(anchor) {
  const r = anchor.getBoundingClientRect();
  const gap = 8;
  const width = Math.min(352, window.innerWidth - 32);
  popover.style.width = `${width}px`;
  const left = Math.min(Math.max(16, r.left), window.innerWidth - width - 16);
  popover.style.left = `${left + window.scrollX}px`;
  // Below the anchor if it fits, otherwise above.
  const height = popover.offsetHeight;
  const below = r.bottom + gap + height <= window.innerHeight;
  const top = below ? r.bottom + gap : r.top - gap - height;
  popover.style.top = `${Math.max(8, top) + window.scrollY}px`;
}

function trim(text) {
  if (text.length <= PREVIEW_CHARS) return text;
  return text.slice(0, text.lastIndexOf(' ', PREVIEW_CHARS)) + ' …';
}

// `text` is a string or element (shown as is, in the interface font) or a promise of verse text.
async function show(anchor, title, text) {
  ensurePopover();
  clearTimeout(hideTimer);
  if (current && current !== anchor) current.removeAttribute('aria-describedby');
  current = anchor;
  const mine = ++token;
  const ready = typeof text === 'string' || text instanceof Node;
  // Verse text (a promise) carries the translation's mark beside the reference. Out of
  // the tab order: focus stays on the reference, and the Verse view's heading has it too.
  popover.replaceChildren(
    h('strong', {}, title, ...(ready ? [] : [' ', kjvMark({ tabindex: '-1' })])),
    h(text instanceof Node ? 'div' : 'span', { class: ready ? 'preview-note' : 'preview-text' }, ready ? text : 'Loading…'),
  );
  popover.hidden = false;
  place(anchor);
  anchor.setAttribute('aria-describedby', popover.id);
  if (ready) return;
  try {
    const verse = await text;
    if (mine !== token) return;
    popover.lastChild.textContent = trim(verse);
  } catch {
    if (mine !== token) return;
    popover.lastChild.textContent = 'Couldn’t load this verse.';
  }
  place(anchor);
}

function hide() {
  clearTimeout(hideTimer);
  token++;
  if (popover) popover.hidden = true;
  current?.removeAttribute('aria-describedby');
  current = null;
}

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hide, 120);
}

// Shows a preview of verse `id` when `el` is hovered or focused.
// tapTwice (for links in charts): on touch, the first tap on `el` shows the preview
// and a second tap opens the link. Text links leave it off and open on a single tap.
export function attachPreview(el, index, id, title, { tapTwice = false } = {}) {
  const open = () => show(el, title, getVerseText(index, id));
  el.addEventListener('mouseenter', open);
  el.addEventListener('focus', open);
  el.addEventListener('mouseleave', scheduleHide);
  el.addEventListener('blur', hide);
  if (!tapTwice) return;
  // Decided at pointerdown: the mouse events a tap emulates open the preview before `click`.
  let firstTap = false;
  el.addEventListener('pointerdown', (e) => {
    firstTap = e.pointerType !== 'mouse' && !(current === el && popover && !popover.hidden);
  });
  el.addEventListener('click', (e) => {
    if (!firstTap) return; // mouse, keyboard (Enter) or a second tap: follow the link
    firstTap = false;
    e.preventDefault();
    open();
  });
}

// A short fixed note (e.g. what votes are) on `el`, a button: hover, focus or a
// click/tap opens it; Escape, blur or moving the pointer away closes it.
export function attachNote(el, title, note) {
  const open = () => show(el, title, note);
  el.addEventListener('mouseenter', open);
  el.addEventListener('focus', open);
  el.addEventListener('click', open);
  el.addEventListener('mouseleave', scheduleHide);
  el.addEventListener('blur', hide);
}

// For things that aren't single elements, like a chapter on the arc canvas: shows
// `title` and a short note (a string or an element, e.g. a list) next to `anchor`
// until hidePreview() is called.
export const showPreview = (anchor, title, note) => show(anchor, title, note);
export const hidePreview = hide;
