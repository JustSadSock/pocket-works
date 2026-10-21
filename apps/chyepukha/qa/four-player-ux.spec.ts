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
