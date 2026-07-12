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
  await expect(page.locator('#dpr')).toHaveText(/\d+\.\d{2}/);
  await expect(page.locator('#fps')).toHaveText(/\d+/);

  const freeze = page.locator('[data-action="freeze"]');
  await freeze.tap();
  await expect(freeze).toHaveText('Resume');
  await expect(page.locator('#visibility')).toHaveText('frozen');
  await freeze.tap();
  await expect(freeze).toHaveText('Freeze');

  await page.locator('[data-action="pulse"]').tap();
  await expect(page.locator('body')).toHaveClass(/impulse/);

  await assertNativeControlStyles(freeze);
  await assertNoHorizontalOverflow(page);
  await attachCriticalScreenshot(page, testInfo, 'screen-lab-instrument', {
    mask: [page.locator('#field'), page.locator('#fps'), page.locator('#clock')]
  });
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
