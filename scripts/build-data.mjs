// Builds the static JSON in public/data/ from the raw sources in data-raw/.
// Run with: npm run build:data
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { writeThumbs, ARCS_MIN_VOTES } from './build-thumbs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data-raw');
const OUT = path.join(ROOT, 'public', 'data');
const MAX_BYTES = 5 * 1024 * 1024;
const OVERVIEW_MIN_VOTES = 10;

// ---------------------------------------------------------------------------
// Book table, in canonical order. Matched to kjv.json by position (0-65);
// the Portuguese abbrev/name fields in kjv.json are ignored. `chapters` is
// used to verify that the positional match is correct.
// ---------------------------------------------------------------------------
const BOOKS = [
  ['Genesis', 'Gen', 'OT', 'Law', 50],
  ['Exodus', 'Exod', 'OT', 'Law', 40],
  ['Leviticus', 'Lev', 'OT', 'Law', 27],
  ['Numbers', 'Num', 'OT', 'Law', 36],
  ['Deuteronomy', 'Deut', 'OT', 'Law', 34],
  ['Joshua', 'Josh', 'OT', 'History', 24],
  ['Judges', 'Judg', 'OT', 'History', 21],
  ['Ruth', 'Ruth', 'OT', 'History', 4],
  ['1 Samuel', '1Sam', 'OT', 'History', 31],
  ['2 Samuel', '2Sam', 'OT', 'History', 24],
  ['1 Kings', '1Kgs', 'OT', 'History', 22],
  ['2 Kings', '2Kgs', 'OT', 'History', 25],
  ['1 Chronicles', '1Chr', 'OT', 'History', 29],
  ['2 Chronicles', '2Chr', 'OT', 'History', 36],
  ['Ezra', 'Ezra', 'OT', 'History', 10],
  ['Nehemiah', 'Neh', 'OT', 'History', 13],
  ['Esther', 'Esth', 'OT', 'History', 10],
  ['Job', 'Job', 'OT', 'Poetry', 42],
  ['Psalms', 'Ps', 'OT', 'Poetry', 150],
  ['Proverbs', 'Prov', 'OT', 'Poetry', 31],
  ['Ecclesiastes', 'Eccl', 'OT', 'Poetry', 12],
  ['Song of Solomon', 'Song', 'OT', 'Poetry', 8],
  ['Isaiah', 'Isa', 'OT', 'Major Prophets', 66],
  ['Jeremiah', 'Jer', 'OT', 'Major Prophets', 52],
  ['Lamentations', 'Lam', 'OT', 'Major Prophets', 5],
  ['Ezekiel', 'Ezek', 'OT', 'Major Prophets', 48],
  ['Daniel', 'Dan', 'OT', 'Major Prophets', 12],
  ['Hosea', 'Hos', 'OT', 'Minor Prophets', 14],
  ['Joel', 'Joel', 'OT', 'Minor Prophets', 3],
  ['Amos', 'Amos', 'OT', 'Minor Prophets', 9],
  ['Obadiah', 'Obad', 'OT', 'Minor Prophets', 1],
  ['Jonah', 'Jonah', 'OT', 'Minor Prophets', 4],
  ['Micah', 'Mic', 'OT', 'Minor Prophets', 7],
  ['Nahum', 'Nah', 'OT', 'Minor Prophets', 3],
  ['Habakkuk', 'Hab', 'OT', 'Minor Prophets', 3],
  ['Zephaniah', 'Zeph', 'OT', 'Minor Prophets', 3],
  ['Haggai', 'Hag', 'OT', 'Minor Prophets', 2],
  ['Zechariah', 'Zech', 'OT', 'Minor Prophets', 14],
  ['Malachi', 'Mal', 'OT', 'Minor Prophets', 4],
  ['Matthew', 'Matt', 'NT', 'Gospels', 28],
  ['Mark', 'Mark', 'NT', 'Gospels', 16],
  ['Luke', 'Luke', 'NT', 'Gospels', 24],
  ['John', 'John', 'NT', 'Gospels', 21],
  ['Acts', 'Acts', 'NT', 'History', 28],
  ['Romans', 'Rom', 'NT', 'Pauline Epistles', 16],
  ['1 Corinthians', '1Cor', 'NT', 'Pauline Epistles', 16],
  ['2 Corinthians', '2Cor', 'NT', 'Pauline Epistles', 13],
  ['Galatians', 'Gal', 'NT', 'Pauline Epistles', 6],
  ['Ephesians', 'Eph', 'NT', 'Pauline Epistles', 6],
  ['Philippians', 'Phil', 'NT', 'Pauline Epistles', 4],
  ['Colossians', 'Col', 'NT', 'Pauline Epistles', 4],
  ['1 Thessalonians', '1Thess', 'NT', 'Pauline Epistles', 5],
  ['2 Thessalonians', '2Thess', 'NT', 'Pauline Epistles', 3],
  ['1 Timothy', '1Tim', 'NT', 'Pauline Epistles', 6],
  ['2 Timothy', '2Tim', 'NT', 'Pauline Epistles', 4],
  ['Titus', 'Titus', 'NT', 'Pauline Epistles', 3],
  ['Philemon', 'Phlm', 'NT', 'Pauline Epistles', 1],
  ['Hebrews', 'Heb', 'NT', 'General Epistles', 13],
  ['James', 'Jas', 'NT', 'General Epistles', 5],
  ['1 Peter', '1Pet', 'NT', 'General Epistles', 5],
  ['2 Peter', '2Pet', 'NT', 'General Epistles', 3],
  ['1 John', '1John', 'NT', 'General Epistles', 5],
  ['2 John', '2John', 'NT', 'General Epistles', 1],
  ['3 John', '3John', 'NT', 'General Epistles', 1],
  ['Jude', 'Jude', 'NT', 'General Epistles', 1],
  ['Revelation', 'Rev', 'NT', 'Apocalyptic', 22],
].map(([name, abbr, testament, section, chapters]) => ({ name, abbr, testament, section, chapters }));

