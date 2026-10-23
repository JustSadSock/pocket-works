import {test,expect} from '@playwright/test';

const preview=(id:string)=>'/apps/chyepukha/index.html?chyepukha-preview='+id;

test('four-author lobby, drafting, waiting and four-result navigation fit phone',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(preview('lobby-ready'));
 await expect(page.locator('.roster .person')).toHaveCount(4);
 await expect(page.locator('.room .mini').filter({hasText:'4/4 учасників'})).toBeVisible();
 await expect(page.locator('[data-act=start]')).toBeEnabled();

 await page.goto(preview('writing-first'));
 await expect(page.locator('.turn-progress-author')).toHaveCount(4);
 await expect(page.locator('.turn-progress-count')).toContainText('0 / 4');
 await expect(page.locator('#answerForm')).toBeVisible();
 await expect(page.locator('#answer')).toBeVisible();
 await expect(page.locator('#answerForm button[type=submit]')).toBeVisible();
 const progress=await page.locator('#turnProgress').boundingBox();
 expect(progress).not.toBeNull();
 expect(progress!.x).toBeGreaterThanOrEqual(0);
 expect(progress!.x+progress!.width).toBeLessThanOrEqual(392);

 await page.goto(preview('waiting'));
 await expect(page.locator('.turn-progress-author')).toHaveCount(4);
 await expect(page.locator('.turn-progress-author.is-ready')).toHaveCount(3);
 await expect(page.locator('.turn-progress-count')).toContainText('3 / 4');

 await page.goto(preview('results'));
 await expect(page.locator('.chapters .chapter')).toHaveCount(4);
 await expect(page.locator('.story-pager')).toContainText('Історія 1 / 4');
 await page.locator('[data-act=next-story]').click();
 await expect(page.locator('.story-pager')).toContainText('Історія 2 / 4');
 await page.locator('[data-act=next-story]').click();
 await expect(page.locator('.story-pager')).toContainText('Історія 3 / 4');
 await page.locator('[data-act=next-story]').click();
 await expect(page.locator('.story-pager')).toContainText('Історія 4 / 4');
 await expect(page.locator('.chapter.active')).toContainText('Ярина');
 await page.locator('[data-act=next-story]').click();
 await expect(page.locator('.story-pager')).toContainText('Історія 1 / 4');
 await page.locator('[data-act=prev-story]').click();
 await expect(page.locator('.story-pager')).toContainText('Історія 4 / 4');
 expect(errors).toEqual([]);
});

test('desktop keeps four-author progress and result controls alongside the manuscript',async({page})=>{
 await page.setViewportSize({width:1366,height:768});
 await page.goto(preview('writing-first'));
 await expect(page.locator('#turnProgress .turn-progress-author')).toHaveCount(4);
 await expect(page.locator('#sideRoster .status')).toHaveCount(4);
 await expect(page.locator('.side')).toBeVisible();
 await expect(page.locator('#answer')).toBeVisible();

 await page.goto(preview('results'));
 await expect(page.locator('.chapters .chapter')).toHaveCount(4);
 await expect(page.locator('.story-pager')).toBeVisible();
 await page.locator('.chapter').nth(2).click();
 await expect(page.locator('.story-pager')).toContainText('Історія 3 / 4');
 await page.locator('[data-act=prev-story]').click();
 await expect(page.locator('.story-pager')).toContainText('Історія 2 / 4');
});

test('final manuscript is genuinely scrollable and both reading modes work on a phone',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(preview('results'));
 const scroll=page.locator('.reader-scroll');
 await expect(scroll).toBeVisible();
 await page.locator('[data-act=reader-parts]').click();
 await expect(page.locator('.reader-fragment')).toHaveCount(3);
 await page.locator('[data-act=reader-full]').click();
 await expect(page.locator('.reader-prose')).toBeVisible();
 const result=await scroll.evaluate(el=>{
  const prose=el.querySelector('.reader-prose');
  prose.textContent=Array(35).fill(prose.textContent).join('\n\n');
  el.scrollTop=el.scrollHeight;
  return {scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,scrollTop:el.scrollTop};
 });
 expect(result.scrollHeight).toBeGreaterThan(result.clientHeight);
 expect(result.scrollTop).toBeGreaterThan(0);
});
test('comic export and audio controls are accessible from final view',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(preview('results'));
 await page.locator('[data-act=comic]').click();
 await expect(page.locator('[data-act=copy-comic-direct]')).toBeVisible();
 await expect(page.locator('[data-act=copy-comic-safe]')).toBeVisible();
 await page.locator('[data-act=close-comic]').click();
 await page.locator('#sound').click();
 await expect(page.locator('input[name=effectsEnabled]')).toBeVisible();
 await expect(page.locator('input[name=musicEnabled]')).toBeVisible();
 await page.locator('input[name=musicEnabled]').check();
 await page.locator('[data-act=close-audio]').click();
 await expect(page.locator('.reader-scroll')).toBeVisible();
});

