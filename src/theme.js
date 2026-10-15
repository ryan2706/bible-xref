// Light/dark toggle. With no saved choice the page follows the system setting.
const root = document.documentElement;
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

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
