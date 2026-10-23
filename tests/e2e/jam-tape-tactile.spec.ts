import { expect, test } from '@playwright/test';

test.describe('ЛЕНТА 2.1 · tactile studio', () => {
 test('solo studio keeps pads immediately accessible and editor functional', async ({page}, info) => {
  test.skip(!info.project.name.includes('portrait'), 'Portrait focus-first layout check.');
  const pageErrors: string[]=[];
  page.on('pageerror',e=>pageErrors.push(e.message));
  const response=await page.goto('/apps/jam-tape/',{waitUntil:'load'});
  expect(response?.status()).toBeLessThan(400);
  await expect(page.locator('[data-action="solo"]')).toBeVisible();
  await page.locator('[data-action="solo"]').click();
  await expect(page.locator('.studio-workspace')).toBeVisible();
  await expect(page.locator('.cassette-deck')).toBeVisible();
  await expect(page.locator('.cassette-reel')).toHaveCount(2);
  await expect(page.locator('.pad')).toHaveCount(8);
  await expect(page.locator('.studio .instrument')).toHaveCount(5);
  await expect(page.locator('.studio .track')).toHaveCount(1);

  const dimensions=await page.evaluate(()=>{
   const el=document.querySelector('.pad:last-child');
   const box=el?.getBoundingClientRect();
   return {pageWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,
    padBottom:box?.bottom??Infinity,viewportHeight:innerHeight};
  });
  expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewportWidth+2);
  expect(dimensions.padBottom).toBeLessThan(dimensions.viewportHeight+24);

  await page.locator('.studio .instrument[data-inst="drums"]').click();
  await expect(page.locator('.studio .instrument[data-inst="drums"]')).toHaveClass(/active/);
  await page.locator('[data-action="record"]').click();
  await expect(page.locator('.studio.is-recording')).toBeVisible();
  await page.locator('[data-action="record"]').click();
  await expect(page.locator('.studio.is-recording')).toHaveCount(0);
  await page.locator('[data-action="new-pattern"]').click();
  await expect(page.locator('#clipDialog')).toBeVisible();
  await expect(page.locator('.pattern-step')).toHaveCount(64);
  await page.locator('.pattern-step').first().click();
  await expect(page.locator('.pattern-step.selected')).toHaveCount(1);
  await page.locator('#saveClip').click();
  await expect(page.locator('#clipDialog')).toBeHidden();
  await expect(page.locator('.track-list .clip')).toHaveCount(1);
  await expect(page.locator('.studio .track-count')).toContainText('1 / 6');
  expect(pageErrors).toEqual([]);
 });
});
