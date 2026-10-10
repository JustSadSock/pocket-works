import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { attachCriticalScreenshot } from './helpers';

type VisualEvidence = {
  schemaVersion: number;
  status: string;
  product: string;
  architecture?: { spatialLayout?: string; comparisons?: Array<{ slug: string }> };
  evidence: {
    entry: './';
    interaction: {
      type: 'click' | 'tap' | 'drag';
      selector?: string;
      from?: [number, number];
      to?: [number, number];
    };
    expectedChange: string;
  };
};
type Target = { slug: string; direction: VisualEvidence; orientation: string };

function getTargets(): Target[] {
  const explicit = (process.env.PW_APP_TARGETS || '').split(',').map(v => v.trim()).filter(Boolean);
  const results: Target[] = [];
  for (const slug of explicit) {
    if (!/^[a-z0-9-]+$/.test(slug)) continue;
    const directory = path.join(process.cwd(), 'apps', slug);
    const file = path.join(directory, 'visual-direction.json');
    if (!existsSync(file)) continue; // Grandfathered legacy apps need no visual proof until redesigned.
    const direction = JSON.parse(readFileSync(file, 'utf8')) as VisualEvidence;
    if (direction.status !== 'ready') continue; // Static CI gate will fail any unfinished changed direction.
    const config = JSON.parse(readFileSync(path.join(directory,'app.config.json'),'utf8')) as { orientation?: string };
    results.push({ slug, direction, orientation: config.orientation || 'portrait' });
  }
  return results;
}

const targets = getTargets();
test.use({ video: 'on' });

async function capture(page: Page, info: TestInfo, stage: string) {
  await attachCriticalScreenshot(page, info, stage, { fullPage: false });
}

function relativePoint(page: Page, xy: [number,number]) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('No viewport');
  return { x: Math.round(viewport.width * xy[0]), y: Math.round(viewport.height * xy[1]) };
}

async function performAndCapture(page: Page, info: TestInfo, action: VisualEvidence['evidence']['interaction']) {
  if (action.type === 'click') {
    const target = page.locator(action.selector || '');
    await expect(target.first()).toBeVisible({ timeout: 8_000 });
    await expect(target.first()).toBeEnabled();
    const area = await target.first().boundingBox();
    if (!area) throw new Error('Visual interaction has no on-screen bounds');
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
    await page.mouse.down();
    await capture(page, info, '02-action-press');
    await page.mouse.up();
  } else if (action.type === 'tap') {
    const point = relativePoint(page, action.from!);
    await page.touchscreen.tap(point.x, point.y);
    await page.waitForTimeout(80);
    await capture(page, info, '02-action-tap');
  } else {
    const from = relativePoint(page, action.from!);
    const to = relativePoint(page, action.to!);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await capture(page, info, '02-action-drag');
    await page.mouse.up();
  }
}

// These measurements are taken from the rendered page rather than from prose.
// They make two visually similar screen skeletons easy to identify in QA evidence.
async function measureTopology(page: Page) {
  return page.evaluate(() => {
    const w = innerWidth, h = innerHeight;
    const isVisible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const css = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && css.display !== 'none' &&
        css.visibility !== 'hidden' && Number(css.opacity) > 0 &&
        r.bottom > 0 && r.top < h;
    };
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return [r.x / w, r.y / h, r.width / w, r.height / h].map(n => Number(n.toFixed(3)));
    };
    const pick = (selector: string) => [...document.querySelectorAll(selector)].filter(isVisible);
    const canvases = pick('canvas');
    const buttons = pick('button, [role="button"]').filter(el => !el.closest('[hidden], [aria-hidden="true"]'));
    const distribution = { top: 0, middle: 0, bottom: 0 };
    for (const el of buttons) {
      const r = el.getBoundingClientRect();
      const position = (r.top + r.height / 2) / h;
      distribution[position < .24 ? 'top' : position > .72 ? 'bottom' : 'middle']++;
    }
    return {
      viewport: [w, h],
      headers: pick('header').slice(0, 3).map(rect),
      footers: pick('footer').slice(0, 3).map(rect),
      canvas: canvases.sort((a, b) => {
        const r = a.getBoundingClientRect(), q = b.getBoundingClientRect();
        return q.width * q.height - r.width * r.height;
      }).slice(0, 1).map(rect),
      controlDistribution: distribution,
      persistentControls: buttons.length
    };
  });
}

for (const target of targets) {
  test(`visual proof: ${target.slug}`, async ({ page }, info) => {
    const isLandscape = info.project.name.includes('landscape');
    if (target.orientation !== 'any' && (target.orientation === 'landscape') !== isLandscape) {
      test.skip();
    }
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/apps/${target.slug}/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
    await page.waitForTimeout(350);
    await capture(page, info, '01-first-frame');
    const targetTopology = await measureTopology(page);
    const firstHeader = targetTopology.headers[0];
    const stage = targetTopology.canvas[0];
    // Check a claimed "unique" composition against actual element geometry.
    // Full-bleed canvases with overlaid HUD do not satisfy the central-stage
    // condition. The threshold intentionally targets the recurrent web shell.
    const visiblyStacked = Boolean(firstHeader && stage &&
      firstHeader[1] < .12 && firstHeader[3] < .2 &&
      stage[1] > .12 && stage[3] > .24 && (stage[1] + stage[3]) < .83 &&
      targetTopology.controlDistribution.bottom >= 2);
    if (target.direction.schemaVersion === 2 && visiblyStacked) {
      expect(target.direction.architecture?.spatialLayout,
        'Rendered screen has a header, centered canvas and bottom controls. Do not disguise a repeated layout with different prose.')
        .toBe('header-stage-footer');
    }
    await performAndCapture(page, info, target.direction.evidence.interaction);
    await page.waitForTimeout(420);
    await capture(page, info, '03-settled-state');
    expect(errors, `Browser errors during ${target.slug} visual proof`).toEqual([]);
    const neighbors = (target.direction.architecture?.comparisons || [])
      .map(item => item.slug).filter(slug => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)).slice(0, 2);
    const neighborTopologies = [];
    for (const slug of neighbors) {
      await page.goto('/apps/' + slug + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(350);
      await capture(page, info, '04-neighbor-' + slug);
      neighborTopologies.push({ slug, topology: await measureTopology(page) });
    }
    await info.attach('rendered-layout-comparison', {
      body: Buffer.from(JSON.stringify({ app: target.slug, target: targetTopology, neighbors: neighborTopologies,
        note: 'Compare first-frame screenshots with both neighbors. Layout measures are diagnostic, not aesthetic scores.' }, null, 2)),
      contentType: 'application/json'
    });
    await info.attach('visual-direction-intent', {
      body: Buffer.from(JSON.stringify({
        app: target.slug,
        expected: target.direction.evidence.expectedChange,
        captured: ['01-first-frame','02-action','03-settled-state'],
        note: 'Reviewer must inspect screenshots AND recorded interaction video. Pixel differences alone cannot judge craft.'
      }, null, 2)),
      contentType: 'application/json'
    });
  });
}

if (!targets.length) test('no visual direction targets in this change', () => { test.skip(); });
