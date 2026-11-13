import type { MetadataRoute } from 'next';
import { PAPER } from '@/mode-pref';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Biblecommit',
    short_name: 'Biblecommit',
    description: 'Commit the Scripture you read.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // The splash screen can't know the chosen mode; dark is the default. Once open, the
    // page's theme-color (from the mode cookie) takes over.
    background_color: PAPER.dark,
    theme_color: PAPER.dark,
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon/maskable-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
