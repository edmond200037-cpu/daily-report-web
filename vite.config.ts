import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',
      injectRegister: false,
      registerType: 'prompt',
      manifest: {
        name: '施工日報與水位變化管理',
        short_name: '工地管理',
        start_url: './#daily',
        display: 'standalone',
        theme_color: '#173f3a',
        background_color: '#f7f4ed',
        icons: [
          { src: './icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
