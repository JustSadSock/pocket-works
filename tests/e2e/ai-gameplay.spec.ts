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

type RelicState = {
  version?: string;
  phase?: string;
  zone?: string;
  playerPosition?: { x?: number; y?: number; z?: number };
  grounded?: boolean;
  groundDistance?: number;
  hp?: number;
  relicCharge?: number;
  activeEnemies?: number;
  groundedEnemies?: number;
  blenderWorldLoaded?: boolean;
  worldCollisionCount?: number;
  keeperLoaded?: boolean;
  raiderLoaded?: boolean;
  wardenLoaded?: boolean;
  criticalAssetsReady?: boolean;
  assetErrors?: string[];
  loadingState?: string;
};

type RelicDriveSample = {
  elapsedMs: number;
  phase?: string;
  zone?: string;
  playerPosition?: { x?: number; y?: number; z?: number };
  grounded?: boolean;
  groundDistance?: number;
  activeEnemies?: number;
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

async function dragPointer(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

async function holdVirtualStick(page: Page, dx: number, dy: number, holdMs: number) {
  const stick = page.locator('#joystick');
  await expect(stick).toBeVisible();
  const box = await stick.boundingBox();
  expect(box, 'Virtual joystick had no measurable bounds').not.toBeNull();
  const center = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  const max = box!.width * 0.3;
  const length = Math.hypot(dx, dy) || 1;
  const scale = max / Math.max(1, length);
  const target = { x: center.x + dx * scale, y: center.y + dy * scale };

  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.waitForTimeout(holdMs);
  await page.mouse.up();
  await page.waitForTimeout(120);
}

async function readRelicState(page: Page) {
  return page.evaluate(() => ((window as any).__AI_TEST_STATE__ ?? null) as RelicState | null);
}

async function driveRelicStickUntil(
  page: Page,
  dx: number,
  dy: number,
  timeoutMs: number,
  label: string,
  done: (state: RelicState | null) => boolean
) {
  const stick = page.locator('#joystick');
  await expect(stick).toBeVisible();
  const box = await stick.boundingBox();
  expect(box, 'Virtual joystick had no measurable bounds').not.toBeNull();

  const center = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  const max = box!.width * 0.3;
  const length = Math.hypot(dx, dy) || 1;
  const scale = max / Math.max(1, length);
  const target = { x: center.x + dx * scale, y: center.y + dy * scale };
  const startedAt = Date.now();
  const samples: RelicDriveSample[] = [];
  let lastState: RelicState | null = await readRelicState(page);

  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });

  try {
    while (Date.now() - startedAt < timeoutMs) {
      await page.waitForTimeout(300);
      lastState = await readRelicState(page);
      samples.push({
        elapsedMs: Date.now() - startedAt,
        phase: lastState?.phase,
        zone: lastState?.zone,
        playerPosition: lastState?.playerPosition,
        grounded: lastState?.grounded,
        groundDistance: lastState?.groundDistance,
        activeEnemies: lastState?.activeEnemies
      });
      if (done(lastState)) {
        return { state: lastState, samples };
      }
    }

    throw new Error(
      `${label} did not reach its physical target within ${timeoutMs}ms. ` +
      `Last state: ${JSON.stringify(lastState)}. ` +
      `Drive samples: ${JSON.stringify(samples.slice(-12))}`
    );
  } finally {
    await page.mouse.up().catch(() => {});
    await page.waitForTimeout(120);
  }
}

async function driveRelicDistance(
  page: Page,
  dx: number,
  dy: number,
  distance: number,
  timeoutMs: number,
  label: string
) {
  const start = await readRelicState(page);
  const startX = start?.playerPosition?.x;
  const startZ = start?.playerPosition?.z;
  expect(Number.isFinite(startX) && Number.isFinite(startZ), `${label} had no finite starting position`).toBe(true);

  return driveRelicStickUntil(page, dx, dy, timeoutMs, label, (state) => {
    const x = state?.playerPosition?.x;
    const z = state?.playerPosition?.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    return Math.hypot(x! - startX!, z! - startZ!) >= distance;
  });
}

