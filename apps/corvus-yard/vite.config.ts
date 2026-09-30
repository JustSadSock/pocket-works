import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.join(appRoot, 'source');
const buildRoot = path.join(appRoot, '.dist');

export default defineConfig({
  root: sourceRoot,
  base: './',
  publicDir: path.join(appRoot, 'public'),
  build: {
    outDir: buildRoot,
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        entryFileNames: 'app.js',
        chunkFileNames: 'assets/chunks/[name]-[hash].js',
        assetFileNames(assetInfo) {
          const name = assetInfo.name || '';
          return name.endsWith('.css') ? 'styles.css' : 'assets/[name]-[hash][extname]';
        },
        manualChunks(id) {
          if (id.includes('@babylonjs/core')) return 'babylon-engine';
          if (id.includes('@babylonjs/loaders')) return 'babylon-loaders';
          return undefined;
        }
      }
    }
  },
  test: { include: [path.join(sourceRoot, '**/*.test.ts')], environment: 'node' },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: sourceRoot,
      filename: 'sw.ts',
      injectRegister: null,
      registerType: 'prompt',
      manifestFilename: 'manifest.webmanifest',
      manifest: {
        id: '/apps/corvus-yard/',
        name: 'CORVUS',
        short_name: 'CORVUS',
        description: 'Живой ворон над осенним каналом.',
        start_url: './',
        scope: './',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone', 'minimal-ui'],
        orientation: 'portrait',
        background_color: '#34403a',
        theme_color: '#34403a',
        icons: [{ src: './icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' }, { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }]
      },
      injectManifest: {
        globPatterns: ['**/*.{html,js,css,svg,png,webmanifest,glb}'],
        maximumFileSizeToCacheInBytes: 24 * 1024 * 1024
      },
      devOptions: { enabled: true, type: 'module' }
    })
  ]
});
