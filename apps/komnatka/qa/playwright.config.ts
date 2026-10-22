import { defineConfig, devices } from '@playwright/test';

// Run from repository root: npx playwright test --config apps/komnatka/qa/playwright.config.ts
export default defineConfig({
  testDir: '.',
  testMatch: 'header-layout.spec.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  use: {
    ...devices['Pixel 5'],
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'npm run preview:test',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium-mobile-portrait' }]
});