async function runRelicSiegeJourney(page: Page, testInfo: TestInfo) {
  await page.waitForFunction(() => {
    const state = (window as any).__AI_TEST_STATE__ as RelicState | undefined;
    return state?.loadingState === 'awaiting-start';
  }, undefined, { timeout: 25_000 });

  const loaded = await readRelicState(page);
  expect(loaded, 'RELIC SIEGE did not publish its QA bridge').not.toBeNull();
  expect(loaded?.version).toBe('2.0.0');
  expect(loaded?.criticalAssetsReady, `Authored asset load failed: ${JSON.stringify(loaded?.assetErrors || [])}`).toBe(true);
  expect(loaded?.blenderWorldLoaded).toBe(true);
  expect(loaded?.worldCollisionCount ?? 0).toBeGreaterThanOrEqual(7);
  expect(loaded?.keeperLoaded).toBe(true);
  expect(loaded?.raiderLoaded).toBe(true);
  expect(loaded?.wardenLoaded).toBe(true);
  expect(loaded?.assetErrors ?? []).toEqual([]);

  const start = page.locator('#startButton');
  await expect(start).toBeVisible();
  await expect(start).toBeEnabled();
  await start.click();

  await page.waitForFunction(() => {
    const state = (window as any).__AI_TEST_STATE__ as RelicState | undefined;
    return state?.loadingState === 'ready' && state?.phase === 'gate';
  }, undefined, { timeout: 8_000 });

  // The start handler publishes the phase before the first physics frame. Wait for an
  // actual collision/ground frame instead of reading the pre-physics `grounded=false`.
  await page.waitForFunction(() => {
    const state = (window as any).__AI_TEST_STATE__ as RelicState | undefined;
    return state?.phase === 'gate' && state?.grounded === true && (state?.groundDistance ?? 99) < 1.7;
  }, undefined, { timeout: 4_000 });

  const gate = await readRelicState(page);
  expect(gate?.zone).toBe('gate');
  expect(gate?.grounded).toBe(true);
  expect(gate?.playerPosition?.y ?? -999).toBeGreaterThan(-1);

  // CI software WebGL can render far below real-time. Keep the real on-screen stick
  // physically held until gameplay itself reports the courtyard encounter and the
  // keeper is stably supported by authored collision, rather than stopping on the
  // transitional frame where the zone flips while the capsule is still settling.
  const courtyardDrive = await driveRelicStickUntil(
    page,
    0,
    1,
    24_000,
    'Gate-to-courtyard traversal',
    (state) => state?.zone === 'courtyard'
      && (state?.activeEnemies ?? 0) >= 3
      && state?.grounded === true
      && (state?.groundDistance ?? 99) < 1.7
  );

  const courtyard = courtyardDrive.state;
  expect(courtyard?.phase).toBe('courtyard');
  expect(courtyard?.grounded).toBe(true);
  expect(courtyard?.groundDistance ?? 99).toBeLessThan(1.7);
  expect(courtyard?.activeEnemies ?? 0).toBeGreaterThanOrEqual(3);
  expect(courtyard?.groundedEnemies).toBe(courtyard?.activeEnemies);

  // Approach the first encounter through physical displacement rather than wall-clock
  // time so low-FPS Chromium/WebKit runners perform the same journey as a real phone.
  const approachDrive = await driveRelicDistance(page, 0, 1, 5.5, 14_000, 'Courtyard enemy approach');
  const strafeDrive = await driveRelicDistance(page, 1, 0, 3.0, 12_000, 'Courtyard combat strafe');

  const chargeBefore = (await readRelicState(page))?.relicCharge ?? 0;
  const enemiesBefore = (await readRelicState(page))?.activeEnemies ?? 0;
  const attack = page.locator('#attackButton');
  await expect(attack).toBeVisible();
  for (let index = 0; index < 9; index += 1) {
    await attack.click();
    await page.waitForTimeout(340);
  }
  await page.waitForTimeout(250);

  const combat = await readRelicState(page);
  expect(combat?.grounded).toBe(true);
  expect(combat?.playerPosition?.y ?? -999).toBeGreaterThan(0);
  expect(combat?.hp ?? 0).toBeGreaterThan(0);
  expect(
    (combat?.relicCharge ?? 0) > chargeBefore || (combat?.activeEnemies ?? enemiesBefore) < enemiesBefore,
    `Combat input did not connect with an enemy: ${JSON.stringify(combat)}`
  ).toBe(true);

  await attachCriticalScreenshot(page, testInfo, 'relic-courtyard-combat', { fullPage: false });
  await testInfo.attach('relic-siege-journey-state', {
    body: Buffer.from(`${JSON.stringify({ loaded, gate, courtyard, combat, courtyardDrive, approachDrive, strafeDrive }, null, 2)}\n`, 'utf8'),
    contentType: 'application/json'
  });
}

async function clickLikelyStartControl(page: Page) {
  const label = /start|play|begin|enter|continue|resume|launch|new game|начать|играть|старт|продолжить|войти|почати|грати|увійти/i;
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
      test.setTimeout(app.slug === 'relic-siege' ? 110_000 : 35_000);

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

      if (app.slug === 'relic-siege') {
        await runRelicSiegeJourney(page, testInfo);
      } else {
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

        // Playwright has a browser-native touch tap API but no portable cross-engine swipe API.
        // Use real browser pointer input for drags instead of constructing synthetic PointerEvents;
        // synthetic pointer ids cannot legally participate in setPointerCapture() and create false failures.
        await dragPointer(
          page,
          { x: Math.round(width * 0.20), y: Math.round(height * 0.76) },
          { x: Math.round(width * 0.30), y: Math.round(height * 0.58) }
        ).catch(() => {});
        await page.waitForTimeout(120);
        await dragPointer(
          page,
          { x: Math.round(width * 0.78), y: Math.round(height * 0.56) },
          { x: Math.round(width * 0.62), y: Math.round(height * 0.48) }
        ).catch(() => {});
        await page.waitForTimeout(500);
      }

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

      expect(pageErrors, `Unhandled page errors during exploration of ${app.slug}`).toEqual([]);
      expect(state.document.scrollWidth - state.viewport.width, `${app.slug} horizontally overflows the emulated phone viewport`).toBeLessThanOrEqual(4);
    });
  }
});
