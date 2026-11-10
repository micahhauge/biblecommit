import { BOOKS, type Book } from './canon';

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Common abbreviations, checked before prefix matching. Keys are normalized (lowercase, no spaces). */
const ALIASES: Record<string, string> = {
  gn: 'Genesis', ge: 'Genesis', ex: 'Exodus', lv: 'Leviticus', nm: 'Numbers', nu: 'Numbers', dt: 'Deuteronomy',
  jos: 'Joshua', jsh: 'Joshua', jdg: 'Judges', jgs: 'Judges', ru: 'Ruth', rth: 'Ruth',
  '1sm': '1 Samuel', '2sm': '2 Samuel', '1kgs': '1 Kings', '2kgs': '2 Kings', '1chr': '1 Chronicles', '2chr': '2 Chronicles',
  ne: 'Nehemiah', es: 'Esther', jb: 'Job',
  ps: 'Psalms', psa: 'Psalms', psalm: 'Psalms', pss: 'Psalms', pr: 'Proverbs', prv: 'Proverbs',
  ec: 'Ecclesiastes', qoh: 'Ecclesiastes', so: 'Song of Solomon', song: 'Song of Solomon', sos: 'Song of Solomon',
  songofsongs: 'Song of Solomon', canticles: 'Song of Solomon',
  is: 'Isaiah', jr: 'Jeremiah', lam: 'Lamentations', ezk: 'Ezekiel', eze: 'Ezekiel', dn: 'Daniel',
  hos: 'Hosea', jl: 'Joel', am: 'Amos', ob: 'Obadiah', jon: 'Jonah', jnh: 'Jonah', mic: 'Micah', na: 'Nahum',
  hab: 'Habakkuk', zep: 'Zephaniah', hag: 'Haggai', zec: 'Zechariah', ml: 'Malachi', mal: 'Malachi',
  mt: 'Matthew', mk: 'Mark', mr: 'Mark', lk: 'Luke', jn: 'John', jhn: 'John', ac: 'Acts',
  rm: 'Romans', rom: 'Romans', '1co': '1 Corinthians', '2co': '2 Corinthians', ga: 'Galatians',
  eph: 'Ephesians', php: 'Philippians', phil: 'Philippians', col: 'Colossians',
  '1th': '1 Thessalonians', '2th': '2 Thessalonians', '1tm': '1 Timothy', '2tm': '2 Timothy', ti: 'Titus',
  phm: 'Philemon', philem: 'Philemon', heb: 'Hebrews', jas: 'James', jm: 'James',
  '1pt': '1 Peter', '2pt': '2 Peter', '1jn': '1 John', '2jn': '2 John', '3jn': '3 John', rv: 'Revelation', rev: 'Revelation',
};

export type BookLookup = { ok: true; book: Book } | { ok: false; error: string };

/** Resolves a typed book name (spec §2): alias table first, then full name, then unique prefix of ≥2 letters. */
export function findBook(name: string): BookLookup {
  const typed = key(name);
  const alias = ALIASES[typed];
  if (alias) return { ok: true, book: BOOKS.find((b) => b.name === alias)! };
  const exact = BOOKS.find((b) => key(b.name) === typed);
  if (exact) return { ok: true, book: exact };
  const matches = typed.replace(/\d/g, '').length >= 2 ? BOOKS.filter((b) => key(b.name).startsWith(typed)) : [];
  if (matches.length === 1) return { ok: true, book: matches[0]! };
  if (matches.length > 1) return { ok: false, error: `${orList(matches.map((b) => b.name))}?` };
  return { ok: false, error: `unknown book “${name}”` };
}

function orList(names: string[]): string {
  if (names.length === 2) return `${names[0]} or ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1]}`;
}
