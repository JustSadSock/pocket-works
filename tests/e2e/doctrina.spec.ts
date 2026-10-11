import { expect, test } from '@playwright/test';
import {
  assertNoHorizontalOverflow,
  attachCriticalScreenshot,
  monitorUnexpectedBrowserOutput,
  openStablePage
} from './helpers';

const saveKey = 'pocket-works:doctrina:atlas:v2';

async function readSave(page: import('@playwright/test').Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), saveKey);
}

test('DOCTRINA II applies a law and regional edict, advances a season and preserves its campaign', async ({ page }, testInfo) => {
  const monitor = monitorUnexpectedBrowserOutput(page);
  await openStablePage(page, '/apps/doctrina/', '.doctrina-shell');
  await expect(page.locator('.back')).toHaveAttribute('href', '../../');
  await expect(page.locator('.tab-bar button')).toHaveCount(4);
  await expect(page.locator('[data-start]')).toHaveCount(3);
  await page.locator('[data-start="crown"]').click();
  await expect(page.locator('.dialog.start')).toBeHidden();
  const initial = await readSave(page);
  expect(initial.turn).toBe(1);
  expect(initial.ap).toBe(2);

  await page.locator('[data-law="charter"]').click();
  const reformed = await readSave(page);
  expect(reformed.laws).toContain('charter');
  expect(reformed.ap).toBe(1);
  await page.locator('[data-region="capital"]').click();
  await expect(page.locator('[data-tab="province"]')).toHaveClass(/on/);
  await page.locator('[data-edict="levy"]').click();
  const taxed = await readSave(page);
  expect(taxed.ap).toBe(0);
  expect(taxed.treasury).toBe(reformed.treasury + 18);

  await page.locator('[data-next]').click();
  await expect.poll(async () => (await readSave(page))?.turn).toBe(2);
  const petition = page.locator('[data-petition]').first();
  if (await petition.isVisible()) await petition.click();
  const settled = await readSave(page);
  expect(settled.ap).toBe(2);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.doctrina-shell')).toBeVisible();
  expect(await readSave(page)).toEqual(settled);
  await expect(page.locator('.dialog.start')).toBeHidden();
  await page.locator('[data-settings]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const soundBefore = settled.flags.sound;
  await page.locator('[data-sound]').click();
  expect((await readSave(page)).flags.sound).toBe(!soundBefore);
  await page.getByRole('button', { name: 'Workshop Mode', exact: true }).click();
  await expect(page.locator('.workshop-mode')).toHaveClass(/is-open/);
  await page.locator('.workshop-mode__close').click();
  await expect(page.locator('.workshop-mode')).not.toHaveClass(/is-open/);
  await page.locator('[data-help]').click();
  await expect(page.getByRole('dialog')).toContainText('Две печати на сезон');
  await page.locator('[data-close]').click();
  await assertNoHorizontalOverflow(page);
  await attachCriticalScreenshot(page, testInfo, 'doctrina-atlas-season', { fullPage: false });
  monitor.assertClean();
});

test('ГЕРБОВНИК Workshop resets its live campaign without touching neighboring storage', async ({ page }, testInfo) => {
  const monitor = monitorUnexpectedBrowserOutput(page);
  await openStablePage(page, '/apps/gerbovnik/', '#claimantA');
  await page.evaluate(() => localStorage.setItem('pocket-works:folio:qa-marker', 'keep'));
  await page.locator('#claimantA').click();
  await page.locator('[data-tab="history"]').click();
  await page.getByRole('button', { name: 'Workshop Mode', exact: true }).click();
  await expect(page.locator('.workshop-mode')).toHaveClass(/is-open/);
  const reset = page.locator('[data-workshop-reset]');
  await reset.click();
  await expect(reset).toHaveText('Tap again to reset');
  await reset.click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pocket-works:gerbovnik:campaign:v1') || 'null')?.chosen)).toBe(-1);
  expect(await page.evaluate(() => localStorage.getItem('pocket-works:folio:qa-marker'))).toBe('keep');
  await page.locator('.workshop-mode__close').click();
  await expect(page.locator('#caseView')).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await attachCriticalScreenshot(page, testInfo, 'gerbovnik-after-workshop-reset', { fullPage: false });
  monitor.assertClean();
});
