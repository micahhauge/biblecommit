import { appIcon } from '@/app-icon';

/** Tab favicon plus the sizes the web app manifest needs (see manifest.ts). */
export const ICON_SIZES = [32, 192, 512] as const;

export function generateImageMetadata() {
  return ICON_SIZES.map((s) => ({ id: String(s), size: { width: s, height: s }, contentType: 'image/png' }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  return appIcon(Number(await id));
}
