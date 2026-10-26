import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
const repositoryRoot=fileURLToPath(new URL('../../../',import.meta.url));

export default defineConfig({
 testDir:'.',
 testMatch:['cockpit-smoke.spec.js','agent-journey.spec.js','field-cockpit.spec.js','perekos.spec.js'],
 timeout:60_000,
 expect:{timeout:12_000},
 workers:1,
 fullyParallel:false,
 retries:0,
 reporter:[['line'],['html',{outputFolder:'petri-forge-playwright-report',open:'never'}]],
 use:{
  baseURL:'http://127.0.0.1:4173',
  browserName:'chromium',
  headless:true,
  serviceWorkers:'block',
  trace:'retain-on-failure',
  screenshot:'only-on-failure',
  actionTimeout:12_000,
  viewport:{width:1280,height:800}
 },
 webServer:{
  command:'POCKET_WORKS_SITE_ROOT=. node scripts/serve-site.mjs',
  cwd:repositoryRoot,
  url:'http://127.0.0.1:4173/apps/petri-forge/',
  timeout:30_000,
  reuseExistingServer:!process.env.CI
 }
});
