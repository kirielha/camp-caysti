/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Sous-dossier de publication : « /camp-caysti/ » sur GitHub Pages (fourni par le workflow), « / » sinon
const base = process.env.VITE_BASE ?? '/'

export default defineConfig(({ mode }) => ({
  // mode « apercu » : build sans service worker, chemins relatifs (aperçu hébergé statiquement)
  base: mode === 'apercu' ? './' : base,
  plugins: [
    react(),
    mode !== 'apercu' && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'demo/*.svg'],
      manifest: {
        name: 'Camp CAYSTI',
        short_name: 'Camp CAYSTI',
        description: 'Tests, quiz et Boussole RIASEC des camps de formation CAYSTI',
        lang: 'fr',
        theme_color: '#1b2a4a',
        background_color: '#fffaf2',
        display: 'standalone',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // l'application entière est mise en cache : elle s'ouvre sans réseau
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
  test: {
    environment: 'node',
    // les tests tournent toujours sur le stockage local, même si .env pointe vers Supabase
    env: { VITE_DATA_BACKEND: 'local' },
  },
}))
