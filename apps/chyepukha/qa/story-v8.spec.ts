import {test,expect} from '@playwright/test';

const preview=screen=>'/apps/chyepukha/index.html?chyepukha-preview='+screen;
for(const [device,width,height] of [['phone',390,844],['desktop',1366,768],['landscape',844,390]] as const){
 test('v8 blind-safe stage and handoff on '+device,async({page})=>{
  await page.setViewportSize({width,height});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(preview('writing-v8'));
  await expect(page.locator('.editor-question .question')).toContainText('Яка нова невдача');
  await expect(page.locator('.incoming-compact')).toContainText('голуби музей дощ');
  await page.locator('.editorial-brief summary').click();
  await expect(page.locator('.editorial-brief-content')).toContainText('навіть без попередніх подробиць');
  await expect(page.locator('.editorial-brief-content')).not.toContainText('ТОН ЖАНРУ');
  await page.locator('#answer').fill('Архіваріус продав музей голубам за один золотий квиток');
  await page.locator('#answerForm button[type=submit]').click();
  await expect(page.locator('.writer-selection')).toBeVisible();
  await expect(page.locator('.next-question')).toContainText('Як герой спробував');
  for(const index of [0,2,4])await page.locator('.selection-paper .word').nth(index).click();
  await expect(page.locator('#wordCount')).toHaveText('3 / 3');
  await page.locator('#answerForm button[type=submit]').click();
  await expect(page.locator('.dispatch-room')).toBeVisible();
  expect(errors).toEqual([]);
 });
}
test('v8 final has zero handoff and stays readable',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(preview('writing-v8-final'));
 await expect(page.locator('.editor-question .question')).toContainText('остаточний результат');
 await expect(page.locator('#wordTray')).toHaveCount(0);
 await expect(page.locator('.final-stage-note')).toBeVisible();
 await page.locator('#answerForm button[type=submit]').click();
 await expect(page.locator('.dispatch-room')).toBeVisible();
});
