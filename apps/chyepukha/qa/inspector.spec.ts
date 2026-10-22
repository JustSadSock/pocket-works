import {test,expect} from '@playwright/test';

test('screen inspector has all stages and actual responsive app views',async({page})=>{
 test.setTimeout(120000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/chyepukha/index.html');
 await expect(page.locator('.home-cover h1')).toContainText('ЧЕПУХА');
 await page.keyboard.press('Backquote');
 const inspector=page.locator('.chy-qa');
 await expect(inspector).toBeVisible();
 await expect(inspector.locator('[data-screen]')).toHaveCount(22);
 await inspector.locator('[data-device=phone]').click();
 await expect(inspector.locator('[data-size]')).toContainText('390 × 844');
 const frame=page.frameLocator('.chy-qa-frame');
 for(const [id,selector] of [
  ['home','.home-cover'],['home-member','.home-identity.is-member'],['invite','#joinForm'],['error','.warning'],['connecting','.waiting'],
  ['lobby-host','.room'],['lobby-guest','.room'],['lobby-ready','.room'],
  ['lobby-custom','#customField:not(.hidden)'],
  ['writing-first','#answerForm'],['writing-tail','.incoming'],
  ['writing-selection','.word.selected'],['writing-zero','#wordCount'],
  ['waiting','.wax'],['offline','#answerForm'],['leave','.comic-modal'],
  ['results','.story-paper'],['results-second','.story-paper'],['comic','.comic-actions'],
  ['archive','.archive-manuscript'],['archive-empty','.archive-empty'],['archive-delete','.comic-modal']
 ]){
  if(await inspector.evaluate(e=>e.classList.contains('collapsed')))await inspector.locator('.chy-qa-expand').click();
  await inspector.locator('[data-screen="'+id+'"]').click();
  await expect(frame.locator(selector).first(),id).toBeVisible();
  if(id==='writing-selection')await expect(frame.locator('.word.selected')).toHaveCount(3);
 }
 if(await inspector.evaluate(e=>e.classList.contains('collapsed')))await inspector.locator('.chy-qa-expand').click();
 await inspector.locator('[data-device=desktop]').click();
 await expect(inspector.locator('[data-size]')).toContainText('1366 × 768');
 await page.keyboard.press('Escape');
 await expect(inspector).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('preview editing and sending a sheet do not mutate the original app',async({page})=>{
 await page.goto('/apps/chyepukha/index.html');
 await page.keyboard.press('Backquote');
 await page.locator('.chy-qa [data-screen=writing-first]').click();
 const frame=page.frameLocator('.chy-qa-frame');
 await frame.locator('#answer').fill('Кумедний архіваріус продав вчорашній дощ у міський музей');
 await frame.locator('.word').nth(0).click();
 await frame.locator('.word').nth(2).click();
 await frame.locator('.word').nth(4).click();
 await frame.locator('#answerForm button[type=submit]').click();
 await expect(frame.locator('.wax')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.locator('.home-cover h1')).toContainText('ЧЕПУХА');
 await expect(page.locator('.chy-qa')).toHaveCount(0);
});
