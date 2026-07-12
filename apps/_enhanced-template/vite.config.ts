import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.join(appRoot, 'source');

export default defineConfig({
  root: sourceRoot,
  base: './',
  publicDir: path.join(appRoot, 'public'),
  build: {
    outDir: appRoot,
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      output: {
        entryFileNames: 'app.js',
        chunkFileNames: 'assets/chunks/[name]-[hash].js',
        assetFileNames(assetInfo) {
          const name = assetInfo.name || '';
          return name.endsWith('.css') ? 'styles.css' : 'assets/[name]-[hash][extname]';
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
        id: '/apps/__APP_SLUG__/',
        name: '__APP_NAME__',
        short_name: '__APP_SHORT_NAME__',
        description: '__APP_DESCRIPTION__',
        start_url: './',
        scope: './',
        display: 'standalone',
        display_override: ['standalone', 'fullscreen', 'minimal-ui'],
        orientation: '__APP_ORIENTATION__',
        background_color: '__APP_BACKGROUND__',
        theme_color: '__APP_THEME__',
        icons: [{
          src: './icons/icon.svg',
          sizes: 'any',
          type: 'image/svg+xml',
          purpose: 'any maskable'
        }]
      },
      injectManifest: {
        globPatterns: ['**/*.{html,js,css,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
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
