import {test,expect} from '@playwright/test';

test('Story Studio: create 5 events, 2 regions, a route, save, replay, export and import',async({page},info)=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/apps/palimpsest-atlas/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#studio-new')).toBeVisible();
  await page.locator('#studio-new').click();
  await expect(page.locator('#studio')).toBeVisible();
  await expect(page.locator('#studio-map')).toBeVisible();
  await page.locator('#studio-title').fill('Торговые дороги королевства');
  await page.locator('#studio-title').press('Tab');
  await expect(page.locator('#studio-name')).toHaveText('Торговые дороги королевства');
  await page.screenshot({path:info.outputPath('01-studio-blank-map.png')});
  for(let i=1;i<=4;i++){
    await page.locator('#studio-add').click();
    await page.locator('.editor-form [aria-label="Заголовок"]').fill('Событие '+i);
    await page.locator('.editor-form [aria-label="Заголовок"]').press('Tab');
    await page.locator('.editor-form [aria-label="Год (отрицательный = до н. э.)"]').fill(String(1200+i*10));
    await page.locator('.editor-form [aria-label="Год (отрицательный = до н. э.)"]').press('Tab');
  }
  await expect(page.locator('.studio-record')).toHaveCount(5);
  await page.locator('[data-studio-tab="features"]').click();
  for(let i=1;i<=2;i++){
    await page.locator('#studio-add').click();
    await page.locator('.editor-form [aria-label="Название на карте"]').fill('Область '+i);
    await page.locator('.editor-form [aria-label="Название на карте"]').press('Tab');
    await page.locator('#studio-map').click({position:{x:120+i*85,y:60+i*38}});
  }
  await page.locator('[data-studio-tab="paths"]').click();
  await page.locator('#studio-add').click();
  await page.locator('#studio-map').click({position:{x:150,y:100}});
  await expect(page.locator('.studio-field-note')).toContainText('3 точек');
  await page.locator('#studio-undo').click();
  await expect(page.locator('.studio-field-note')).toContainText('2 точек');
  await page.locator('#studio-redo').click();
  await expect(page.locator('.studio-field-note')).toContainText('3 точек');
  await page.screenshot({path:info.outputPath('02-studio-filled-map.png')});
  await page.locator('[data-studio-tab="sources"]').click();
  await page.locator('#studio-add').click();
  await page.locator('.editor-form [aria-label="Название публикации"]').fill('Исследовательский архив');
  await page.locator('.editor-form [aria-label="Название публикации"]').press('Tab');
  await page.locator('.editor-form [aria-label="URL (https://...)"]').fill('https://example.org/research');
  await page.locator('.editor-form [aria-label="URL (https://...)"]').press('Tab');
  await page.locator('#studio-save').click();
  await expect(page.locator('#studio-dirty')).toHaveText('СОХРАНЕНО');
  await page.locator('#studio-preview').click();
  await expect(page.locator('#viewer')).toBeVisible();
  await expect(page.locator('#story-title')).toHaveText('Торговые дороги королевства');
  await page.locator('#list-toggle').click();
  await expect(page.locator('.outline-item')).toHaveCount(5);
  await page.locator('#outline-close').click();
  await page.locator('#compare-toggle').click();
  await expect(page.locator('#comparison-banner')).toBeVisible();
  await page.locator('#next').click();
  await expect(page.locator('#compare-label')).toContainText('→');
  await page.screenshot({path:info.outputPath('03-studio-story-comparison.png')});
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#viewer')).toBeVisible();
  await expect(page.locator('#story-title')).toHaveText('Торговые дороги королевства');
  await page.locator('#edit-story').click();
  await expect(page.locator('#studio')).toBeVisible();
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#studio-export').click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^palimpsest-user-.*\.json$/);
  await page.locator('#studio-back').click();
  await expect(page.locator('#personal-stories .personal-ticket')).toHaveCount(1);
  const exported=await page.evaluate(()=>{
    const lib=JSON.parse(localStorage.getItem('pocket-works:palimpsest-atlas:stories:v1')||'{}');
    return JSON.stringify({format:'palimpsest-atlas/story',schemaVersion:1,story:lib.stories[0]});
  });
  await page.locator('#studio-import').setInputFiles({
    name:'exported-history.json',mimeType:'application/json',buffer:Buffer.from(exported,'utf8')
  });
  await expect(page.locator('#studio')).toBeVisible();
  await expect(page.locator('#studio-name')).toContainText('импорт');
  await page.locator('#studio-back').click();
  await expect(page.locator('#personal-stories .personal-ticket')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('Studio rejects unsupported source provenance and preserves authored history',async({page})=>{
  await page.goto('/apps/palimpsest-atlas/',{waitUntil:'domcontentloaded'});
  await page.locator('#studio-new').click();
  await page.locator('[data-studio-tab="events"]').click();
  await page.locator('.editor-form [aria-label="Достоверность"]').selectOption('confirmed');
  await page.locator('#studio-save').click();
  await expect(page.locator('#studio-status')).toContainText('источник');
  await page.locator('.editor-form [aria-label="Достоверность"]').selectOption('hypothetical');
  await page.locator('#studio-save').click();
  await expect(page.locator('#studio-dirty')).toHaveText('СОХРАНЕНО');
});