// Cross-reference refs that don't exist in KJV versification.
const REF_REMAP = { '3John.1.15': '3John.1.14' };

// KJV margin notes that leaked onto the end of these verses in kjv.json.
// Each entry is [exact tail in the source, replacement]. The build fails if a
// tail no longer matches, so a changed source can't be silently mangled.
const MARGIN_NOTES = {
  'Exod.6.2': [' : : or, JEHOVAH', ':'],
  'Exod.17.16': [' , therefore, etc hath…: Heb. the hand upon the throne of the LORD', ''],
  'Exod.32.11': [' : Heb. the face of the LORD', ''],
  'Josh.23.9': [' …: or, Then the LORD will drive', ''],
  '1Kgs.13.6': [' , and: Heb. the face of the LORD , etc', ''],
  '2Chr.5.10': [' : or, where, etc', ''],
  '2Chr.29.25': [' : Heb. commandment by the hand of the LORD', ''],
  'Ps.89.18': [' …: or, our shield is of the LORD , and our king is of the Holy One of Israel', ''],
  'Ps.118.23': [' …: Heb. from the LORD', ''],
  'Ps.148.1': [' . Praise: Heb. Hallelujah, etc', ''],
  'Jer.16.21': [' . : or, JEHOVAH', '.'],
  'Jer.23.6': [' …: Heb. Jehovah-tsidkenu', ''],
  'Jer.26.19': [' , and the: Heb. the face of the LORD , etc', ''],
  'Jer.33.2': ['; is: or, JEHOVAH , etc', ';'],
  'Jer.33.16': [' …: Heb. Jehovah-tsidkenu', ''],
  'Ezek.48.35': [' …: Heb. Jehovah-shammah', ''],
  'Amos.3.6': [' …: or, shall not the LORD do somewhat?', ''],
  'Jonah.1.9': [' . : or, JEHOVAH', '.'],
  'Zeph.2.7': [' : or, when, etc', ''],
};

const problems = []; // fatal: anything that would make the output wrong
const warnings = [];

// ---------------------------------------------------------------------------
// Verses
// ---------------------------------------------------------------------------
const kjv = JSON.parse(fs.readFileSync(path.join(RAW, 'kjv.json'), 'utf8').replace(/^﻿/, ''));
if (kjv.length !== BOOKS.length) throw new Error(`kjv.json has ${kjv.length} books, expected ${BOOKS.length}`);

const cleanText = (s) => s.replace(/\s+([.,;:?!…])/g, '$1').trim();
const searchForm = (s) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/æ/g, 'ae');

const verseText = []; // by verse id
const bookIndex = new Map(); // abbr -> book index
const chapterStart = []; // [book][chapter-1] -> first verse id
const chapterIndexOfVerse = []; // verse id -> global chapter index
const bookOfVerse = []; // verse id -> book index
let marginNotesFixed = 0;
let globalChapter = 0;

