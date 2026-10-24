import {test,expect} from '@playwright/test';

const preview=(screen:string)=>'/apps/chyepukha/index.html?chyepukha-preview='+screen;

test('keyboard focus folds the manuscript brief without unmounting or clearing the draft',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(preview('writing-v7'));
 const original='Архіваріус випадково загубив карту у старому театрі';
 await page.locator('#answer').fill(original);
 await page.evaluate(()=>{
  document.documentElement.classList.add('is-app-keyboard-open');
  document.documentElement.style.setProperty('--app-viewport-height','340px');
  document.querySelector<HTMLTextAreaElement>('#answer')?.focus();
 });
 await expect(page.locator('.writer-shell')).toHaveClass(/is-typing/);
 await expect(page.locator('#editorQuestion')).toBeHidden();
 await expect(page.locator('.editorial-brief')).toBeHidden();
 // The floating moderation bar must not steal pointer events from the question tab.
 await expect(page.locator('.moderation-bar')).toBeHidden();
 await expect(page.locator('#answer')).toHaveValue(original);
 const bounds=await page.evaluate(()=>{
  const answer=document.querySelector('#answer')!.getBoundingClientRect();
  const action=document.querySelector('.editor-primary')!.getBoundingClientRect();
  return {textHeight:answer.height,textTop:answer.top,buttonBottom:action.bottom,buttonWidth:action.width};
 });
 expect(bounds.textHeight).toBeGreaterThanOrEqual(45);
 expect(bounds.buttonWidth).toBeGreaterThan(120);
 expect(bounds.buttonBottom).toBeLessThanOrEqual(344);
 await page.locator('[data-act="toggle-editor-context"]').click();
 await expect(page.locator('#editorQuestion')).toBeVisible();
 await expect(page.locator('[data-act="toggle-editor-context"]')).toHaveAttribute('aria-expanded','true');
 await expect(page.locator('#answer')).toHaveValue(original);
 await page.locator('#answer').focus();
 await expect(page.locator('#editorQuestion')).toBeHidden();
 await expect(page.locator('#answer')).toHaveValue(original);
});

test('selected handoff words can be removed directly from the preview strip',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(preview('writing-v7-selection'));
 await expect(page.locator('.word.selected')).toHaveCount(3);
 await expect(page.locator('#selectedStrip [data-act="remove-word"]')).toHaveCount(3);
 const first=page.locator('#selectedStrip [data-act="remove-word"]').first();
 await expect(first).toHaveAttribute('aria-label',/Прибрати слово/);
 await first.click();
 await expect(page.locator('#selectedStrip [data-act="remove-word"]')).toHaveCount(2);
 await expect(page.locator('.word.selected')).toHaveCount(2);
 await expect(page.locator('#wordCount')).toHaveText('2 / 3');
 await page.locator('.selection-paper .word:not(.selected)').first().click();
 await expect(page.locator('#selectedStrip [data-act="remove-word"]')).toHaveCount(3);
 await expect(page.locator('#wordCount')).toHaveText('3 / 3');
});

test('mobile word targets have sufficient height and the final action remains visible',async({page})=>{
 for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(size);
  await page.goto(preview('writing-v7-selection'));
  const result=await page.evaluate(()=>{
   const word=document.querySelector('.selection-paper .word')!.getBoundingClientRect();
   const action=document.querySelector('.editor-primary')!.getBoundingClientRect();
   return {height:word.height,bottom:action.bottom,right:action.right};
  });
  expect(result.height).toBeGreaterThanOrEqual(size.width>760?30:43);
  expect(result.bottom).toBeLessThanOrEqual(size.height+4);
  expect(result.right).toBeLessThanOrEqual(size.width+4);
 }
});

test('normal mobile writing retains the question, hero passport, editor and handoff workflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(preview('writing-v7'));
 await expect(page.locator('#editorQuestion')).toBeVisible();
 await expect(page.locator('#heroAnchor')).toHaveCount(1);
 await expect(page.locator('[data-act="toggle-editor-context"]')).toBeVisible();
 await page.locator('#answer').fill('Дракон продав світловий годинник у музеї.');
 await page.locator('#answerForm button[type=submit]').click();
 await expect(page.locator('.writer-selection')).toBeVisible();
 await expect(page.locator('[data-act="toggle-editor-context"]')).toHaveCount(0);
 await page.locator('.selection-paper .word').nth(0).click();
 await page.locator('.selection-paper .word').nth(1).click();
 await page.locator('.selection-paper .word').nth(2).click();
 await expect(page.locator('#selectedStrip [data-act="remove-word"]')).toHaveCount(3);
 await page.locator('#answerForm button[type=submit]').click();
 await expect(page.locator('.dispatch-room')).toBeVisible();
});
