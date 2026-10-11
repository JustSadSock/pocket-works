import { expect, test } from '@playwright/test';

test.describe('ЗАМАЗКА · музей и личная эмблема', () => {
  test('wheel gallery, editable seal, persistence and room entry', async ({ page }, info) => {
    test.skip(!info.project.name.includes('portrait'), 'Portrait application entrance check.');

    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));

    const response = await page.goto('/apps/zamazka/', { waitUntil: 'load' });
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator('.museum-home')).toBeVisible();

    const painting = page.locator('.museum-slide[data-slot="0"] img');
    const initial = await painting.getAttribute('src');
    await expect(page.locator('.museum-slide')).toHaveCount(5);
    await page.locator('.museum-display').dispatchEvent('wheel', { deltaY: 140 });
    const oldFrame = page.locator('.museum-slide[data-slot="-1"] img');
    // The same DOM frame physically moves left; it must keep its image during motion.
    await expect(oldFrame).toHaveAttribute('src', initial!);
    await expect.poll(() => page.locator('.museum-slide[data-slot="0"] img').getAttribute('src')).not.toBe(initial);
    await expect(page.locator('.museum-slide[data-slot="0"]')).toHaveCount(1);
    await page.waitForTimeout(700);
    await expect(page.locator('.museum-slide')).toHaveCount(5);
    await expect(page.locator('#museumCaption strong')).not.toBeEmpty();

    await page.locator('#profileBtn').click();
    const canvas = page.locator('#emblemCanvas');
    await expect(canvas).toBeVisible();
    const bounds = await canvas.boundingBox();
    expect(bounds).toBeTruthy();
    await page.mouse.move(bounds!.x + bounds!.width * .22, bounds!.y + bounds!.height * .26);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width * .66, bounds!.y + bounds!.height * .75, { steps: 9 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.locator('#profileBtn img')).toBeVisible();

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pocket-works:zamazka:emblem-v1') || 'null'));
    expect(stored?.strokes?.length).toBe(1);
    expect(stored?.image).toMatch(/^data:image\/(?:webp|png);base64,/);

    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('#profileBtn img')).toBeVisible();
    await page.locator('[data-action="join"]').click();
    await expect(page.locator('.lobby-entry')).toBeVisible();
    await expect(page.locator('.entry-identity img')).toBeVisible();
    await expect(page.locator('#room')).toBeVisible();
    await page.locator('#room').fill('1A2B3C4D');
    await expect(page.locator('#room')).toHaveValue('1A2B3C4D');

    expect(errors).toEqual([]);
  });
});
