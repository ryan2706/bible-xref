// "KJV" in small caps beside a verse reference (the Verse view's heading and verse
// previews), linking to the Bible text's credit on the About page.
import { h } from './dom.js';

export const kjvMark = (attrs = {}) =>
  h('a', { class: 'kjv', href: '#/about?s=credits', title: 'King James Version: see the credits', ...attrs },
    h('span', { 'aria-hidden': 'true' }, 'KJV'),
    h('span', { class: 'visually-hidden' }, 'King James Version'),
  );
