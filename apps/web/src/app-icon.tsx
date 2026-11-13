import { ImageResponse } from 'next/og';
import { PAPER } from '@/mode-pref';

/**
 * The app icon at a given square size, as a PNG.
 *
 * PLACEHOLDER until the real mark is chosen (see prototype/logos-book.html). The glyph sits
 * inside the middle 60%, so the same art is safe as a maskable icon (whose safe zone is the
 * middle 80%) — keep that true when swapping in the real logo.
 */
export function appIcon(size: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: PAPER.dark,
          color: 'rgb(127 152 209)',
          fontSize: size * 0.6,
          fontStyle: 'italic',
          lineHeight: 1,
        }}
      >
        b
      </div>
    ),
    { width: size, height: size },
  );
}
