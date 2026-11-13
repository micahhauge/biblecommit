import { appIcon } from '@/app-icon';

/**
 * The tab favicon plus the manifest icons (see manifest.ts). The favicon uses the bolder
 * cover-only art; the manifest gets the Bible-on-a-tile, rounded for purpose "any" and
 * full-bleed for "maskable" (the OS applies its own mask).
 */
const ICONS = {
  '32': { size: 32, art: 'favicon', rounded: true },
  '192': { size: 192, art: 'app', rounded: true },
  '512': { size: 512, art: 'app', rounded: true },
  'maskable-512': { size: 512, art: 'app', rounded: false },
} as const;

type IconId = keyof typeof ICONS;

export function generateImageMetadata() {
  return Object.entries(ICONS).map(([id, { size }]) => ({ id, size: { width: size, height: size }, contentType: 'image/png' }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const { size, art, rounded } = ICONS[(await id) as IconId] ?? ICONS['512'];
  return appIcon(size, art, { rounded });
}
