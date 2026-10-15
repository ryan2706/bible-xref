// A short text preview of a verse, shown when a reference is hovered or focused.
// One shared popover for the whole page. It stays open while the pointer is over
// it, and Escape closes it (WCAG 1.4.13).
import { h } from './dom.js';
import { getVerseText } from './data.js';

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

async function show(anchor, index, id, title) {
  ensurePopover();
  clearTimeout(hideTimer);
  if (current && current !== anchor) current.removeAttribute('aria-describedby');
  current = anchor;
  const mine = ++token;
  popover.replaceChildren(h('strong', {}, title), h('span', { class: 'preview-text' }, 'Loading…'));
  popover.hidden = false;
  place(anchor);
  anchor.setAttribute('aria-describedby', popover.id);
  try {
    const text = await getVerseText(index, id);
    if (mine !== token) return;
    popover.lastChild.textContent = trim(text);
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
export function attachPreview(el, index, id, title) {
  el.addEventListener('mouseenter', () => show(el, index, id, title));
  el.addEventListener('focus', () => show(el, index, id, title));
  el.addEventListener('mouseleave', scheduleHide);
  el.addEventListener('blur', hide);
}
