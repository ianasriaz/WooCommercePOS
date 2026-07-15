import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'POS Terminal',
        short_name: 'POS',
        description: 'Point of Sale System',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'landscape',
        icons: [
          {
            src: 'https://cdn-icons-png.flaticon.com/512/1011/1011409.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
});
