import { describe, expect, it } from 'vitest';
import { getChapter, TOTAL_CHAPTERS } from './canon';
import { chapterLabel, chapterLevel, chapterReads, coverage, readLabel } from './canon-reads';
import { parse } from './parse';

/** The verse ranges a reading parses to. */
function ranges(...texts: string[]) {
  return texts.flatMap((text) => {
    const p = parse(text, { today: '2026-11-09' });
    if (!p.ok) throw new Error(p.error);
    return p.ranges;
  });
}

const chapterIndex = (bookId: number, chapter: number) => getChapter(bookId, chapter)!.id - 1;

describe('chapterReads', () => {
  it('is one unread entry per chapter with nothing read', () => {
    const reads = chapterReads([]);
    expect(reads).toHaveLength(TOTAL_CHAPTERS);
    expect(reads.every((r) => r.times === 0 && r.versesRead === 0)).toBe(true);
  });

  it('counts a chapter read whole as read once', () => {
    const reads = chapterReads(ranges('gen 12'));
    expect(reads[chapterIndex(1, 12)]).toEqual({ times: 1, versesRead: 20 });
    expect(reads[chapterIndex(1, 11)]).toEqual({ times: 0, versesRead: 0 });
    expect(reads[chapterIndex(1, 13)]).toEqual({ times: 0, versesRead: 0 });
  });

  it('takes the fewest reads of any verse, counting repeats', () => {
    // John 3 twice, and John 3:16 a third time: still read 2×.
    const reads = chapterReads(ranges('john 3', 'john 3', 'john 3:16'));
    expect(reads[chapterIndex(43, 3)]).toEqual({ times: 2, versesRead: 36 });
  });

  it('counts a chapter assembled from pieces once every verse is in', () => {
    expect(chapterReads(ranges('ps 23:1-3'))[chapterIndex(19, 23)]).toEqual({ times: 0, versesRead: 3 });
    expect(chapterReads(ranges('ps 23:1-3', 'ps 23:4-6'))[chapterIndex(19, 23)]).toEqual({ times: 1, versesRead: 6 });
  });

  it('handles ranges spanning chapters and books, and the last verse of the canon', () => {
    const reads = chapterReads(ranges('gen 50, exod 1-2', 'rev 22:21'));
    expect([reads[chapterIndex(1, 50)], reads[chapterIndex(2, 1)], reads[chapterIndex(2, 2)]].map((r) => r!.times)).toEqual([1, 1, 1]);
    expect(reads[chapterIndex(2, 3)]!.times).toBe(0);
    expect(reads.at(-1)).toEqual({ times: 0, versesRead: 1 });
  });
});

describe('chapterLevel and readLabel', () => {
  it('puts partly read chapters below 1×, and tops out at 3+', () => {
    const cases = [
      { times: 0, versesRead: 0 },
      { times: 0, versesRead: 4 },
      { times: 1, versesRead: 20 },
      { times: 2, versesRead: 20 },
      { times: 3, versesRead: 20 },
      { times: 7, versesRead: 20 },
    ];
    expect(cases.map(chapterLevel)).toEqual([0, 1, 2, 3, 4, 4]);
    expect(cases.map(readLabel)).toEqual(['not yet read', 'partly read', 'read 1×', 'read 2×', 'read 3×', 'read 7×']);
  });
});

describe('chapterLabel', () => {
  it('names a chapter the way people say it', () => {
    expect(chapterLabel(1, 12)).toBe('Genesis 12');
    expect(chapterLabel(19, 23)).toBe('Psalm 23');
    expect(chapterLabel(65, 1)).toBe('Jude');
  });
});

describe('coverage', () => {
  it('is chapters read through at least once, out of 1,189', () => {
    const c = coverage(chapterReads(ranges('john 3', 'john 3', 'gen 1-2', 'ps 23:1')));
    expect(c).toEqual({ chaptersRead: 3, readMoreThanOnce: 1, coverage: 3 / 1189 });
  });
});
