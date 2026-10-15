import { h } from '../dom.js';

const ext = (href, text) => h('a', { href, rel: 'noopener' }, text);

// One visualization: what it is, how to read it, and a link to open it.
function guide(id, heading, href, linkText, paragraphs) {
  return h(
    'section',
    { class: 'about-section', 'aria-labelledby': id },
    h('h2', { id }, heading),
    ...paragraphs.map((p) => h('p', {}, ...[p].flat())),
    h('p', { class: 'about-open' }, h('a', { href }, linkText)),
  );
}

export function renderAbout(container) {
  container.replaceChildren(
    h('h1', { class: 'view-title', tabindex: '-1' }, 'About'),
    h('p', { class: 'view-intro' }, 'What this site shows, how to read the diagrams, and where the data comes from.'),
    h(
      'div',
      { class: 'about' },
      h(
        'section',
        { class: 'about-section', 'aria-labelledby': 'about-what' },
        h('h2', { id: 'about-what' }, 'What this is'),
        h(
          'p',
          {},
          'A cross-reference points from one verse to another that speaks to the same person, event, promise or phrase. Printed reference Bibles keep them in the margin; this site gathers about 340,000 of them so you can see how passages connect across the whole Bible, from a single verse up to whole books.',
        ),
        h(
          'p',
          {},
          'Each cross-reference has a vote count: readers marked whether they found the link helpful. Higher votes mean a stronger, more widely recognised connection, so every view sorts, filters or sizes links by votes. Links with no votes are kept but drawn faintly.',
        ),
      ),
      guide('about-verse', 'Verse explorer', '#/verse/John.3.16', 'Open John 3:16 in the verse explorer', [
        'Type a reference such as “John 3:16” or “1 Jn 4 8” in the search box at the top of every page. The verse appears in a reading column, with its references in the margin beside it, as in a printed reference Bible: “References” lists the verses it points to and “Referenced by” lists the verses that point back to it, strongest first.',
        'Below the text, the connections graph draws the 15 strongest links. Arrows run from the citing verse to the verse it cites, and thicker lines have more votes. Lapis marks Old Testament verses, gold New Testament verses. Hover over or focus any reference to read its text, and click it to go to that verse.',
      ]),
      guide('about-arcs', 'Chapter arcs', '#/arcs', 'Open the arc diagram', [
        'Every chapter from Genesis to Revelation sits on one line, and each arc joins two chapters that cross-reference each other. Lapis arcs stay within the Old Testament, gold arcs within the New, and arcs shading from lapis to gold cross between the Testaments. Where many arcs overlap, the colour builds up, so dense bands show the most connected passages.',
        'The “Minimum votes” slider starts at 50 to keep the picture readable; lower it to see more links. Choose a book to show only the links that touch it. Hover over, tap or arrow to a chapter to highlight its arcs in vermilion; click or press Enter to read it.',
      ]),
      guide('about-books', 'Book links', '#/books', 'Open the chord diagram', [
        'Each book is an arc around the circle, coloured by its section (Law, History, Poetry, Prophets, Gospels and Acts, Pauline letters, General letters, Revelation) and sized by how many cross-references it has. A ribbon joins two books that cite each other, and its width shows their combined votes.',
        'Hover over or tap a book or ribbon to bring it forward; click it, tap it again or press Enter to list its strongest links in the details panel. “Show links within a book” adds the references a book makes to itself.',
      ]),
      h(
        'section',
        { class: 'about-section about-credits', 'aria-labelledby': 'about-credits' },
        h('h2', { id: 'about-credits' }, 'Credits'),
        h(
          'p',
          {},
          'Cross-references from ',
          ext('https://www.openbible.info/labs/cross-references/', 'OpenBible.info'),
          ', licensed ',
          ext('https://creativecommons.org/licenses/by/4.0/', 'CC BY 4.0'),
          '. The vote counts are theirs too.',
        ),
        h(
          'p',
          {},
          'Bible text: the King James Version (1611, in its standard 1769 edition), which is in the public domain (except in the United Kingdom, where the Crown holds rights to it). The text comes from the ',
          ext('https://github.com/thiagobodruk/bible', 'thiagobodruk/bible'),
          ' collection.',
        ),
        h(
          'p',
          {},
          'The arc diagram is inspired by ',
          ext('https://www.chrisharrison.net/index.php/Visualizations/BibleViz', 'Chris Harrison and Christoph Römhild’s 2007 visualization'),
          ' of the Bible’s cross-references.',
        ),
      ),
    ),
  );
  document.title = 'About · Bible Cross-Reference Explorer';
}
