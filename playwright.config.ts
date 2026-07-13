import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';
const pixel = devices['Pixel 5'];
const iphone = devices['iPhone 13'];

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30_000,
  expect: {
    timeout: 7_000
  },
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  use: {
    baseURL,
    serviceWorkers: 'allow',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 7_000,
    navigationTimeout: 15_000
  },
  webServer: {
    command: 'npm run preview:test',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 1_000 }
  },
  projects: [
    {
      name: 'chromium-mobile-portrait',
      use: { ...pixel }
    },
    {
      name: 'webkit-mobile-portrait',
      use: { ...iphone }
    },
    {
      name: 'chromium-mobile-landscape',
      testMatch: /(orientation|petlya-17)\.spec\.ts/,
      use: {
        ...pixel,
        viewport: { width: 851, height: 393 },
        screen: { width: 851, height: 393 }
      }
    },
    {
      name: 'webkit-mobile-landscape',
      testMatch: /(orientation|petlya-17)\.spec\.ts/,
      use: {
        ...iphone,
        viewport: { width: 844, height: 390 },
        screen: { width: 844, height: 390 }
      }
    }
  ]
});
