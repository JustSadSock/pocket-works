import {defineConfig,devices} from '@playwright/test';
import {fileURLToPath} from 'node:url';
const baseURL='http://127.0.0.1:8765';
export default defineConfig({
 testDir:'.',
 testMatch:['real-flow.spec.ts','online-flow.spec.ts','stage0.spec.ts','stage1.spec.ts','stage2.spec.ts','stage3.spec.ts','stage4.spec.ts'],
 timeout:35000,
 maxFailures:1,
 expect:{timeout:9000},
 retries:0,
 workers:1,
 fullyParallel:false,
 reporter:[['line'],['html',{outputFolder:'fog-playwright-report',open:'never'}]],
 outputDir:'fog-playwright-results',
 use:{baseURL,trace:'retain-on-failure',screenshot:'on',serviceWorkers:'block'},
 webServer:{command:'python3 -m http.server 8765 --directory .',cwd:fileURLToPath(new URL('../../../',import.meta.url)),url:baseURL+'/apps/fog-of-conquest/',reuseExistingServer:false,timeout:60000},
 projects:[
  {name:'chromium-phone',use:{...devices['Pixel 5']}},
  {name:'webkit-phone',use:{...devices['iPhone 13']}},
  {name:'chromium-desktop',use:{browserName:'chromium',viewport:{width:1365,height:900},deviceScaleFactor:1}},
  {name:'webkit-desktop',use:{browserName:'webkit',viewport:{width:1365,height:900},deviceScaleFactor:1}}
 ]
});
