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
        id: '/apps/sinew/',
        name: 'SINEW',
        short_name: 'SINEW',
        description: 'Физическая first-person дуэль, где камера напрямую управляет инерционным телом, мечом и щитом.',
        start_url: './',
        scope: './',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone', 'minimal-ui'],
        orientation: 'landscape',
        background_color: '#211b17',
        theme_color: '#211b17',
        icons: [{
          src: './icons/icon.svg',
          sizes: 'any',
          type: 'image/svg+xml',
          purpose: 'any maskable'
        }]
      },
      injectManifest: {
        globPatterns: ['**/*.{html,js,css,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 14 * 1024 * 1024
      },
      devOptions: { enabled: true, type: 'module' }
    })
  ]
});
