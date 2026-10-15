// Verse IDs <-> references, and parsing of typed references like "jn 3 16".
// Everything here works from books.json alone.

// Extra abbreviations people type. Full names and OSIS abbreviations from
// books.json are added automatically. Keys are lowercase with no spaces or dots.
const ALIASES = {
  Gen: 'ge gn', Exod: 'ex exo', Lev: 'le lv', Num: 'nu nm nb', Deut: 'de dt deu',
  Josh: 'jos jsh', Judg: 'jdg jg jdgs', Ruth: 'rth ru',
  '1Sam': '1sa 1sm 1s', '2Sam': '2sa 2sm 2s', '1Kgs': '1ki 1kg 1k 1kin', '2Kgs': '2ki 2kg 2k 2kin',
  '1Chr': '1ch 1chron', '2Chr': '2ch 2chron', Ezra: 'ezr', Neh: 'ne', Esth: 'est es', Job: 'jb',
  Ps: 'psa psalm pss psm pslm', Prov: 'pr prv pro', Eccl: 'ecc ec eccles qoh',
  Song: 'sos so ss cant canticles songofsongs', Isa: 'is', Jer: 'je jr', Lam: 'la',
  Ezek: 'eze ezk', Dan: 'da dn', Hos: 'ho', Joel: 'jl', Amos: 'am', Obad: 'ob oba',
  Jonah: 'jon jnh', Mic: 'mc', Nah: 'na', Hab: 'hb', Zeph: 'zep zp', Hag: 'hg', Zech: 'zec zc', Mal: 'ml',
  Matt: 'mt mat', Mark: 'mk mrk mar', Luke: 'lk luk', John: 'jn jhn joh', Acts: 'ac act',
  Rom: 'ro rm', '1Cor': '1co', '2Cor': '2co', Gal: 'ga', Eph: 'ephes', Phil: 'php pp', Col: 'co',
  '1Thess': '1th 1thes', '2Thess': '2th 2thes', '1Tim': '1ti', '2Tim': '2ti', Titus: 'tit ti',
  Phlm: 'philem phm', Heb: 'he', Jas: 'jm jam', '1Pet': '1pe 1pt 1p', '2Pet': '2pe 2pt 2p',
  '1John': '1jn 1jo 1jhn 1joh', '2John': '2jn 2jo 2jhn 2joh', '3John': '3jn 3jo 3jhn 3joh',
  Jude: 'jud jd', Rev: 're rv revelations apocalypse',
};

const indexes = new WeakMap();

// Builds (once per books array) lookups for converting between IDs and references.
export function getIndex(books) {
  if (indexes.has(books)) return indexes.get(books);

  const chapterStarts = books.map((b) => {
    let id = b.firstId;
    return b.versesPerChapter.map((n) => ((id += n), id - n));
  });

  const aliases = new Map(); // key -> book
  const keysByBook = books.map((b) => {
    const keys = new Set([normalizeBook(b.name), normalizeBook(b.abbr), ...(ALIASES[b.abbr] || '').split(' ').filter(Boolean)]);
    for (const k of keys) aliases.set(k, b);
    return [...keys];
  });

  function bookOf(id) {
    let lo = 0, hi = books.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (books[mid].firstId <= id) lo = mid;
      else hi = mid - 1;
    }
    return books[lo];
  }

  function locate(id) {
    const book = bookOf(id);
    const starts = chapterStarts[book.index];
    let c = starts.length - 1;
    while (starts[c] > id) c--;
    return { book, chapter: c + 1, verse: id - starts[c] + 1 };
  }

  const shortName = (book) => book.abbr.replace(/^(\d)/, '$1 ');
  const label = (id, short = false) => {
    const { book, chapter, verse } = locate(id);
    return `${short ? shortName(book) : book.name} ${chapter}:${verse}`;
  };

  // Every chapter in canonical order; overview.json's chapter numbers index into this.
  const chapters = books.flatMap((b) =>
    b.versesPerChapter.map((verses, c) => ({ index: b.firstChapter + c, book: b, chapter: c + 1, verses, firstId: chapterStarts[b.index][c] })),
  );

  const index = {
    books,
    chapters,
    locate,
    label,
    shortName,
    // "Genesis 1" (or "1 Sam 3" when short) for a chapter from `chapters`.
    chapterLabel: (ch, short = false) => `${short ? shortName(ch.book) : ch.book.name} ${ch.chapter}`,
    idOf: (book, chapter, verse) => chapterStarts[book.index][chapter - 1] + verse - 1,
    osis: (id) => {
      const { book, chapter, verse } = locate(id);
      return `${book.abbr}.${chapter}.${verse}`;
    },
    testament: (id) => bookOf(id).testament,
    // Route references like "John.3.16" -> verse ID, or null if it doesn't exist.
    parseOsis(ref) {
      const m = /^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/.exec(ref);
      const book = m && books.find((b) => b.abbr.toLowerCase() === m[1].toLowerCase());
      if (!book) return null;
      const chapter = Number(m[2]), verse = Number(m[3]);
      if (chapter < 1 || chapter > book.chapters) return null;
      if (verse < 1 || verse > book.versesPerChapter[chapter - 1]) return null;
      return chapterStarts[book.index][chapter - 1] + verse - 1;
    },
    // "John 1:1–3", "John 1:51–2:1", or "Lev 27:34–Num 1:1" for ranges that cross books.
    rangeLabel(start, end, short = false) {
      if (start === end) return label(start, short);
      const a = locate(start), b = locate(end);
      if (a.book !== b.book) return `${label(start, short)}–${label(end, short)}`;
      if (a.chapter !== b.chapter) return `${label(start, short)}–${b.chapter}:${b.verse}`;
      return `${label(start, short)}–${b.verse}`;
    },
    // Books whose name or abbreviation starts with what the user typed, in canonical order.
    suggestBooks(typed, limit = 8) {
      const key = normalizeBook(typed);
      if (!key) return [];
      return books.filter((b, i) => keysByBook[i].some((k) => k.startsWith(key))).slice(0, limit);
    },
    findBook(typed) {
      const key = normalizeBook(typed);
      if (aliases.has(key)) return { book: aliases.get(key) };
      const matches = books.filter((b, i) => key.length >= 2 && keysByBook[i].some((k) => k.startsWith(key)));
      if (matches.length === 1) return { book: matches[0] };
      return { matches };
    },
  };
  indexes.set(books, index);
  return index;
}

