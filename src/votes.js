// Votes, explained the same way everywhere: the wording, how a count is shown, and the
// "?" button that opens the explanation next to the first use on each view.
import { h } from './dom.js';
import { attachNote } from './preview.js';

export const VOTES_HELP =
  'Readers of OpenBible.info voted on how helpful each link is. More votes = a stronger, more widely recognised connection.';

// "986 votes", "1 vote" as text, for sentences and screen-reader labels.
export const votesText = (n) => `${n.toLocaleString('en')} ${n === 1 ? 'vote' : 'votes'}`;

// The same as an element for lists: the number, then a quieter unit.
export const votesEl = (n, cls = 'votes') =>
  h('span', { class: cls }, n.toLocaleString('en'), h('span', { class: 'votes-unit' }, n === 1 ? ' vote' : ' votes'));

// A small "?" button that explains votes in the shared popover.
export function votesHelp() {
  const button = h('button', { type: 'button', class: 'help-button', 'aria-label': 'What are votes?' }, '?');
  attachNote(button, 'Votes', VOTES_HELP);
  return button;
}
