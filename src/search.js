// Header search box: go to a verse by typing a reference, with book-name
// autocomplete (ARIA combobox pattern). Uses books.json only; free-text search
// (search.json) is a separate, lazy feature.
import { h } from './dom.js';
import { loadBooks } from './data.js';
import { getIndex, parseTypedRef, splitRef } from './refs.js';

export function initSearch(form) {
  const input = form.querySelector('input');
  const list = form.querySelector('[role="listbox"]');
  const message = form.querySelector('.search-message');
  let index = null;
  let options = [];
  let active = -1;

  const ready = () => (index ? Promise.resolve(index) : loadBooks().then((books) => (index = getIndex(books))));

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    options = [];
    active = -1;
  }

  function setActive(i) {
    active = i;
    list.querySelectorAll('[role="option"]').forEach((el, j) => el.setAttribute('aria-selected', String(j === i)));
    if (i >= 0) input.setAttribute('aria-activedescendant', `search-option-${i}`);
    else input.removeAttribute('aria-activedescendant');
  }

  function choose(book) {
    input.value = `${book.name} `;
    close();
    input.focus();
  }

  // Suggest book names while the user is still typing the book part.
  async function update() {
    message.textContent = '';
    const text = input.value;
    const parts = splitRef(text);
    if (!text.trim() || !parts || parts.chapter !== null || /\s$/.test(text)) return close();
    const ix = await ready();
    if (input.value !== text) return; // the user kept typing
    options = ix.suggestBooks(parts.bookText);
    if (!options.length) return close();
    list.replaceChildren(
      ...options.map((book, i) =>
        h(
          'li',
          { role: 'option', id: `search-option-${i}`, 'aria-selected': 'false' },
          book.name,
          h('span', { class: 'option-meta' }, `${book.chapters} ch.`),
        ),
      ),
    );
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(-1);
  }

  async function submit() {
    const text = input.value.trim();
    if (!text) return;
    const result = parseTypedRef(text, await ready());
    if (result.error) {
      message.textContent = result.error;
      return;
    }
    close();
    message.textContent = '';
    input.value = '';
    input.blur();
    location.hash = `#/verse/${index.osis(result.id)}`;
  }

  input.addEventListener('focus', ready, { once: true });
  // Clear leftovers (e.g. a reference that didn't match) when the user navigates another way.
  window.addEventListener('hashchange', () => {
    if (document.activeElement !== input) input.value = '';
  });
  input.addEventListener('input', update);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && options.length) {
      e.preventDefault();
      setActive((active + 1) % options.length);
    } else if (e.key === 'ArrowUp' && options.length) {
      e.preventDefault();
      setActive(active <= 0 ? options.length - 1 : active - 1);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === 'Escape') {
      if (!list.hidden || message.textContent) {
        close();
        message.textContent = '';
      } else input.value = '';
    }
  });
  input.addEventListener('blur', () =>
    setTimeout(() => {
      close();
      message.textContent = '';
    }, 100),
  );
  // mousedown keeps focus in the input; click picks the book.
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => {
    const li = e.target.closest('[role="option"]');
    if (li) choose(options[Number(li.id.split('-').pop())]);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
}
