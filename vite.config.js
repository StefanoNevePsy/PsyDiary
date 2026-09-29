import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// base relativa: il sito funziona anche in una sottocartella (GitHub Pages)
export default defineConfig({
  base: './',
  plugins: [svelte()],
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
});
