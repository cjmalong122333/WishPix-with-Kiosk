import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'WishPix Teacher App',
    short_name: 'WishPix',
    description: 'WishPix Teacher App for managing classroom sessions, safety moderation, and printing.',
    start_url: '/teacher/login',
    scope: '/teacher',
    display: 'standalone',
    background_color: '#f8f6ff',
    theme_color: '#7950d5',
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
