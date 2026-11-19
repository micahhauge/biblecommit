import { formatRanges, parseVerses, type VerseRange } from './parse';

/** Longest note body, in characters. */
export const NOTE_MAX_LENGTH = 20_000;

/**
 * What a list shows for a note: its first heading, else its first non-blank line,
 * with markdown stripped. Empty if the note has no text.
 */
export function noteTitle(body: string): string {
  const lines = body.split(/\r?\n/);
  const heading = lines.find((l) => /^ {0,3}#{1,6}\s+\S/.test(l));
  const line = heading ?? lines.find((l) => l.trim() !== '' && !/^ {0,3}(```|~~~|[-*_]{3,}\s*$)/.test(l)) ?? '';
  return stripInline(stripBlock(line));
}

function stripBlock(line: string): string {
  return line
    .replace(/^ {0,3}#{1,6}\s+/, '')
    .replace(/\s+#+\s*$/, '')
    .replace(/^\s*(>\s*)+/, '')
    .replace(/^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, '');
}

function stripInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .trim();
}

/**
 * A note's verses seen against the day's readings, for the editor's chips: which readings
 * the verses fully cover (selected), and what's left over (other verses, normalized).
 * When no reading is covered (or the verses don't parse), the text comes back as typed.
 */
export function splitVerses(verses: string, readings: readonly string[]): { selected: boolean[]; extra: string } {
  const parsed = parseVerses(verses);
  if (!parsed.ok) return { selected: readings.map(() => false), extra: verses };
  const have = parsed.ranges;
  const covered = (r: VerseRange) => have.some((h) => h.start <= r.start && r.end <= h.end);
  const readingRanges = readings.map((d) => {
    const p = parseVerses(d);
    return p.ok ? p.ranges : [];
  });
  const selected = readingRanges.map((rs) => rs.length > 0 && rs.every(covered));
  // Nothing taken out: give back the text as typed, not normalized.
  if (!selected.some(Boolean)) return { selected, extra: verses.trim() };
  const taken = readingRanges.filter((_, i) => selected[i]).flat();
  return { selected, extra: formatRanges(subtract(have, taken)) };
}

/**
 * The verses field for chosen readings plus other verses: e.g. ["John 3"] and "isa 53"
 * → "John 3; isa 53". The server parses and normalizes it.
 */
export function joinVerses(readings: readonly string[], extra: string): string {
  return [...readings, extra.trim()].filter(Boolean).join('; ');
}

/** `from` minus every range in `minus`; all inclusive verse-ID ranges. */
function subtract(from: readonly VerseRange[], minus: readonly VerseRange[]): VerseRange[] {
  let out = from.map((r) => ({ ...r }));
  for (const m of minus) {
    out = out.flatMap((r) => {
      if (m.end < r.start || m.start > r.end) return [r];
      const parts: VerseRange[] = [];
      if (r.start < m.start) parts.push({ start: r.start, end: m.start - 1 });
      if (m.end < r.end) parts.push({ start: m.end + 1, end: r.end });
      return parts;
    });
  }
  return out;
}
