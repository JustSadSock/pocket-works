import { expect, test } from '@playwright/test';
import {
  assertNativeControlStyles,
  assertNoHorizontalOverflow,
  attachCriticalScreenshot,
  monitorUnexpectedBrowserOutput,
  openStablePage
} from './helpers';

test('Screen Lab exposes live metrics and resilient mobile controls', async ({ page }, testInfo) => {
  const monitor = monitorUnexpectedBrowserOutput(page);
  await openStablePage(page, '/apps/screen-lab/', 'h1');

  await expect(page.locator('h1')).toHaveText('Screen Lab');
  await expect(page.locator('#viewport')).toHaveText(/\d+ × \d+/);
  await expect(page.locator('#visual-viewport')).toHaveText(/\d+ × \d+/);
  await expect(page.locator('#visual-offset')).toHaveText(/\d+, \d+px/);
  await expect(page.locator('#visual-scale')).toHaveText(/\d+\.\d{2}×/);
  await expect(page.locator('#dpr')).toHaveText(/\d+\.\d{2}/);
  await expect(page.locator('#fps')).toHaveText(/\d+/);

  const touchZone = page.locator('#touch-zone');
  await touchZone.tap();
  await expect(page.locator('#pointer-type')).not.toHaveText('idle');
  await expect(page.locator('#pointer-position')).toHaveText(/\d+, \d+/);
  await expect(page.locator('#peak-points')).toHaveText('1');

  const freeze = page.locator('[data-action="freeze"]');
  await freeze.tap();
  await expect(freeze).toHaveText('Resume');
  await expect(freeze).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#visibility')).toHaveText('frozen');
  await freeze.tap();
  await expect(freeze).toHaveText('Freeze');
  await expect(freeze).toHaveAttribute('aria-pressed', 'false');

  await page.locator('[data-action="pulse"]').tap();
  await expect(page.locator('body')).toHaveClass(/impulse/);

  await assertNativeControlStyles(freeze);
  await assertNoHorizontalOverflow(page);
  await attachCriticalScreenshot(page, testInfo, 'screen-lab-instrument', {
    mask: [page.locator('#field'), page.locator('#fps'), page.locator('#clock')]
  });
  monitor.assertClean();
});

test('reset clears frozen and pointer state instead of leaking interaction state', async ({ page }) => {
  const monitor = monitorUnexpectedBrowserOutput(page);
  await openStablePage(page, '/apps/screen-lab/', '[data-action="freeze"]');

  await page.locator('#touch-zone').tap();
  await expect(page.locator('#peak-points')).toHaveText('1');

  const freeze = page.locator('[data-action="freeze"]');
  await freeze.tap();
  await page.locator('[data-action="reset"]').tap();

  await expect(freeze).toHaveText('Freeze');
  await expect(freeze).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('body')).not.toHaveClass(/frozen/);
  await expect(page.locator('#visibility')).not.toHaveText('frozen');
  await expect(page.locator('#pointer-type')).toHaveText('idle');
  await expect(page.locator('#peak-points')).toHaveText('0');
  monitor.assertClean();
});

test('diagnostic snapshot serializes current lab state', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as typeof window & { __screenLabSnapshot?: unknown }).__screenLabSnapshot = JSON.parse(value);
        }
      }
    });
  });

  const monitor = monitorUnexpectedBrowserOutput(page);
  await openStablePage(page, '/apps/screen-lab/', '[data-action="snapshot"]');
  await page.locator('[data-action="snapshot"]').tap();

  await expect(page.locator('#toast')).toHaveText('Diagnostic snapshot copied');
  const snapshot = await page.evaluate(() => (window as typeof window & { __screenLabSnapshot?: any }).__screenLabSnapshot);
  expect(snapshot.version).toBe('1.4.0');
  expect(snapshot.viewport.visual.width).toBeGreaterThan(0);
  expect(snapshot.pointer.type).toBe('idle');
  monitor.assertClean();
});

test('Workshop Mode opens, reports diagnostics and restores focus', async ({ page }, testInfo) => {
  const monitor = monitorUnexpectedBrowserOutput(page);
  await openStablePage(page, '/apps/screen-lab/', '[data-workshop-trigger]');

  const trigger = page.locator('[data-workshop-trigger]');
  await trigger.tap();

  const workshop = page.locator('[data-workshop-mode]');
  await expect(workshop).toHaveClass(/is-open/);
  await expect(workshop).toHaveAttribute('aria-hidden', 'false');
  await expect(workshop.locator('#workshop-title')).toContainText('1.4.0');
  await expect(workshop.locator('[data-workshop-metrics]')).toContainText('Viewport');
  await expect(workshop.locator('[data-workshop-errors]')).toContainText('No captured runtime errors');
  await expect(page.locator('html')).toHaveClass(/is-app-scroll-locked/);

  await attachCriticalScreenshot(page, testInfo, 'screen-lab-workshop', {
    fullPage: false,
    mask: [workshop.locator('.workshop-mode__status')]
  });

  await workshop.locator('[data-workshop-close]').last().click();
  await expect(workshop).toHaveAttribute('aria-hidden', 'true');
  await expect(trigger).toBeFocused();
  await expect(page.locator('html')).not.toHaveClass(/is-app-scroll-locked/);
  monitor.assertClean();
});

test('rapid taps do not queue broken control state', async ({ page }) => {
  const monitor = monitorUnexpectedBrowserOutput(page);
  await openStablePage(page, '/apps/screen-lab/', '[data-action="freeze"]');

  const freeze = page.locator('[data-action="freeze"]');
  for (let index = 0; index < 6; index += 1) await freeze.tap();
  await expect(freeze).toHaveText('Freeze');
  await expect(page.locator('#visibility')).not.toHaveText('frozen');
  monitor.assertClean();
});