test('the writing phase gives the whole page to the draft, then reviews exact words',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(preview('writing-first'));
 const answer=page.locator('#answer');
 await expect(answer).toBeVisible();
 await expect(page.locator('.writer-compose')).toBeVisible();
 await expect(page.locator('#wordTray')).toHaveCount(0);
 const story='Архіваріус знайшов місячну валізу і сховав її у саду';
 await answer.fill(story);
 await page.locator('#answerForm button[type=submit]').click();
 await expect(page.locator('.writer-selection')).toBeVisible();
 await expect(page.locator('.selection-paper')).toContainText(story);
 await expect(page.locator('#answer')).toHaveCount(0);
 await expect(page.locator('.word')).toHaveCount(10);
 await page.locator('.word').nth(0).click();
 await page.locator('.word').nth(2).click();
 await page.locator('.word').nth(4).click();
 await expect(page.locator('.word.selected')).toHaveCount(3);
 await expect(page.locator('#selectedStrip .handoff-chip')).toHaveCount(3);
 await page.locator('[data-act=back-to-draft]').click();
 await expect(page.locator('#answer')).toHaveValue(story);
 await expect(page.locator('.word')).toHaveCount(0);
 await page.locator('#answerForm button[type=submit]').click();
 await expect(page.locator('.word.selected')).toHaveCount(3);
 await page.locator('[data-act=back-to-draft]').click();
 await page.locator('#answer').fill(story+' несподівано');
 await page.locator('#answerForm button[type=submit]').click();
 await expect(page.locator('.word.selected')).toHaveCount(0);
 await expect(page.locator('#wordCount')).toContainText('0 / 3');
});

test('the core writer action remains reachable in portrait and short landscape',async({page})=>{
 for(const size of [{width:390,height:844},{width:320,height:568},{width:844,height:390}]){
  await page.setViewportSize(size);
  await page.goto(preview('writing-first'));
  await expect(page.locator('#answer')).toBeVisible();
  await expect(page.locator('.editor-primary')).toBeVisible();
  const bounds=await page.evaluate(()=>{
   const r=document.querySelector('.editor-primary').getBoundingClientRect();
   const a=document.querySelector('#answer').getBoundingClientRect();
   return {actionBottom:r.bottom,actionX:r.x,actionRight:r.right,answerHeight:a.height,scrollWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,viewportHeight:innerHeight};
  });
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.viewportWidth+2);
  expect(bounds.actionBottom).toBeLessThanOrEqual(bounds.viewportHeight+4);
  expect(bounds.actionRight).toBeLessThanOrEqual(bounds.viewportWidth+4);
  expect(bounds.actionX).toBeGreaterThanOrEqual(-2);
  expect(bounds.answerHeight).toBeGreaterThan(45);
  await page.locator('#answer').fill('Дракон випадково загубив срібний годинник між старими книжками');
  await page.locator('#answerForm button[type=submit]').click();
  await expect(page.locator('.writer-selection')).toBeVisible();
  await expect(page.locator('.editor-primary')).toBeVisible();
  const reviewBottom=await page.locator('.editor-primary').evaluate(el=>el.getBoundingClientRect().bottom);
  expect(reviewBottom).toBeLessThanOrEqual(size.height+4);
 }
});

test('zero-word handoff seals directly without exposing a dead review step',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(preview('writing-zero'));
 await expect(page.locator('#wordTray')).toHaveCount(0);
 await page.locator('#answerForm button[type=submit]').click();
 await expect(page.locator('.wax')).toBeVisible();
});
