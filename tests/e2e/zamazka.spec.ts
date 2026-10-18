import { expect, test } from '@playwright/test';

test.describe('ЗАМАЗКА · мобильная экспозиция и вход в комнату', () => {
  test('seven preloaded museum frames, Pocket ID dialog and guest invitation', async ({ page }, info) => {
    test.skip(!info.project.name.includes('portrait'), 'Portrait application entrance check.');

    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));

    const response = await page.goto('/apps/zamazka/', { waitUntil: 'load' });
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('.museum-home')).toBeVisible();

    // Two additional hidden decoded images eliminate frame flashes while swiping.
    // All seven DOM frames survive movement; only the far off-screen slot is recycled.
    const slides = page.locator('.museum-slide');
    await expect(slides).toHaveCount(7);
    for (const slot of [-3, -2, -1, 0, 1, 2, 3]) {
      await expect(page.locator(`.museum-slide[data-slot="${slot}"]`)).toHaveCount(1);
    }
    const painting = page.locator('.museum-slide[data-slot="0"] img');
    const initial = await painting.getAttribute('src');
    expect(initial).toBeTruthy();

    await page.locator('.museum-display').dispatchEvent('wheel', { deltaY: 140 });
    const oldFrame = page.locator('.museum-slide[data-slot="-1"] img');
    await expect(oldFrame).toHaveAttribute('src', initial!);
    await expect.poll(() => page.locator('.museum-slide[data-slot="0"] img').getAttribute('src')).not.toBe(initial);
    await page.waitForTimeout(420);
    await expect(slides).toHaveCount(7);
    await expect(page.locator('#museumCaption strong')).not.toBeEmpty();

    // The toolbar now opens Pocket ID, not the retired local emblem editor.
    await page.locator('#profileBtn').click();
    const account = page.locator('.pws-dialog');
    await expect(account).toBeVisible();
    await expect(account.locator('.pws-brand')).toHaveText('POCKET / ID');
    await account.locator('.pws-close').click();
    await expect(account).toBeHidden();

    // A guest can reach the invitation flow without signing up.
    await page.locator('[data-action="join"]').click();
    await expect(page.locator('.lobby-entry')).toBeVisible();
    await expect(page.locator('.entry-profile')).toBeVisible();
    await expect(page.locator('#who')).toBeVisible();
    await expect(page.locator('#room')).toBeVisible();
    await page.locator('#who').fill('Тестовый гость');
    await page.locator('#room').fill('1A2B3C4D');
    await expect(page.locator('#who')).toHaveValue('Тестовый гость');
    await expect(page.locator('#room')).toHaveValue('1A2B3C4D');
    await page.locator('.passage-entry [data-action="menu"]').click();
    await expect(page.locator('.museum-home')).toBeVisible();

    expect(errors).toEqual([]);
  });
});
