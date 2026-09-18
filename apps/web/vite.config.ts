import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.svg'],
      manifest: {
        name: 'ミエル — 今夜、衛星は見えるか',
        short_name: 'ミエル',
        description:
          'ISSが自宅の空に見える日だけを教えてくれる観測支援アプリ',
        lang: 'ja',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        // 夜空の色。スプラッシュとステータスバーに使われる
        theme_color: '#05070D',
        background_color: '#05070D',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            // 予報データは鮮度優先。取れなければキャッシュで縮退運転する（NFR-4）
            urlPattern: /\/data\/.*\.json$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mieru-forecast',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 天気は1時間もてば十分
            urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mieru-weather',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    // 軌道計算（satellite.js）は Web Worker 側にしか無いので、
    // Vite が自動で別チャンクに切り出す。初期バンドルには乗らない。
    // 「起動2秒以内に結論」を守るうえで重要なポイント。
    chunkSizeWarningLimit: 300,
  },
  worker: {
    format: 'es',
  },
});
