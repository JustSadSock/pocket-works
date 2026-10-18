import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'.',
 testMatch:['worker-flow.spec.ts'],
 timeout:160000,
 expect:{timeout:12000},
 retries:0,workers:1,fullyParallel:false,
 reporter:[['line']],
 outputDir:'fog-real-worker-results',
 use:{baseURL:process.env.POCKETNET_TEST_URL||'http://127.0.0.1:8787',
  serviceWorkers:'block',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'fog-real-chromium',use:{...devices['Desktop Chrome']}}]
});
