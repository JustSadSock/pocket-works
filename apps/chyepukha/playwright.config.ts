import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
 testDir:'./qa',
 testMatch:/\.spec\.ts$/,
 fullyParallel:false,
 timeout:45_000,
 expect:{timeout:7_000},
 retries:process.env.CI?1:0,
 workers:process.env.CI?1:undefined,
 reporter:process.env.CI?[['line'],['html',{outputFolder:'playwright-report/chyepukha',open:'never'}]]:[['list']],
 use:{
  baseURL:'http://127.0.0.1:4174',
  serviceWorkers:'block',
  trace:'on-first-retry',
  screenshot:'only-on-failure',
  video:'retain-on-failure',
  actionTimeout:7_000,
  navigationTimeout:15_000
 },
 projects:[
  {name:'chromium-desktop',use:{...devices['Desktop Chrome'],viewport:{width:1366,height:768}}},
  {name:'chromium-phone',use:{...devices['Pixel 5']}},
  {name:'webkit-phone',use:{...devices['iPhone 13']}}
 ],
 webServer:{
  command:'node qa/serve.mjs',
  url:'http://127.0.0.1:4174/apps/chyepukha/index.html',
  reuseExistingServer:!process.env.CI,
  timeout:30_000,
  gracefulShutdown:{signal:'SIGTERM',timeout:1_000}
 }
});