// "1 John", "I John", "First John", "1Jn." -> "1john"
function normalizeBook(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/^(first|i)\s+(?=[a-z])/, '1')
    .replace(/^(second|ii)\s+(?=[a-z])/, '2')
    .replace(/^(third|iii)\s+(?=[a-z])/, '3')
    .replace(/[\s.]+/g, '');
}

// Splits typed text into its book part and any chapter/verse numbers.
// Returns null if it doesn't look like a reference at all.
const REF_RE = /^\s*((?:[1-3]|i{1,3}|first|second|third)?\s*[a-z][a-z\s.]*?)\.?\s*(?:(\d+)(?:\s*[:.\s]\s*(\d+))?(?:\s*[-–]\s*\d+(?:[:.]\d+)?)?)?\s*$/i;

export function splitRef(text) {
  const m = REF_RE.exec(text);
  if (!m) return null;
  return { bookText: m[1].trim(), chapter: m[2] ? Number(m[2]) : null, verse: m[3] ? Number(m[3]) : null };
}

// Parses "John 3:16", "jn 3 16", "1 John 4:8", "Ps 23", "Jude 3", "Rom.5.8".
// Returns { id, label } or { error } with a message to show the user.
export function parseTypedRef(text, index) {
  const parts = splitRef(text);
  if (!parts) return { error: `“${text.trim()}” isn’t a reference. Try one like John 3:16.` };
  const found = index.findBook(parts.bookText);
  if (!found.book) {
    if (found.matches?.length > 1) {
      return { error: `“${parts.bookText}” could be ${found.matches.slice(0, 4).map((b) => b.name).join(', ')}. Type more of the name.` };
    }
    return { error: `No book matches “${parts.bookText}”. Try a reference like John 3:16.` };
  }
  const { book } = found;
  let { chapter, verse } = parts;
  // In one-chapter books a single number is the verse: "Jude 3" is Jude 1:3.
  if (book.chapters === 1 && chapter !== null && verse === null) [chapter, verse] = [1, chapter];
  chapter ??= 1;
  verse ??= 1;
  if (chapter < 1 || chapter > book.chapters) {
    return { error: `${book.name} has ${book.chapters} chapter${book.chapters === 1 ? '' : 's'}.` };
  }
  const count = book.versesPerChapter[chapter - 1];
  if (verse < 1 || verse > count) return { error: `${book.name} ${chapter} has ${count} verses.` };
  const id = index.idOf(book, chapter, verse);
  return { id, label: index.label(id) };
}
