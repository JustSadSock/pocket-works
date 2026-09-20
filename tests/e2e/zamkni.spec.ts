import { expect, test } from '@playwright/test';

test.describe('ZAMKNI solo launch', () => {
  test('starts an AI match even when app localStorage writes are rejected', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('portrait'), 'ZAMKNI is a portrait-first game.');

    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.addInitScript(() => {
      const originalSetItem = Storage.prototype.setItem;
      const originalRemoveItem = Storage.prototype.removeItem;

      Storage.prototype.setItem = function setItem(key: string, value: string) {
        if (String(key).startsWith('pocket-works:zamkni')) {
          throw new DOMException('Storage blocked for QA', 'QuotaExceededError');
        }
        return originalSetItem.call(this, key, value);
      };

      Storage.prototype.removeItem = function removeItem(key: string) {
        if (String(key).startsWith('pocket-works:zamkni')) {
          throw new DOMException('Storage blocked for QA', 'QuotaExceededError');
        }
        return originalRemoveItem.call(this, key);
      };
    });

    const response = await page.goto('/apps/zamkni/', { waitUntil: 'load' });
    expect(response?.status()).toBeLessThan(400);

    const aiButton = page.locator('[data-mode="ai"]');
    await expect(aiButton).toBeVisible();
    await aiButton.click();

    await expect(page.locator('#gameScreen')).toBeVisible();
    await expect(page.locator('#homeScreen')).toBeHidden();
    await expect(page.locator('#scoreStrip .score-player')).toHaveCount(2);
    await expect(page.locator('#board .edge-hit')).toHaveCount(60);
    await expect(page.locator('#board .dot')).toHaveCount(36);
    await expect(page.locator('#turnTitle')).toHaveText('Твой ход');

    await page.locator('#board .edge-hit').first().dispatchEvent('click');
    await expect.poll(async () => page.locator('#board .edge-claimed').count(), { timeout: 3_000 }).toBeGreaterThanOrEqual(2);
    await expect(page.locator('#turnTitle')).toHaveText('Твой ход');

    expect(pageErrors).toEqual([]);
  });
});
