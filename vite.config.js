import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  // Rutas relativas: permite servir el build desde cualquier subdirectorio
  // (p. ej. el hosting de sites.super.myninja.ai/…/410133af/)
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 12000
  },
  server: {
    host: true,
    port: 5173
  }
})
