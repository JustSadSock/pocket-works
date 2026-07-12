import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const errors = [];

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function read(relativePath) {
  try {
    return await readFile(path.join(root, relativePath), 'utf8');
  } catch (error) {
    errors.push(`${relativePath} could not be read: ${error.message}`);
    return '';
  }
}

function requireIncludes(source, fragments, label) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) errors.push(`${label} must include ${fragment}`);
  }
}

const packageJson = JSON.parse(await read('package.json') || '{}');
for (const dependency of ['@playwright/test', '@lhci/cli']) {
  if (!packageJson.devDependencies?.[dependency]) errors.push(`package.json must declare ${dependency}`);
}
for (const script of ['preview:test', 'test:e2e', 'test:lighthouse', 'validate:quality']) {
  if (typeof packageJson.scripts?.[script] !== 'string') errors.push(`package.json must define ${script}`);
}

const requiredFiles = [
  'playwright.config.ts',
  'lighthouserc.json',
  'launcher-performance.css',
  'scripts/serve-site.mjs',
  'shared/view-transition-guard.js',
  'apps/screen-lab/viewport-containment.css',
  'tests/e2e/helpers.ts',
  'tests/e2e/launcher.spec.ts',
  'tests/e2e/screen-lab.spec.ts',
  'tests/e2e/orientation.spec.ts',
  'tests/e2e/service-worker.spec.ts'
];
for (const file of requiredFiles) {
  if (!(await exists(file))) errors.push(`quality gate is missing ${file}`);
}

const playwright = await read('playwright.config.ts');
requireIncludes(playwright, [
  "devices['Pixel 5']",
  "devices['iPhone 13']",
  'chromium-mobile-portrait',
  'webkit-mobile-portrait',
  'chromium-mobile-landscape',
  'webkit-mobile-landscape',
  "serviceWorkers: 'allow'",
  "trace: 'on-first-retry'",
  "video: 'retain-on-failure'",
  "command: 'npm run preview:test'"
], 'playwright.config.ts');

const helper = await read('tests/e2e/helpers.ts');
requireIncludes(helper, [
  'monitorUnexpectedBrowserOutput',
  'assertNoHorizontalOverflow',
  'assertNativeControlStyles',
  'attachCriticalScreenshot',
  'waitForActiveServiceWorker'
], 'tests/e2e/helpers.ts');

const serviceWorkerTest = await read('tests/e2e/service-worker.spec.ts');
requireIncludes(serviceWorkerTest, [
  "browserName !== 'chromium'",
  'context.setOffline(true)',
  'navigator.serviceWorker.controller',
  'manifest?.display'
], 'tests/e2e/service-worker.spec.ts');

const transitionGuard = await read('shared/view-transition-guard.js');
requireIncludes(transitionGuard, [
  'activeTransition',
  'skipTransition()',
  'immediateTransition',
  '__pocketWorksGuarded'
], 'shared/view-transition-guard.js');

const containment = await read('apps/screen-lab/viewport-containment.css');
requireIncludes(containment, [
  '.app-shell',
  'overflow-x: clip',
  'contain: layout paint'
], 'apps/screen-lab/viewport-containment.css');

const launcherPerformance = await read('launcher-performance.css');
requireIncludes(launcherPerformance, [
  '.preview-scan',
  'will-change: transform',
  '@keyframes preview-scan',
  'translateY(42px)'
], 'launcher-performance.css');

const screenLabConfig = JSON.parse(await read('apps/screen-lab/app.config.json') || '{}');
const screenLabVersion = screenLabConfig.version;
if (typeof screenLabVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(screenLabVersion)) {
  errors.push('apps/screen-lab/app.config.json must define a semantic version');
}

const screenLabIndex = await read('apps/screen-lab/index.html');
const screenLabWorker = await read('apps/screen-lab/sw.js');
requireIncludes(screenLabIndex, [
  './viewport-containment.css',
  `data-app-version="${screenLabVersion}"`,
  `SCREEN LAB / v${screenLabVersion}`
], 'apps/screen-lab/index.html');
requireIncludes(screenLabWorker, [
  './viewport-containment.css',
  `const APP_VERSION = '${screenLabVersion}'`,
  `const CACHE_NAME = 'screen-lab-v${screenLabVersion}'`
], 'apps/screen-lab/sw.js');

const lighthouse = JSON.parse(await read('lighthouserc.json') || '{}');
const collect = lighthouse.ci?.collect;
const assertions = lighthouse.ci?.assert?.assertions;
if (collect?.staticDistDir !== './dist-site') errors.push('Lighthouse must audit dist-site');
if (!Array.isArray(collect?.url) || !collect.url.includes('http://localhost/') || !collect.url.includes('http://localhost/apps/screen-lab/')) {
  errors.push('Lighthouse must audit the launcher and Screen Lab');
}
if (!Number.isInteger(collect?.numberOfRuns) || collect.numberOfRuns < 3) errors.push('Lighthouse must run each URL at least three times');
for (const assertion of [
  'categories:performance',
  'categories:accessibility',
  'categories:best-practices',
  'cumulative-layout-shift',
  'largest-contentful-paint',
  'total-blocking-time',
  'resource-summary:total:size'
]) {
  if (!assertions?.[assertion]) errors.push(`Lighthouse assertion missing ${assertion}`);
}
if (lighthouse.ci?.upload?.target !== 'filesystem') errors.push('Lighthouse reports must remain private filesystem artifacts');

const workflow = await read('.github/workflows/validate.yml');
requireIncludes(workflow, [
  'browser-quality:',
  'lighthouse:',
  'playwright install --with-deps chromium webkit',
  'npm run test:e2e',
  'npm run test:lighthouse',
  'playwright-report',
  'lighthouse-report'
], '.github/workflows/validate.yml');

const testFiles = (await readdir(path.join(root, 'tests', 'e2e'))).filter((name) => name.endsWith('.ts'));
for (const file of testFiles) {
  const source = await read(path.join('tests', 'e2e', file));
  if (source.includes('test.only(') || source.includes('describe.only(')) errors.push(`${file} must not contain focused tests`);
}

if (errors.length > 0) {
  console.error(`Quality gate validation failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Quality gate contract passed for ${testFiles.length} browser test files and the Lighthouse budget.`);
