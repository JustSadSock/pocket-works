import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vite';
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
          return undefined;
        }
      }
    }
  },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: sourceRoot,
      filename: 'sw.ts',
      injectRegister: null,
      registerType: 'prompt',
      manifestFilename: 'manifest.webmanifest',
      manifest: {
        id: '/apps/firn/',
        name: 'FIRN',
        short_name: 'FIRN',
        description: 'Иммерсивная прогулка от первого лица по процедурным снежным горам.',
        start_url: './',
        scope: './',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone', 'minimal-ui'],
        orientation: 'landscape',
        background_color: '#d8e8ef',
        theme_color: '#d8e8ef',
        icons: [{ src: './icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
      },
      injectManifest: {
        globPatterns: ['**/*.{html,js,css,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024
      },
      devOptions: { enabled: true, type: 'module' }
    })
  ]
});
