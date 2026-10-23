import {test,expect} from '@playwright/test';
const preview=id=>'/apps/chyepukha/index.html?chyepukha-preview='+id;
test('host sees actionable moderation and one-time replacement ticket',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(preview('moderation-host'));
 await expect(page.locator('.moderation-sheet')).toBeVisible();
 await expect(page.locator('.moderation-person')).toHaveCount(4);
 await expect(page.locator('[data-act=transfer-host]')).toHaveCount(2);
 await expect(page.locator('[data-act=open-seat]')).toHaveCount(1);
 await expect(page.locator('[data-act=ask-kick]')).toHaveCount(3);
 await expect(page.locator('[data-act=ask-skip]')).toHaveCount(1);
 await expect(page.locator('.moderation-ticket>strong')).toHaveText('1A2B3C4D5E6F');
 await page.locator('[data-act=ask-kick]').first().click();
 await expect(page.locator('[data-act=confirm-kick]')).toBeVisible();
 await page.locator('.moderation-sheet [data-act=manage-players]').click();
 await expect(page.locator('.moderation-ticket>strong')).toBeVisible();
 await page.locator('.moderation-close').click();
 await expect(page.locator('.moderation-sheet')).toHaveCount(0);
 await expect(page.locator('[data-act=manage-players]')).toBeVisible();
});
test('moderation panel on short landscape screens stays bounded and scrollable',async({page})=>{
 await page.setViewportSize({width:844,height:390});
 await page.goto(preview('moderation-host'));
 const box=await page.locator('.moderation-sheet').evaluate(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,right:r.right,scroll:e.scrollHeight>e.clientHeight}});
 expect(box.right).toBeLessThanOrEqual(846);
 expect(box.bottom).toBeLessThanOrEqual(391);
 expect(box.scroll).toBe(true);
 await page.locator('.moderation-close').click();
});
test('non-host cannot see kick, transfer, replacement ticket or pause controls',async({page})=>{
 await page.goto(preview('moderation-guest'));
 await expect(page.locator('.moderation-sheet')).toBeVisible();
 await expect(page.locator('[data-act=kick]')).toHaveCount(0);
 await expect(page.locator('[data-act=ask-kick]')).toHaveCount(0);
 await expect(page.locator('[data-act=transfer-host]')).toHaveCount(0);
 await expect(page.locator('.moderation-ticket')).toHaveCount(0);
 await expect(page.locator('[data-act=vote-host]')).toBeVisible();
 await expect(page.locator('[data-act=pause]')).toHaveCount(0);
});
test('paused issue gives clear feedback and disables sending without hiding manuscript',async({page})=>{
 await page.goto(preview('moderation-paused'));
 await page.locator('.moderation-close').click();
 await expect(page.locator('.pause-banner')).toBeVisible();
 await expect(page.locator('#answer')).toBeVisible();
 await expect(page.locator('#answerForm button[type=submit]')).toBeDisabled();
 await expect(page.locator('[data-act=unpause]')).toBeVisible();
});
