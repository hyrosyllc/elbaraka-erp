import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Elbaraka Epices',
    short_name: 'Elbaraka',
    description: 'Elbaraka Epices operations workspace and store orders.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f1f17',
    theme_color: '#1f6041',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Staff workspace', short_name: 'Staff', url: '/staff', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Place an order', short_name: 'Order', url: '/', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
