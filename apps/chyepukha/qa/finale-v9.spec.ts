import {test,expect} from '@playwright/test';
const preview=(id:string)=>'/apps/chyepukha/index.html?chyepukha-preview='+id;

test('v9 starts with a single chapter, then reveals the next one explicitly',async({page})=>{
 await page.goto(preview('results-v9'));
 await expect(page.locator('[data-act="reader-pages"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.page-reveal')).toHaveCount(1);
 await expect(page.locator('.page-progress')).toContainText('АРКУШ 01 / 03');
 await expect(page.locator('.page-manuscript')).toContainText('Архіваріус вирішив');
 await expect(page.locator('.page-manuscript')).not.toContainText('Дощ украв');
 await expect(page.locator('[data-act="prev-part"]')).toBeDisabled();
 await page.locator('[data-act="next-part"]').click();
 await expect(page.locator('.page-progress')).toContainText('АРКУШ 02 / 03');
 await expect(page.locator('.page-manuscript')).toContainText('Дощ украв');
 await page.locator('[data-act="next-part"]').click();
 await expect(page.locator('.page-progress')).toContainText('АРКУШ 03 / 03');
 await expect(page.locator('.page-ending')).toContainText('КІНЕЦЬ РУКОПИСУ');
 await page.locator('.page-next-story').click();
 await expect(page.locator('.story-pager')).toContainText('Історія 2 / 4');
 await expect(page.locator('.page-progress')).toContainText('АРКУШ 01 / 03');
});

test('reader views retain full text and author credits when switched',async({page})=>{
 await page.goto(preview('results-v9'));
 await page.locator('[data-act="next-part"]').click();
 await page.locator('[data-act="reader-full"]').click();
 await expect(page.locator('.reader-prose')).toContainText('Архіваріус');
 await expect(page.locator('.reader-prose')).toContainText('Дощ украв');
 await expect(page.locator('.reader-prose')).toContainText('Валізу обрали');
 await page.locator('[data-act="reader-parts"]').click();
 await expect(page.locator('.reader-fragment')).toHaveCount(3);
 await page.locator('[data-act="reader-pages"]').click();
 await expect(page.locator('.page-progress')).toContainText('АРКУШ 02 / 03');
 await page.locator('.chapter').nth(2).click();
 await expect(page.locator('.page-progress')).toContainText('АРКУШ 01 / 03');
 await page.locator('[data-act="prev-story"]').click();
 await expect(page.locator('.story-pager')).toContainText('Історія 2 / 4');
 await expect(page.locator('.page-progress')).toContainText('АРКУШ 01 / 03');
});

test('reactions can be cast, switched and removed without losing page',async({page})=>{
 await page.goto(preview('results-v9'));
 await page.locator('[data-act="next-part"]').click();
 const laugh=page.locator('[data-act="react-story"][data-reaction="laugh"]');
 const shock=page.locator('[data-act="react-story"][data-reaction="surprised"]');
 await expect(laugh).toHaveAttribute('aria-pressed','true');
 await expect(laugh).toContainText('2');
 await laugh.click();
 await expect(laugh).toHaveAttribute('aria-pressed','false');
 await expect(laugh).toContainText('1');
 await shock.click();
 await expect(shock).toHaveAttribute('aria-pressed','true');
 await expect(shock).toContainText('1');
 await expect(page.locator('.page-progress')).toContainText('АРКУШ 02 / 03');
 await page.locator('[data-act="next-story"]').first().click();
 await expect(page.locator('.story-pager')).toContainText('Історія 2 / 4');
 await expect(page.locator('[data-act="react-story"][aria-pressed="true"]')).toHaveCount(0);
 await page.locator('[data-act="prev-story"]').click();
 await expect(page.locator('[data-act="react-story"][data-reaction="surprised"]')).toHaveAttribute('aria-pressed','true');
});

test('v8 existing finished rooms do not show unsupported reaction controls',async({page})=>{
 await page.goto(preview('results'));
 await expect(page.locator('.reader-reactions')).toHaveCount(0);
 await expect(page.locator('[data-act="reader-pages"]')).toHaveCount(0);
 await expect(page.locator('.reader-prose')).toBeVisible();
});

for(const [label,width,height] of [['mobile',390,844],['small',320,568],['landscape',844,390]] as const){
 test('v9 reading and reactions usable on '+label,async({page})=>{
  await page.setViewportSize({width,height});
  await page.goto(preview('results-v9'));
  await expect(page.locator('.page-reveal')).toBeVisible();
  await expect(page.locator('.reaction-options button')).toHaveCount(3);
  const metrics=await page.evaluate(()=>{
   const buttons=[...document.querySelectorAll('.reaction-options button')] as HTMLButtonElement[];
   const reader=document.querySelector('.reader-scroll')!.getBoundingClientRect();
   const reaction=document.querySelector('.reader-reactions')!.getBoundingClientRect();
   return {buttonHeights:buttons.map(x=>x.getBoundingClientRect().height),readerHeight:reader.height,
    reactionBottom:reaction.bottom,bodyWidth:document.documentElement.scrollWidth,viewport:innerWidth};
  });
  expect(metrics.buttonHeights.every(x=>x>=(height<500?36:43))).toBe(true);
  expect(metrics.readerHeight).toBeGreaterThan(45);
  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewport+2);
  expect(metrics.reactionBottom).toBeLessThanOrEqual(height+4);
  await page.locator('[data-act="next-part"]').click();
  await expect(page.locator('.page-progress')).toContainText('АРКУШ 02');
  await page.locator('[data-act="react-story"][data-reaction="heart"]').click();
  await expect(page.locator('[data-act="react-story"][data-reaction="heart"]')).toHaveAttribute('aria-pressed','true');
 });
}

test('v10 keeps the page-turner and live reactions on the restored version',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(preview('results-v10'));
 await expect(page.locator('[data-act="reader-pages"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.page-progress')).toContainText('АРКУШ 01 / 03');
 await page.locator('[data-act="next-part"]').click();
 await expect(page.locator('.page-progress')).toContainText('АРКУШ 02 / 03');
 const like=page.locator('[data-act="react-story"][data-reaction="heart"]');
 await like.click();
 await expect(like).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-act="next-story"]').first().click();
 await expect(page.locator('.page-progress')).toContainText('АРКУШ 01 / 03');
});
