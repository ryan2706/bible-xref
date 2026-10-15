import { h } from '../dom.js';
import { loadThumb } from '../data.js';

const ARCS_MIN_VOTES = 50; // as drawn by scripts/build-thumbs.mjs: the arc diagram's default

const ext = (href, text) => h('a', { href, rel: 'noopener' }, text);

// Sections in page order. `id` is used in the share link (#/about?s=arcs) and the
// heading ids; `thumb` names a diagram thumbnail shown beside (or above) the text.
const SECTIONS = [
  {
    id: 'what',
    title: 'What this is',
    body: [
      'A cross-reference points from one verse to another that speaks to the same person, event, promise or phrase. Printed reference Bibles keep them in the margin; this site gathers about 340,000 of them so you can see how passages connect across the whole Bible, from a single verse up to whole books.',
      'Each cross-reference has a vote count: readers marked whether they found the link helpful. Higher votes mean a stronger, more widely recognised connection, so every view sorts, filters or sizes links by votes. Links with no votes are kept but drawn faintly.',
    ],
  },
  {
    id: 'verse',
    title: 'Verse explorer',
    href: '#/verse/John.3.16',
    open: 'Open John 3:16 in the verse explorer',
    thumb: 'graph',
    caption: 'John 3:16 and its 15 strongest links',
    body: [
      'Type a reference such as “John 3:16” or “1 Jn 4 8” in the search box at the top of every page. The verse appears in a reading column, with its references in the margin beside it, as in a printed reference Bible: “References” lists the verses it points to and “Referenced by” lists the verses that point back to it, strongest first.',
      'Below the text, the connections graph draws the 15 strongest links. Arrows run from the citing verse to the verse it cites, and thicker lines have more votes. Lapis marks Old Testament verses, gold New Testament verses. Hover over or focus any reference to read its text, and click it to go to that verse.',
    ],
  },
  {
    id: 'arcs',
    title: 'Chapter arcs',
    href: '#/arcs',
    open: 'Open the arc diagram',
    thumb: 'arcs',
    caption: `Chapter pairs with ${ARCS_MIN_VOTES} or more votes, Genesis to Revelation`,
    body: [
      'Every chapter from Genesis to Revelation sits on one line, and each arc joins two chapters that cross-reference each other. Lapis arcs stay within the Old Testament, gold arcs within the New, and arcs shading from lapis to gold cross between the Testaments. Where many arcs overlap, the colour builds up, so dense bands show the most connected passages.',
      'The “Minimum votes” slider starts at 50 to keep the picture readable; lower it to see more links. Choose a book to show only the links that touch it. Hover over, tap or arrow to a chapter to highlight its arcs in vermilion; click or press Enter to read it.',
    ],
  },
  {
    id: 'books',
    title: 'Book links',
    href: '#/books',
    open: 'Open the chord diagram',
    thumb: 'books',
    caption: 'All 66 books, coloured by section',
    body: [
      'Each book is an arc around the circle, coloured by its section (Law, History, Poetry, Prophets, Gospels and Acts, Pauline letters, General letters, Revelation) and sized by how many cross-references it has. A ribbon joins two books that cite each other, and its width shows their combined votes.',
      'Hover over or tap a book or ribbon to bring it forward; click it, tap it again or press Enter to list its strongest links in the details panel. “Show links within a book” adds the references a book makes to itself.',
    ],
  },
  {
    id: 'credits',
    title: 'Credits',
    body: [
      [
        'Cross-references from ',
        ext('https://www.openbible.info/labs/cross-references/', 'OpenBible.info'),
        ', licensed ',
        ext('https://creativecommons.org/licenses/by/4.0/', 'CC BY 4.0'),
        '. The vote counts are theirs too.',
      ],
      [
        'Bible text: the King James Version (1611, in its standard 1769 edition), which is in the public domain (except in the United Kingdom, where the Crown holds rights to it). The text comes from the ',
        ext('https://github.com/thiagobodruk/bible', 'thiagobodruk/bible'),
        ' collection.',
      ],
      [
        'The arc diagram is inspired by ',
        ext('https://www.chrisharrison.net/index.php/Visualizations/BibleViz', 'Chris Harrison and Christoph Römhild’s 2007 visualization'),
        ' of the Bible’s cross-references.',
      ],
    ],
  },
];

const shareHash = (id) => `#/about?s=${id}`;

