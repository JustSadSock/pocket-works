import { defineConfig, devices } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'browser.spec.mjs',timeout:60000,workers:2,outputDir:'../../quality-artifacts/art-forge-browser',reporter:'list',
 use:{baseURL:'http://127.0.0.1:4199',video:'on',trace:'retain-on-failure'},
 projects:['chromium','webkit'].flatMap(browserName=>['portrait','landscape'].map(orientation=>({name:`${browserName}-${orientation}`,use:{...devices['iPhone 13'],browserName,viewport:orientation==='portrait'?{width:390,height:844}:{width:844,height:390}}}))),
 webServer:{command:'node tools/art-forge/serve-browser.mjs',url:'http://127.0.0.1:4199/after/',reuseExistingServer:false}
});
