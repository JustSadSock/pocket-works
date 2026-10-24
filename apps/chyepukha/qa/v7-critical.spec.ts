import {test,expect} from '@playwright/test';

const url=(screen:string)=>'/apps/chyepukha/index.html?chyepukha-preview='+screen;

for(const [label,width,height] of [
 ['phone portrait',390,844],
 ['desktop',1366,768],
 ['short landscape',844,390]
] as const){
 test('v7 editor, word handoff and final controls on '+label,async({page})=>{
  await page.setViewportSize({width,height});
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url('writing-v7'));
  await expect(page.locator('#answer')).toBeVisible();
  await expect(page.locator('#heroAnchor')).toHaveCount(1);
  await expect(page.locator('.editor-question .question')).toContainText('Хто вирішив');
  await page.locator('.editorial-brief summary').click();
  await expect(page.locator('.editorial-brief-content')).toContainText('Назви лише героя');
  await expect(page.locator('.editorial-brief-content')).not.toContainText('ТОН ЖАНРУ');
  await expect(page.locator('#answerForm button[type=submit]')).toBeVisible();
  // Main flow: write -> select words -> finish submission.
  await page.locator('#answer').fill('Кондитер вирішив продати кольоровий дощ музею.');
  await page.locator('#answerForm button[type=submit]').click();
  await expect(page.locator('.writer-selection')).toBeVisible();
  await expect(page.locator('.handoff-tip')).toContainText('слова-зачіпки');
  await expect(page.locator('.next-question')).toContainText('Що саме герой задумав зробити?');
  await page.locator('.selection-paper button.word').nth(0).click();
  await page.locator('.selection-paper button.word').nth(2).click();
  await page.locator('.selection-paper button.word').nth(4).click();
  await expect(page.locator('#wordCount')).toContainText('3 / 3');
  await page.locator('#answerForm button[type=submit]').click();
  await expect(page.locator('.dispatch-room')).toBeVisible();

  await page.goto(url('writing-v7-final'));
  await expect(page.locator('.final-stage-note')).toContainText('Це останній аркуш');
  await expect(page.locator('#answerForm button[type=submit]')).toContainText('Запечатати аркуш');
  await expect(page.locator('#wordTray')).toHaveCount(0);
  await page.locator('.editorial-brief summary').click();
  await expect(page.locator('.editorial-brief-content')).toContainText('Заверши все');
  await expect(page.locator('.editorial-brief-content')).not.toContainText('ТОН ЖАНРУ');

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
 });
}

test('new v7 room has functioning moderation, pause and player actions',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:390,height:844});
 await page.goto(url('moderation-v7'));
 await expect(page.locator('.moderation-sheet')).toBeVisible();
 await expect(page.locator('.moderation-ticket')).toBeVisible();
 await expect(page.locator('[data-act=ask-kick]')).toHaveCount(3);
 await expect(page.locator('[data-act=open-seat]')).toHaveCount(1);
 await page.locator('[data-act=ask-kick]').first().click();
 await expect(page.locator('[data-act=confirm-kick]')).toBeVisible();
 await page.locator('.moderation-sheet [data-act=manage-players]').click();
 await expect(page.locator('.moderation-ticket')).toBeVisible();
 await page.locator('.moderation-close').click();
 await expect(page.locator('.moderation-sheet')).toHaveCount(0);
 await expect(page.locator('[data-act=manage-players]')).toBeVisible();
 expect(errors).toEqual([]);
});