export function renderAbout(container, [query = '']) {
  const title = h('h1', { class: 'view-title', tabindex: '-1' }, 'About');
  const headings = new Map();
  const tocLinks = new Map();
  const thumbs = {};

  const sections = SECTIONS.map((s) => {
    const heading = h('h2', { id: `about-${s.id}`, tabindex: '-1' }, s.title);
    headings.set(s.id, heading);
    const text = h(
      'div',
      { class: 'about-text' },
      heading,
      ...s.body.map((p) => h('p', {}, ...[p].flat())),
      ...(s.href ? [h('p', { class: 'about-open' }, h('a', { href: s.href }, s.open))] : []),
    );
    const figure = [];
    if (s.thumb) {
      // Decorative: the text link says the same, so the thumbnail is hidden from
      // screen readers and skipped by Tab.
      const frame = h('a', { class: 'about-thumb-frame', href: s.href, tabindex: '-1' });
      figure.push(
        h(
          'figure',
          { class: `about-thumb about-thumb-${s.thumb}`, 'aria-hidden': 'true' },
          frame,
          h('figcaption', {}, s.caption),
        ),
      );
      thumbs[s.thumb] = { figure: figure[0], frame };
    }
    return h('section', { class: `about-section about-${s.id}`, 'aria-labelledby': heading.id }, ...figure, text);
  });

  const toc = h(
    'nav',
    { class: 'about-toc', 'aria-labelledby': 'about-toc-title' },
    h('p', { id: 'about-toc-title', class: 'about-toc-title' }, 'On this page'),
    h(
      'ul',
      {},
      ...SECTIONS.map((s) => {
        const a = h('a', { href: shareHash(s.id) }, s.title);
        a.addEventListener('click', (event) => {
          event.preventDefault();
          goTo(s.id, true);
        });
        tocLinks.set(s.id, a);
        return h('li', {}, a);
      }),
    ),
  );

  container.replaceChildren(
    title,
    h('p', { class: 'view-intro' }, 'What this site shows, how to read the diagrams, and where the data comes from.'),
    h('div', { class: 'about' }, toc, ...sections),
  );
  document.title = 'About · Bible Cross-Reference Explorer';

  // Scroll to a section, keep it in the URL so it can be shared, and move focus to
  // its heading so keyboard and screen-reader users land there too.
  function goTo(id, smooth) {
    const heading = headings.get(id);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    heading.scrollIntoView({ behavior: smooth && !reduce ? 'smooth' : 'auto', block: 'start' });
    heading.focus({ preventScroll: true });
    history.replaceState(null, '', shareHash(id));
    markCurrent(id);
    // Keep the chosen section marked while the page scrolls to it: near the end of
    // the page the heading can't reach the top, and the scroll rule would pick another.
    chosen = true;
    settle();
  }

  // The menu marks the last section whose heading has scrolled above a third of
  // the window, or the last section once the page is scrolled to the bottom.
  let current = null;
  let chosen = false;
  let settleTimer = 0;
  const settle = () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => (chosen = false), 150);
  };
  function markCurrent(id) {
    if (id === current) return;
    current = id;
    for (const [key, a] of tocLinks) {
      if (key === id) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
  }
  let frame = 0;
  function onScroll() {
    if (!toc.isConnected) {
      window.removeEventListener('scroll', onScroll);
      return;
    }
    if (chosen) return settle();
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      let id = SECTIONS[0].id;
      for (const [key, heading] of headings) {
        if (heading.getBoundingClientRect().top < window.innerHeight / 3) id = key;
      }
      markCurrent(atBottom ? SECTIONS.at(-1).id : id);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // A shared link (#/about?s=arcs) opens at that section; unknown values are ignored.
  // Wait a frame: after in-app navigation main.js focuses the h1, which scrolls to the top.
  const start = new URLSearchParams(query).get('s');
  if (headings.has(start)) requestAnimationFrame(() => title.isConnected && goTo(start, false));

  drawThumbs(title, thumbs);
}

// Thumbnails are static SVGs built with the data. They're inlined rather than shown
// with <img> so the page's colour tokens reach them (their marks carry classes, not
// colours). The markup is our own build output, parsed as SVG, never as HTML. Being
// decorative, a thumbnail that can't load is simply removed.
function drawThumbs(title, thumbs) {
  for (const [name, { figure, frame }] of Object.entries(thumbs)) {
    loadThumb(name)
      .then((markup) => {
        if (!title.isConnected) return;
        const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
        const svg = doc.documentElement;
        if (svg.nodeName !== 'svg') throw new Error(`thumbs/${name}.svg: not an SVG`);
        frame.replaceChildren(document.importNode(svg, true));
      })
      .catch(() => figure.remove());
  }
}
