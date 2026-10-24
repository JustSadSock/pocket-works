import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const preview=(id:string)=>'/apps/chyepukha/index.html?chyepukha-preview='+id;
test('completed issue can be downloaded independently from local archive storage',async({page})=>{
 await page.goto(preview('results-v9'));
 const save=page.locator('[data-act="download-issue"]');
 await expect(save).toBeVisible();
 const downloadPromise=page.waitForEvent('download');
 await save.click();
 const file=await downloadPromise;
 expect(file.suggestedFilename()).toMatch(/^chepukha-issue-[a-zA-Z0-9-]+\.json$/);
 const contents=JSON.parse(await readFile(await file.path(),'utf8'));
 expect(contents.format).toBe('pocketworks-chyepukha-archive');
 expect(contents.version).toBe(1);
 expect(contents.editions).toHaveLength(1);
 expect(contents.editions[0].stories).toHaveLength(4);
 expect(contents.editions[0].stories[0].fragments).toHaveLength(3);
 expect(contents.editions[0].stories[0].fragments[0].answer).toContain('Архіваріус вирішив');
 await expect(page.locator('.page-progress')).toContainText('АРКУШ 01 / 03');
});
test('saved issue backup remains downloadable from legacy finished screens',async({page})=>{
 await page.goto(preview('results'));
 const promise=page.waitForEvent('download');
 await page.locator('[data-act="download-issue"]').click();
 const file=await promise;
 const data=JSON.parse(await readFile(await file.path(),'utf8'));
 expect(data.editions).toHaveLength(1);
 expect(data.editions[0].stories).toHaveLength(4);
 await expect(page.locator('[data-act="reader-pages"]')).toHaveCount(0);
});
for(const [screen,width,height] of [['phone',390,844],['small',320,568],['landscape',844,390]] as const){
 test('issue download action stays usable on '+screen,async({page})=>{
  await page.setViewportSize({width,height});
  await page.goto(preview('results-v9'));
  const control=page.locator('[data-act="download-issue"]');
  await expect(control).toBeVisible();
  const dimensions=await control.boundingBox();
  expect(dimensions).not.toBeNull();
  expect(dimensions!.width).toBeGreaterThan(90);
  expect(dimensions!.height).toBeGreaterThanOrEqual(38);
  await control.scrollIntoViewIfNeeded();
  const downloadable=page.waitForEvent('download');
  await control.click();
  const file=await downloadable;
  expect(file.suggestedFilename()).toMatch(/chepukha-issue-.*\.json/);
 });
}
