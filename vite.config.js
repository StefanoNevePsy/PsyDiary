import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// base relativa: il sito funziona anche in una sottocartella (GitHub Pages)
export default defineConfig({
  base: './',
  plugins: [
    svelte(),
    // App installabile che funziona anche senza rete. Gli aggiornamenti si
    // installano quando l'utente lo chiede (mai a metà di una nota).
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icone/apple-180.png'],
      manifest: {
        name: 'PsyDiary',
        short_name: 'PsyDiary',
        description: 'Il diario clinico dell\'aula',
        lang: 'it',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f4efe6',
        theme_color: '#f4efe6',
        icons: [
          { src: 'icone/icona-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone/icona-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone/mascherabile-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
});
