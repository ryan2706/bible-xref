// Light/dark toggle. With no saved choice the page follows the system setting.
const root = document.documentElement;
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

// Current value of a colour token from src/style.css, e.g. themeColor('--arc-ot').
// Canvas code reads colours through this (and redraws on 'themechange') instead of hard-coding hexes.
export const themeColor = (token) => getComputedStyle(root).getPropertyValue(token).trim();

// Section list and lookup live in sections.js (no DOM, so the data build can use them).
export { SECTIONS, sectionOf, GROUP_NAMES } from './sections.js';

export const isDark = () => root.dataset.theme === 'dark' || (!root.dataset.theme && darkQuery.matches);

// The button's label (which theme it switches to) is chosen in CSS, so it is right
// from the first paint. A click also announces the new theme through `status`.
export function initThemeToggle(button, status) {
  button.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {}
    status.textContent = `${next === 'dark' ? 'Dark' : 'Light'} theme on`;
    window.dispatchEvent(new CustomEvent('themechange'));
  });
  darkQuery.addEventListener('change', () => window.dispatchEvent(new CustomEvent('themechange')));
}