BOOKS.forEach((book, bi) => {
  const src = kjv[bi];
  if (src.chapters.length !== book.chapters) {
    throw new Error(`${book.name}: kjv.json has ${src.chapters.length} chapters, expected ${book.chapters}`);
  }
  bookIndex.set(book.abbr, bi);
  book.firstId = verseText.length;
  book.firstChapter = globalChapter;
  book.versesPerChapter = [];
  chapterStart[bi] = [];
  src.chapters.forEach((verses, ci) => {
    chapterStart[bi][ci] = verseText.length;
    book.versesPerChapter.push(verses.length);
    verses.forEach((raw, vi) => {
      const ref = `${book.abbr}.${ci + 1}.${vi + 1}`;
      let text = raw;
      const note = MARGIN_NOTES[ref];
      if (note) {
        if (!text.endsWith(note[0])) problems.push(`margin-note fix for ${ref} no longer matches the source text`);
        else { text = text.slice(0, -note[0].length) + note[1]; marginNotesFixed++; }
      }
      text = cleanText(text);
      if (/: (or,|Heb\.)/.test(text)) warnings.push(`possible margin note left in ${ref}: ${text}`);
      bookOfVerse.push(bi);
      chapterIndexOfVerse.push(globalChapter);
      verseText.push(text);
    });
    globalChapter++;
  });
  book.lastId = verseText.length - 1;
});
const VERSE_COUNT = verseText.length;

// ---------------------------------------------------------------------------
// Cross-references
// ---------------------------------------------------------------------------
const REF_RE = /^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/;
const remapCounts = {};
function refToId(ref) {
  if (REF_REMAP[ref]) {
    remapCounts[ref] = (remapCounts[ref] || 0) + 1;
    ref = REF_REMAP[ref];
  }
  const m = REF_RE.exec(ref);
  if (!m) return null;
  const bi = bookIndex.get(m[1]);
  if (bi === undefined) return null;
  const ch = +m[2], v = +m[3];
  if (ch < 1 || ch > BOOKS[bi].chapters || v < 1 || v > BOOKS[bi].versesPerChapter[ch - 1]) return null;
  return chapterStart[bi][ch - 1] + v - 1;
}

const lines = fs.readFileSync(path.join(RAW, 'cross_references.txt'), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
if (!lines[0].startsWith('From Verse\t')) throw new Error(`unexpected header row: ${lines[0]}`);

const xrefs = []; // [fromId, toStartId, toEndId, votes]
const failed = []; // [line number, reason, raw line]
let droppedNegative = 0, zeroVotes = 0;
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (line === '') continue;
  const cols = line.split('\t');
  if (cols.length !== 3) { failed.push([i + 1, `expected 3 columns, got ${cols.length}`, line]); continue; }
  const [from, to, votesStr] = cols;
  if (!/^-?\d+$/.test(votesStr)) { failed.push([i + 1, 'votes is not an integer', line]); continue; }
  const votes = Number(votesStr);
  const toParts = to.split('-');
  if (toParts.length > 2) { failed.push([i + 1, 'malformed range', line]); continue; }
  const fromId = refToId(from);
  const toStartId = refToId(toParts[0]);
  let toEndId = toParts.length === 2 ? refToId(toParts[1]) : toStartId;
  if (fromId === null || toStartId === null || toEndId === null) {
    failed.push([i + 1, 'unknown verse reference', line]);
    continue;
  }
  if (toEndId < toStartId) { failed.push([i + 1, 'range ends before it starts', line]); continue; }
  if (votes < 0) { droppedNegative++; continue; }
  if (votes === 0) zeroVotes++;
  xrefs.push([fromId, toStartId, toEndId, votes]);
}

// Highest votes first; ties in canonical order so output is stable.
const byVotes = (a, b) => b[3] - a[3] || a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const outgoing = Array.from({ length: VERSE_COUNT }, () => []);
const incoming = Array.from({ length: VERSE_COUNT }, () => []);
for (const x of xrefs) {
  outgoing[x[0]].push(x);
  // Every verse inside a target range counts as referenced by the source verse.
  for (let v = x[1]; v <= x[2]; v++) incoming[v].push(x);
}
outgoing.forEach((a) => a.sort(byVotes));
incoming.forEach((a) => a.sort(byVotes));

// Arc diagram: undirected chapter-to-chapter links, by the start verse of each range.
// Links within a single chapter are left out (they can't be drawn as arcs).
const chapterLinks = new Map();
for (const [fromId, toStartId, , votes] of xrefs) {
  const a = chapterIndexOfVerse[fromId], b = chapterIndexOfVerse[toStartId];
  if (a === b) continue;
  const key = a < b ? a * 2000 + b : b * 2000 + a;
  chapterLinks.set(key, (chapterLinks.get(key) || 0) + votes);
}
const overviewLinks = [...chapterLinks]
  .filter(([, votes]) => votes >= OVERVIEW_MIN_VOTES)
  .map(([key, votes]) => [Math.floor(key / 2000), key % 2000, votes])
  .sort((x, y) => x[0] - y[0] || x[1] - y[1]);

