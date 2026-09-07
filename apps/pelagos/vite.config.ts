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
        id: '/apps/pelagos/',
        name: 'PELAGOS',
        short_name: 'PELAGOS',
        description: 'Премиальная 3D-игра о парусном корабле в открытом море: физические волны, ветер, плавучесть, гребля, погода и портретное управление для iPhone.',
        start_url: './',
        scope: './',
        display: 'standalone',
        display_override: ['standalone', 'fullscreen', 'minimal-ui'],
        orientation: 'portrait',
        background_color: '#081719',
        theme_color: '#081719',
        icons: [{
          src: './icons/icon.svg',
          sizes: 'any',
          type: 'image/svg+xml',
          purpose: 'any maskable'
        }]
      },
      injectManifest: {
        globPatterns: ['**/*.{html,js,css,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
  test: {
    include: [path.join(sourceRoot, '**/*.test.ts')],
    environment: 'node'
  }
});
