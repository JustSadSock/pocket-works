import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const out = process.env.PW_QA_OUTPUT_DIR || resolve(root, 'qa-artifacts', 'playwright');
export default defineConfig({
  testDir: resolve(root, 'apps'),
  testMatch: '**/qa/**/*.spec.{ts,js}',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 7000 },
  outputDir: resolve(out, 'traces'),
  reporter: [
    ['line'],
    ['html', { outputFolder: resolve(out, 'playwright-html'), open: 'never' }]
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 7000,
    navigationTimeout: 20000
  },
  webServer: {
    command: 'node scripts/serve-site.mjs',
    cwd: root,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120000
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
    { name: 'desktop-chromium', use: { browserName: 'chromium', viewport: { width: 1366, height: 768 } } }
  ]
});
