import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import { chromium, webkit, devices } from '@playwright/test';
import { scanDom, validateVisualScenes, writeContactSheet } from './visual-qa-core.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const [slug, ...args] = process.argv.slice(2);
const getArg = (key) => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug ?? '')) {
  console.error('Usage: npm run pw:visual-test -- <app-slug> [--url http://127.0.0.1:4173]');
  process.exit(2);
}
const appDir = join(root, 'apps', slug);
await stat(join(appDir, 'app.config.json'));
let scenes;
try { scenes = validateVisualScenes(JSON.parse(await readFile(join(appDir, 'visual-scenes.json'), 'utf8'))); }
catch (error) { if (error.code === 'ENOENT') scenes = [{ name: 'initial', steps: [] }]; else throw error; }
const base = getArg('--url') ?? 'http://127.0.0.1:4173';
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw new Error('--url must be a local preview server');
const output = join(root, 'quality-artifacts', 'visual', slug, new Date().toISOString().replaceAll(':', '-'));
await mkdir(output, { recursive: true });
let server;
if (!getArg('--url')) {
  await stat(join(root, 'dist-site', 'apps', slug, 'index.html')).catch(() => { throw new Error('Build first: npm run deploy:site'); });
  server = spawn(process.execPath, [join(root, 'scripts/serve-site.mjs')], { cwd: root, stdio: 'ignore' });
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { const response = await fetch(base); if (response.ok) { ready = true; break; } } catch {}
    await wait(250);
  }
  if (!ready) { server.kill(); throw new Error('Local preview did not start'); }
}
const variants = [
  { name: 'chromium-portrait', engine: chromium, device: devices['Pixel 5'] },
  { name: 'webkit-portrait', engine: webkit, device: devices['iPhone 13'] },
  { name: 'chromium-landscape', engine: chromium, device: { ...devices['Pixel 5'], viewport: { width: 851, height: 393 } } },
  { name: 'webkit-landscape', engine: webkit, device: { ...devices['iPhone 13'], viewport: { width: 844, height: 390 } } }
];
const report = { app: slug, base, scenes: [], errors: [] };
const contact = [];
try {
  for (const variant of variants) {
    const browser = await variant.engine.launch({ headless: true });
    try {
      const context = await browser.newContext({ ...variant.device, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('requestfailed', (request) => errors.push(`Request failed: ${request.url()}`));
      for (const scene of scenes) {
        const path = scene.path ?? `/apps/${slug}/`;
        if (!path.startsWith(`/apps/${slug}/`)) throw new Error(`Scene path escapes app: ${path}`);
        await page.goto(`${base}${path}`, { waitUntil: 'networkidle', timeout: 30000 });
        for (const step of scene.steps ?? []) {
          if (step.action === 'click') await page.locator(step.selector).first().click();
          if (step.action === 'waitFor') await page.locator(step.selector).first().waitFor({ state: 'visible' });
          if (step.action === 'pause') await page.waitForTimeout(step.ms);
        }
        const file = join(output, `${variant.name}-${scene.name}.png`);
        await page.screenshot({ path: file, animations: 'disabled' });
        const dom = await scanDom(page);
        report.scenes.push({ variant: variant.name, scene: scene.name, screenshot: file, dom, errors: errors.splice(0) });
        contact.push({ screenshot: file, label: `${variant.name} / ${scene.name}` });
      }
      await context.close();
    } finally { await browser.close(); }
  }
  await writeContactSheet(contact, join(output, 'contact-sheet.svg'));
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Visual QA: ${output}\n${report.scenes.length} screenshots, contact-sheet.svg, report.json`);
  const issueCount = report.scenes.reduce((count, item) => count + item.errors.length + item.dom.overflows.length, 0);
  if (issueCount) { console.error(`${issueCount} console/request/viewport issue(s) detected`); process.exitCode = 1; }
} finally { server?.kill(); }
