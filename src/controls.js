// Chart controls, laid out the same on every view. Each control has a label row on
// top (with an optional "?" button) and the control itself underneath; label rows
// share a height and the bar aligns its items to the bottom, so every label sits on
// one baseline and every control on another. Items without a label (a status line,
// a button) sit in the control row.
import { h } from './dom.js';

export const controlBar = (...items) => h('div', { class: 'controls' }, ...items);

// `body` is the control, or an array of elements (a slider and its value).
export const control = ({ label, for: id, help, body }) =>
  h(
    'div',
    { class: 'control' },
    h('div', { class: 'control-label' }, h('label', { for: id }, label), ...(help ? [help] : [])),
    h('div', { class: 'control-body' }, ...[body].flat()),
  );

// A live count or note in the control row ("8,404 arcs").
export const controlStatus = () => h('p', { class: 'control-status', role: 'status' });

// An on/off switch: a checkbox with the switch role, so it's announced as on or off.
// The visible "On"/"Off" beside it is decorative; the label is the control's label.
export function toggleSwitch(id, checked) {
  const input = h('input', { type: 'checkbox', role: 'switch', id, class: 'toggle' });
  input.checked = checked;
  const state = h('span', { class: 'toggle-state', 'aria-hidden': 'true' });
  const sync = () => (state.textContent = input.checked ? 'On' : 'Off');
  input.addEventListener('change', sync);
  sync();
  return { input, body: [input, state] };
}
