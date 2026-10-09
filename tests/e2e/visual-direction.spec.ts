import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { attachCriticalScreenshot } from './helpers';

type VisualEvidence = {
  schemaVersion: number;
  status: string;
  product: string;
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
    await page.touchscreen.tap(...Object.values(relativePoint(page, action.from!)) as [number,number]);
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
    await performAndCapture(page, info, target.direction.evidence.interaction);
    await page.waitForTimeout(420);
    await capture(page, info, '03-settled-state');
    await info.attach('visual-direction-intent', {
      body: Buffer.from(JSON.stringify({
        app: target.slug,
        expected: target.direction.evidence.expectedChange,
        captured: ['01-first-frame','02-action','03-settled-state'],
        note: 'Reviewer must inspect screenshots AND recorded interaction video. Pixel differences alone cannot judge craft.'
      }, null, 2)),
      contentType: 'application/json'
    });
    expect(errors, `Browser errors during ${target.slug} visual proof`).toEqual([]);
  });
}

if (!targets.length) test('no visual direction targets in this change', () => { test.skip(); });
