// The 8 chord-diagram sections, in their fixed order, with their colour tokens.
// Kept free of DOM code so scripts/build-thumbs.mjs can import it in Node.
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

// Names for a run of books labelled as a group when a chart has no room to label
// them one by one, longest first, keyed by books.json `section` or SECTIONS name.
// One rule for short forms: keep whole words, never clip one with a full stop
// ("Minor", like "Paul" and "General"; not "Minor Proph.").
export const GROUP_NAMES = {
  Law: ['Law'],
  History: ['History'],
  Poetry: ['Poetry'],
  Prophets: ['Prophets'],
  'Major Prophets': ['Major Prophets', 'Major'],
  'Minor Prophets': ['Minor Prophets', 'Minor'],
  Gospels: ['Gospels'],
  'Gospels & Acts': ['Gospels & Acts', 'Gospels'],
  'Pauline Epistles': ['Pauline letters', 'Paul'],
  'Pauline letters': ['Pauline letters', 'Paul'],
  'General Epistles': ['General letters', 'General'],
  'General letters': ['General letters', 'General'],
  Revelation: ['Revelation', 'Rev'],
};

// Index into SECTIONS for a book from books.json.
export function sectionOf(book) {
  if (book.testament === 'NT') {
    if (book.section === 'Gospels' || book.section === 'History') return 4;
    return { 'Pauline Epistles': 5, 'General Epistles': 6, Apocalyptic: 7 }[book.section];
  }
  return { Law: 0, History: 1, Poetry: 2, 'Major Prophets': 3, 'Minor Prophets': 3 }[book.section];
}
