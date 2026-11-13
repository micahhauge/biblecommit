import { ImageResponse } from 'next/og';
import { iconSvg, type IconArt } from '@/brand';

/** The icon at a given square size, as a PNG. */
export function appIcon(size: number, art: IconArt = 'app', opts: { rounded?: boolean } = {}) {
  const src = `data:image/svg+xml;base64,${Buffer.from(iconSvg(art, opts)).toString('base64')}`;
  return new ImageResponse(
    (
      <img src={src} width={size} height={size} alt="" />
    ),
    { width: size, height: size },
  );
}