// Chord diagram: directed matrix[fromBook][toBook], by the start verse of each range.
const matrix = BOOKS.map(() => new Array(BOOKS.length).fill(0));
for (const [fromId, toStartId, , votes] of xrefs) matrix[bookOfVerse[fromId]][bookOfVerse[toStartId]] += votes;

// ---------------------------------------------------------------------------
// Write outputs
// ---------------------------------------------------------------------------
if (problems.length) {
  console.error('Build failed:\n  ' + problems.join('\n  '));
  process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'verses'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'xrefs'), { recursive: true });
const writeJson = (rel, data) => fs.writeFileSync(path.join(OUT, rel), JSON.stringify(data));

writeJson(
  'books.json',
  BOOKS.map((b, i) => ({
    index: i,
    name: b.name,
    abbr: b.abbr,
    testament: b.testament,
    section: b.section,
    chapters: b.chapters,
    versesPerChapter: b.versesPerChapter,
    firstId: b.firstId,
    lastId: b.lastId,
    firstChapter: b.firstChapter,
  })),
);

for (const b of BOOKS) {
  const ids = { firstId: b.firstId, lastId: b.lastId };
  writeJson(`verses/${b.abbr}.json`, { abbr: b.abbr, ...ids, text: verseText.slice(b.firstId, b.lastId + 1) });
  const verses = [];
  for (let id = b.firstId; id <= b.lastId; id++) verses.push({ out: outgoing[id], in: incoming[id] });
  writeJson(`xrefs/${b.abbr}.json`, { abbr: b.abbr, ...ids, verses });
}

writeJson('search.json', verseText.map(searchForm));

writeJson('overview.json', {
  chapterCount: globalChapter,
  minVotes: OVERVIEW_MIN_VOTES,
  links: overviewLinks, // [chapterA, chapterB, summedVotes], chapterA < chapterB
});

writeJson('book-matrix.json', {
  books: BOOKS.map((b) => b.abbr),
  matrix, // matrix[fromBook][toBook] = summed votes
});

// About page thumbnails (static SVGs, coloured by CSS classes). The verse thumbnail is John 3:16.
const thumbCenter = chapterStart[bookIndex.get('John')][2] + 15;
const thumbs = writeThumbs(path.join(OUT, 'thumbs'), {
  chapterCount: globalChapter,
  ntStartChapter: BOOKS.find((b) => b.testament === 'NT').firstChapter,
  links: overviewLinks,
  books: BOOKS,
  matrix,
  centerId: thumbCenter,
  out: outgoing[thumbCenter],
  incoming: incoming[thumbCenter],
  isNT: (id) => BOOKS[bookOfVerse[id]].testament === 'NT',
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const kb = (n) => (n / 1024).toFixed(1).padStart(9) + ' KB';
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else {
      const buf = fs.readFileSync(p);
      files.push({ rel: path.relative(OUT, p), size: buf.length, gz: zlib.gzipSync(buf).length });
    }
  }
})(OUT);

console.log(`\nVerses: ${VERSE_COUNT}  (margin notes stripped: ${marginNotesFixed})`);
console.log(`Cross-refs kept: ${xrefs.length}  (zero votes kept: ${zeroVotes}, negative dropped: ${droppedNegative})`);
console.log(`Refs remapped: ${JSON.stringify(remapCounts)}`);
console.log(`Overview links (>= ${OVERVIEW_MIN_VOTES} votes): ${overviewLinks.length}`);
console.log(
  `Thumbnails: arcs ${thumbs.arcs.marks} merged arcs (>= ${ARCS_MIN_VOTES} votes), books ${thumbs.books.marks} of ${thumbs.books.of} ribbons, graph ${thumbs.graph.marks} nodes`,
);
console.log(`Rows that failed to parse: ${failed.length}`);
for (const [n, why, line] of failed.slice(0, 20)) console.log(`  line ${n}: ${why}: ${JSON.stringify(line)}`);
for (const w of warnings) console.log(`Warning: ${w}`);

console.log(`\n${'File'.padEnd(26)}${'Size'.padStart(12)}${'Gzipped'.padStart(13)}`);
let total = 0, totalGz = 0, oversize = 0;
for (const f of files) {
  total += f.size; totalGz += f.gz;
  const flag = f.size > MAX_BYTES ? '  <-- OVER 5 MB' : '';
  if (flag) oversize++;
  console.log(`${f.rel.padEnd(26)}${kb(f.size)}${kb(f.gz)}${flag}`);
}
console.log(`${`TOTAL (${files.length} files)`.padEnd(26)}${kb(total)}${kb(totalGz)}`);
console.log(oversize ? `\n${oversize} file(s) over 5 MB` : '\nNo files over 5 MB');
