import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { attachCriticalScreenshot } from './helpers';

type AppTarget = {
  slug: string;
  status?: string;
  orientation?: 'any' | 'portrait' | 'landscape';
  releaseDateTime?: string;
};

function loadTargets(): AppTarget[] {
  const appsRoot = path.join(process.cwd(), 'apps');
  const entries = readdirSync(appsRoot, { withFileTypes: true });
  const configs: AppTarget[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const configPath = path.join(appsRoot, entry.name, 'app.config.json');
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8')) as AppTarget;
      if (config?.slug) configs.push(config);
    } catch {
      // Validation jobs own malformed config failures; this explorer only needs valid targets.
    }
  }

  const explicitTargets = (process.env.PW_APP_TARGETS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (explicitTargets.length > 0) {
    const wanted = new Set(explicitTargets);
    return configs.filter((config) => wanted.has(config.slug));
  }

  const maxApps = Math.max(1, Number(process.env.PW_AI_MAX_APPS || 6));
  return configs
    .filter((config) => config.status !== 'archived')
    .sort((left, right) => {
      const leftTime = Date.parse(left.releaseDateTime || '') || 0;
      const rightTime = Date.parse(right.releaseDateTime || '') || 0;
      return rightTime - leftTime || left.slug.localeCompare(right.slug);
    })
    .slice(0, maxApps);
}

function orientationMatchesProject(app: AppTarget, projectName: string) {
  if (!app.orientation || app.orientation === 'any') return true;
  if (app.orientation === 'landscape') return projectName.includes('landscape');
  if (app.orientation === 'portrait') return projectName.includes('portrait');
  return true;
}

async function dispatchTouchSwipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.evaluate(async ({ from, to }) => {
    const steps = 10;
    const target = document.elementFromPoint(from.x, from.y) || document.body;
    const fire = (type: string, x: number, y: number, buttons: number) => {
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 41,
        pointerType: 'touch',
        isPrimary: true,
        clientX: x,
        clientY: y,
        buttons
      }));
    };

    fire('pointerdown', from.x, from.y, 1);
    for (let index = 1; index <= steps; index += 1) {
      const progress = index / steps;
      const x = from.x + (to.x - from.x) * progress;
      const y = from.y + (to.y - from.y) * progress;
      fire('pointermove', x, y, 1);
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    fire('pointerup', to.x, to.y, 0);
  }, { from, to });
}

async function clickLikelyStartControl(page: Page) {
  const label = /start|play|begin|enter|continue|resume|launch|new game|начать|играть|старт|продолжить|почати|грати|увійти/i;
  const candidates = page.getByRole('button', { name: label });
  const count = await candidates.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible().catch(() => false) && await candidate.isEnabled().catch(() => false)) {
      await candidate.click({ timeout: 2_500 }).catch(() => {});
      return;
    }
  }
}

async function attachDiagnostics(page: Page, testInfo: TestInfo, data: unknown) {
  await testInfo.attach('exploration-diagnostics', {
    body: Buffer.from(`${JSON.stringify(data, null, 2)}\n`, 'utf8'),
    contentType: 'application/json'
  });
}

const targets = loadTargets();

test.describe('AI exploratory mobile gameplay', () => {
  test.skip(targets.length === 0, 'No Pocket Works app targets were available for exploratory QA.');

  for (const app of targets) {
    test(`${app.slug} survives a touch exploration pass`, async ({ page }, testInfo) => {
      test.skip(!orientationMatchesProject(app, testInfo.project.name), `App prefers ${app.orientation} orientation.`);

      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const failedRequests: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('requestfailed', (request) => {
        const failure = request.failure();
        failedRequests.push(`${request.method()} ${request.url()} :: ${failure?.errorText || 'unknown failure'}`);
      });

      const response = await page.goto(`/apps/${app.slug}/`, { waitUntil: 'domcontentloaded' });
      expect(response, `No navigation response for ${app.slug}`).not.toBeNull();
      expect(response?.status(), `Unexpected HTTP status for ${app.slug}`).toBeLessThan(400);
      await expect(page.locator('body')).toBeVisible();
      await page.waitForTimeout(350);

      await attachCriticalScreenshot(page, testInfo, 'before-touch', { fullPage: false });
      await clickLikelyStartControl(page);

      const viewport = page.viewportSize();
      expect(viewport).not.toBeNull();
      const width = viewport!.width;
      const height = viewport!.height;

      const tapPoints = [
        { x: Math.round(width * 0.50), y: Math.round(height * 0.50) },
        { x: Math.round(width * 0.20), y: Math.round(height * 0.76) },
        { x: Math.round(width * 0.80), y: Math.round(height * 0.76) },
        { x: Math.round(width * 0.72), y: Math.round(height * 0.42) }
      ];

      for (const point of tapPoints) {
        await page.touchscreen.tap(point.x, point.y).catch(() => {});
        await page.waitForTimeout(90);
      }

      await dispatchTouchSwipe(
        page,
        { x: Math.round(width * 0.20), y: Math.round(height * 0.76) },
        { x: Math.round(width * 0.30), y: Math.round(height * 0.58) }
      ).catch(() => {});
      await page.waitForTimeout(120);
      await dispatchTouchSwipe(
        page,
        { x: Math.round(width * 0.78), y: Math.round(height * 0.56) },
        { x: Math.round(width * 0.62), y: Math.round(height * 0.48) }
      ).catch(() => {});
      await page.waitForTimeout(500);

      const state = await page.evaluate(() => {
        const visibleElements = [...document.querySelectorAll('button, [role="button"], input, select, textarea')]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          })
          .slice(0, 30)
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              tag: element.tagName.toLowerCase(),
              text: (element.textContent || '').trim().slice(0, 120),
              ariaLabel: element.getAttribute('aria-label'),
              rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            };
          });

        const canvases = [...document.querySelectorAll('canvas')].map((canvas) => {
          const rect = canvas.getBoundingClientRect();
          return {
            width: canvas.width,
            height: canvas.height,
            clientWidth: rect.width,
            clientHeight: rect.height,
            x: rect.x,
            y: rect.y
          };
        });

        const bridgeCandidates = [
          (window as any).__POCKET_WORKS_TEST_STATE__,
          (window as any).__PW_TEST_STATE__,
          (window as any).__AI_TEST_STATE__
        ];
        const bridgeState = bridgeCandidates.find((candidate) => candidate != null) ?? null;

        return {
          title: document.title,
          url: location.href,
          viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
          document: {
            scrollWidth: document.documentElement.scrollWidth,
            scrollHeight: document.documentElement.scrollHeight
          },
          canvases,
          visibleControls: visibleElements,
          bridgeState: typeof bridgeState === 'function' ? '[function]' : bridgeState
        };
      });

      await attachCriticalScreenshot(page, testInfo, 'after-touch', { fullPage: false });
      await attachDiagnostics(page, testInfo, {
        app,
        project: testInfo.project.name,
        state,
        consoleErrors,
        pageErrors,
        failedRequests
      });

      expect(pageErrors, `Page crashed during touch exploration of ${app.slug}`).toEqual([]);
      expect(state.document.scrollWidth - state.viewport.width, `${app.slug} horizontally overflows the emulated phone viewport`).toBeLessThanOrEqual(4);
    });
  }
});
