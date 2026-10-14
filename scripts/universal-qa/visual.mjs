// Browser evidence capture. Screenshots are artifacts for human/agent inspection,
// not an invented visual-quality score. Uses the published (dist-site) runtime.
import { chromium, webkit } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadSuites } from './plan.mjs';

const task = JSON.parse(process.env.PW_QA_TASK);
const suite = loadSuites(ROOT, task.app).find(s => s.id === task.suite);
const out = process.env.PW_QA_OUTPUT_DIR;
const baseURL = 'http://127.0.0.1:4173';
const shapes = {
  mobile: { width: 390, height: 844, mobile: true },
  tablet: { width: 768, height: 1024, mobile: true },
  desktop: { width: 1366, height: 768, mobile: false }
};
const engines = suite.engines ?? ['chromium', 'webkit'];
if (!Array.isArray(engines) || !engines.length || engines.length > 2 ||
    engines.some(x => !['chromium', 'webkit'].includes(x))) throw Error('Unsupported visual browser engine');
mkdirSync(out, { recursive: true });
const report = { app: task.app, suite: suite.id, screens: [], failures: [] };
const server = spawn(process.execPath, ['scripts/serve-site.mjs'], {
  cwd: ROOT, env: { ...process.env, PORT: '4173', POCKET_WORKS_SITE_ROOT: process.env.PW_QA_SITE_ROOT || ROOT }, stdio: 'ignore', shell: false
});
const browsers = [];

const waitForServer = async () => {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw Error('Preview server exited before it was ready');
    try { const r = await fetch(baseURL + '/apps/' + task.app + '/'); if (r.ok) return; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw Error('Timed out waiting for production-like preview');
};
const safeName = value => value.replace(/[^a-z0-9_-]/gi, '-').slice(0, 70);
async function executeStep(page, step, prefix, index) {
  if (step.action === 'click') await page.locator(step.selector).first().click({ timeout: 7000 });
  if (step.action === 'fill') await page.locator(step.selector).first().fill(step.value, { timeout: 7000 });
  if (step.action === 'visible') await page.locator(step.selector).first().waitFor({ state: 'visible', timeout: 7000 });
  if (step.action === 'screenshot') {
    await page.screenshot({ path: join(out, prefix + '-step-' + index + '.png'), fullPage: true });
  }
}

try {
  await waitForServer();
  for (const engine of engines) {
    const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true });
    browsers.push(browser);
    for (const device of suite.viewports ?? ['mobile', 'desktop']) {
      const shape = shapes[device];
      const context = await browser.newContext({ viewport: { width: shape.width, height: shape.height },
        deviceScaleFactor: 1, isMobile: shape.mobile, hasTouch: shape.mobile, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const prefix = safeName(engine + '-' + device);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });
      const evidence = { engine, viewport: device, width: shape.width, height: shape.height, errors };
      report.screens.push(evidence);
      try {
        const response = await page.goto(baseURL + '/apps/' + task.app + '/', {
          waitUntil: 'domcontentloaded', timeout: 30000
        });
        evidence.httpStatus = response?.status() ?? null;
        if (!response || !response.ok()) throw Error('App did not return HTTP 2xx');
        await page.locator(suite.ready || 'body').first().waitFor({ state: 'visible', timeout: 16000 });
        await page.waitForTimeout(800);
        const layout = await page.evaluate(() => ({
          bodyWidth: document.body.scrollWidth,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
          title: document.title,
          interactiveControls: document.querySelectorAll('button,a[href],input,select,textarea').length,
          visibleBody: Boolean(document.body.getBoundingClientRect().width)
        }));
        Object.assign(evidence, layout);
        await page.screenshot({ path: join(out, prefix + '-entry.png'), fullPage: true });
        if (!layout.visibleBody) throw Error('Body has no visible size');
        if (Math.max(layout.bodyWidth, layout.documentWidth) > layout.viewportWidth + 8)
          throw Error('Horizontal overflow: ' + Math.max(layout.bodyWidth, layout.documentWidth) + 'px > ' + layout.viewportWidth + 'px');
        for (const [index, step] of (suite.steps ?? []).entries()) {
          await executeStep(page, step, prefix, index);
        }
        if (suite.steps?.length) {
          await page.screenshot({ path: join(out, prefix + '-after.png'), fullPage: true });
        }
        if (errors.some(e => !e.startsWith('console:'))) throw Error('Unhandled page errors: ' + errors.join(' | '));
        evidence.success = true;
      } catch (error) {
        evidence.success = false;
        evidence.error = String(error?.message || error);
        report.failures.push(prefix + ': ' + evidence.error);
        try { await page.screenshot({ path: join(out, prefix + '-failure.png'), fullPage: true }); } catch {}
      } finally { await context.close(); }
    }
  }
} catch (error) {
  report.failures.push(String(error?.stack || error));
} finally {
  for (const browser of browsers) await browser.close();
  server.kill('SIGTERM');
  writeFileSync(join(out, 'visual.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
if (report.failures.length) process.exitCode = 1;
