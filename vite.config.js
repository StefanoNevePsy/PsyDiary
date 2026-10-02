import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { loadEnv } from 'vite';

// Content Security Policy (GitHub Pages non permette intestazioni HTTP: va in
// un <meta>). L'app carica codice solo da sé stessa e dall'accesso Google, e
// parla solo con il custode configurato e con Google. Così un eventuale
// difetto non può caricare script altrui né spedire dati altrove.
function csp(mode) {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  let custode = '';
  try { custode = env.VITE_CUSTODE_URL ? new URL(env.VITE_CUSTODE_URL).origin : ''; } catch (e) { custode = ''; }
  // Apps Script risponde da script.googleusercontent.com dopo il reindirizzamento
  const appsScript = custode === 'https://script.google.com' ? ' https://script.googleusercontent.com' : '';
  const regole = [
    "default-src 'self'",
    "script-src 'self' https://accounts.google.com/gsi/client",
    "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
    "img-src 'self' data: blob: https://*.googleusercontent.com",
    "font-src 'self' data:",
    `connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com${custode ? ' ' + custode : ''}${appsScript}`,
    'frame-src https://accounts.google.com',
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  return {
    name: 'psydiary-csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${regole.join('; ')}" />`),
  };
}

// base relativa: il sito funziona anche in una sottocartella (GitHub Pages)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    svelte(),
    csp(mode),
    // App installabile che funziona anche senza rete. Gli aggiornamenti si
    // installano quando l'utente lo chiede (mai a metà di una nota).
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icone/apple-180.png', 'tema.js'],
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
}));
