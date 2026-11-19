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
