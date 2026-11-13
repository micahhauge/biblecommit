import { appIcon } from '@/app-icon';

/**
 * The tab favicon plus the manifest icons (see manifest.ts): rounded for purpose "any",
 * full-bleed for "maskable" (the OS applies its own mask).
 */
const ICONS = {
  '32': { size: 32, rounded: true },
  '192': { size: 192, rounded: true },
  '512': { size: 512, rounded: true },
  'maskable-512': { size: 512, rounded: false },
} as const;

type IconId = keyof typeof ICONS;

export function generateImageMetadata() {
  return Object.entries(ICONS).map(([id, { size }]) => ({ id, size: { width: size, height: size }, contentType: 'image/png' }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const { size, rounded } = ICONS[(await id) as IconId] ?? ICONS['512'];
  return appIcon(size, { rounded });
}
