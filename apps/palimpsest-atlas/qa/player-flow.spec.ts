import {test,expect} from '@playwright/test';

test('Rome: timeline, provenance, zoom, restart and second story', async ({page}, info) => {
  const errors:string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/apps/palimpsest-atlas/', {waitUntil:'domcontentloaded'});
  await expect(page.locator('#library')).toBeVisible();
  await page.locator('[data-story="rome"]').click();
  await expect(page.locator('#viewer')).toBeVisible();
  await expect(page.locator('#date-value')).toHaveText('1000');
  await page.locator('#next').click();
  await expect(page.locator('#date-value')).toHaveText('900');
  await page.locator('#inspect-event').click();
  await expect(page.locator('#inspector')).toBeVisible();
  await expect(page.locator('#inspector-name')).toContainText('Палатине');
  const source = page.locator('#sources a').first();
  await expect(source).toBeVisible();
  await expect(source).toHaveAttribute('href',/^https:\/\//);
  await page.locator('#tab-general').click();
  await expect(page.locator('#tab-general')).toHaveAttribute('aria-pressed','true');
  await page.locator('#inspector-close').click();
  const firstZoom = await page.locator('#time-canvas').evaluate((c:HTMLCanvasElement)=>c.width);
  await page.locator('#time-plus').click();
  expect(await page.locator('#time-canvas').evaluate((c:HTMLCanvasElement)=>c.width)).toEqual(firstZoom);
  await expect(page.locator('#time-left')).not.toHaveText('1000 до н. э.');
  await page.screenshot({path:info.outputPath('rome-expanded-timeline.png')});
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#viewer')).toBeVisible();
  await expect(page.locator('#date-value')).toHaveText('900');
  await page.locator('#back').click();
  await expect(page.locator('#library')).toBeVisible();
  await page.locator('[data-story="war"]').click();
  await expect(page.locator('#story-title')).toHaveText('Тридцатилетняя война');
  await page.locator('#next').click();
  await expect(page.locator('#date-value')).toHaveText('1620');
  await page.locator('#list-toggle').click();
  await expect(page.locator('#outline')).toBeVisible();
  await expect(page.locator('.outline-item')).toHaveCount(10);
  await page.screenshot({path:info.outputPath('thirty-years-war.png')});
  expect(errors).toEqual([]);
});

test('Pan/zoom scene and pointer gestures preserve selectable history', async ({page}) => {
  await page.goto('/apps/palimpsest-atlas/', {waitUntil:'domcontentloaded'});
  await page.locator('[data-story="rome"]').click();
  await page.locator('#map-plus').click();
  await page.locator('#map-minus').click();
  await page.locator('#map-home').click();
  await page.locator('#time-plus').click();
  await page.locator('#time-minus').click();
  await page.locator('#next').click();
  await page.locator('#prev').click();
  await expect(page.locator('#date-value')).toHaveText('1000');
  await expect(page.locator('#scene')).toBeVisible();
  const canvas = await page.locator('#scene').evaluate((element:HTMLCanvasElement)=>({
    width:element.width, height:element.height,
    sample:element.getContext('2d')?.getImageData(Math.floor(element.width/2),Math.floor(element.height/2),1,1).data[3]
  }));
  expect(canvas.width).toBeGreaterThan(10);
  expect(canvas.height).toBeGreaterThan(10);
  expect(canvas.sample).toBeGreaterThan(0);
});
