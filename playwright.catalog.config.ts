import { defineConfig } from '@playwright/test';
const executablePath=process.env.PW_BROWSER_EXECUTABLE;
export default defineConfig({
  testDir:'./tests/e2e',
  testMatch:/(pocket-deck|launcher-stage-two|launcher-stage-three|catalog-design)\.spec\.ts/,
  outputDir:'./quality-artifacts/catalog',
  workers:2,retries:0,timeout:35000,expect:{timeout:6000},
  reporter:[['line']],
  use:{baseURL:'http://127.0.0.1:4173',screenshot:'only-on-failure',trace:'retain-on-failure',actionTimeout:6000,
    launchOptions:executablePath?{executablePath,args:['--no-sandbox','--no-zygote','--disable-dev-shm-usage']}:{}},
  webServer:{command:'node scripts/serve-site.mjs',url:'http://127.0.0.1:4173',reuseExistingServer:true},
  projects:[
    {name:'chromium-desktop',use:{browserName:'chromium',viewport:{width:1366,height:900}}},
    {name:'chromium-phone',use:{browserName:'chromium',viewport:{width:393,height:852},isMobile:true,hasTouch:true}},
    {name:'chromium-short',testMatch:/catalog-design\.spec\.ts/,use:{browserName:'chromium',viewport:{width:320,height:568},isMobile:true,hasTouch:true}},
    {name:'chromium-tablet',testMatch:/catalog-design\.spec\.ts/,use:{browserName:'chromium',viewport:{width:820,height:1180},isMobile:true,hasTouch:true}},
    {name:'chromium-landscape',testMatch:/catalog-design\.spec\.ts/,use:{browserName:'chromium',viewport:{width:852,height:393},isMobile:true,hasTouch:true}},
    {name:'webkit-phone',use:{browserName:'webkit',viewport:{width:390,height:844},isMobile:true,hasTouch:true,launchOptions:process.env.PW_WEBKIT_EXECUTABLE?{executablePath:process.env.PW_WEBKIT_EXECUTABLE}:{}}}
  ]
});
