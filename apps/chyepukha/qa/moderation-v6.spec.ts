import {test,expect} from '@playwright/test';
const preview=id=>'/apps/chyepukha/index.html?chyepukha-preview='+id;

test('host controls can pause, manage and resume from a phone',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(preview('mod-writing'));
 await expect(page.locator('.mod-strip')).toBeVisible();
 await page.locator('[data-act=mod-toggle-pause]').click();
 await expect(page.locator('.mod-pause-overlay')).toBeVisible();
 await expect(page.locator('#answer')).toBeVisible();
 await page.locator('.mod-pause-overlay [data-act=mod-open]').click();
 await expect(page.locator('.mod-panel')).toBeVisible();
 await page.locator('.mod-panel [data-act=mod-close]').last().click();
 await page.locator('.mod-pause-overlay [data-act=mod-toggle-pause]').click();
 await expect(page.locator('.mod-pause-overlay')).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('host can confirm eviction and assign a waiting candidate without leaving the same round',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(preview('mod-writing'));
 await page.locator('.mod-strip [data-act=mod-open]').click();
 await expect(page.locator('.mod-panel')).toBeVisible();
 await page.locator('[data-act=mod-select][data-id=qa-third]').click();
 await page.locator('[data-act=mod-ask-kick]').click();
 await expect(page.locator('[data-act=mod-confirm]')).toBeVisible();
 await page.locator('[data-act=mod-confirm]').click();
 await expect(page.locator('.mod-strip')).toBeVisible();
 await page.locator('[data-act=mod-open]').click();
 await page.locator('[data-act=mod-select][data-id=qa-fourth]').click();
 await page.locator('[data-act=mod-assign][data-id=qa-new]').click();
 await expect(page.locator('.mod-panel')).toHaveCount(0);
 await page.locator('[data-act=mod-open]').click();
 await expect(page.locator('.mod-person')).toHaveCount(4);
 await expect(page.locator('.mod-person')).toContainText(['Марта','Назар','Софія','Олексій']);
 await expect(page.locator('.mod-room-state')).toContainText('9 / 10');
});

test('applicant cannot see hidden manuscript and cannot manage the players',async({page})=>{
 await page.goto(preview('mod-candidate'));
 await expect(page.locator('.mod-candidate')).toBeVisible();
 await expect(page.locator('.story-paper')).toHaveCount(0);
 await expect(page.locator('#answer')).toHaveCount(0);
 await expect(page.locator('[data-act=mod-open]')).toHaveCount(0);
});
test('lobby host can open moderation before starting a round',async({page})=>{
 await page.goto(preview('mod-lobby'));
 await expect(page.locator('.room')).toBeVisible();
 await page.locator('[data-act=mod-open]').click();
 await expect(page.locator('.mod-panel')).toBeVisible();
 await page.locator('[data-act=mod-select][data-id=qa-guest]').click();
 await expect(page.locator('[data-act=mod-ask-kick]')).toBeVisible();
});

test('offline host election remains accessible even if the game is paused',async({page})=>{
 await page.goto(preview('mod-vote'));
 await page.locator('[data-act=mod-open]').click();
 await expect(page.locator('.mod-vote')).toBeVisible();
 await page.locator('[data-act=mod-vote][data-id=qa-third]').click();
 await expect(page.locator('.mod-panel')).toHaveCount(0);
 await page.goto(preview('mod-paused'));
 await expect(page.locator('.mod-pause-overlay')).toBeVisible();
 await page.locator('.mod-pause-overlay [data-act=mod-open]').click();
 await expect(page.locator('.mod-panel')).toBeVisible();
});
