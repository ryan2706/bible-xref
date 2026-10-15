// Light/dark toggle. With no saved choice the page follows the system setting.
const root = document.documentElement;
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

// Current value of a colour token from src/style.css, e.g. themeColor('--arc-ot').
// Canvas code reads colours through this (and redraws on 'themechange') instead of hard-coding hexes.
export const themeColor = (token) => getComputedStyle(root).getPropertyValue(token).trim();

// The 8 chord-diagram sections, in their fixed order, with their colour tokens.
// Major and Minor Prophets share one section; Acts joins the Gospels.
export const SECTIONS = [
  { name: 'Law', token: '--sec-law' },
  { name: 'History', token: '--sec-history' },
  { name: 'Poetry', token: '--sec-poetry' },
  { name: 'Prophets', token: '--sec-prophets' },
  { name: 'Gospels & Acts', token: '--sec-gospels' },
  { name: 'Pauline letters', token: '--sec-pauline' },
  { name: 'General letters', token: '--sec-general' },
  { name: 'Revelation', token: '--sec-revelation' },
];

// Index into SECTIONS for a book from books.json.
export function sectionOf(book) {
  if (book.testament === 'NT') {
    if (book.section === 'Gospels' || book.section === 'History') return 4;
    return { 'Pauline Epistles': 5, 'General Epistles': 6, Apocalyptic: 7 }[book.section];
  }
  return { Law: 0, History: 1, Poetry: 2, 'Major Prophets': 3, 'Minor Prophets': 3 }[book.section];
}

export const isDark = () => root.dataset.theme === 'dark' || (!root.dataset.theme && darkQuery.matches);

export function initThemeToggle(button) {
  const sync = () => button.setAttribute('aria-pressed', String(isDark()));
  button.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {}
    sync();
    window.dispatchEvent(new CustomEvent('themechange'));
  });
  darkQuery.addEventListener('change', () => {
    sync();
    window.dispatchEvent(new CustomEvent('themechange'));
  });
  sync();
}
