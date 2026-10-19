import {test,expect} from '@playwright/test';

test('three laboratory modes switch without losing the grid',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('[data-world-mode]')).toHaveCount(4);
 await expect(page.locator('#cv')).toBeVisible();
 await page.locator('[data-cp-mode="combat"]:visible, [data-world-mode="combat"]:visible').first().click();
 await expect(page.locator('#battleCanvas')).toBeVisible();
 await page.locator('#cpExpert').click();
 await expect(page.locator('#combatPanel')).toBeVisible();
 await expect(page.locator('#cv')).toBeHidden();
 await page.locator('#battleTest').click();
 await expect(page.locator('#battleSummary')).toContainText('Победа:',{timeout:15000});
 await page.locator('[data-cp-mode="race"]:visible, [data-world-mode="race"]:visible').first().click();
 await expect(page.locator('#raceFrame')).toBeVisible();
 await page.locator('[data-cp-mode="grid"]:visible, [data-world-mode="grid"]:visible').first().click();
 await expect(page.locator('#cv')).toBeVisible();
 expect(errors).toEqual([]);
});
test('combat policies differ by loadout and arena',async({page})=>{
 await page.goto('/apps/petri-forge/',{waitUntil:'domcontentloaded'});
 await page.locator('[data-cp-mode="combat"]:visible, [data-world-mode="combat"]:visible').first().click();
 await page.locator('#cpExpert').click();
 await page.locator('#battleArena').selectOption('open');
 await page.locator('#battleTeamSize').selectOption('1');
 await page.locator('#battleTest').click();
 await expect(page.locator('#battleSummary')).toContainText('Победа:',{timeout:15000});
 const first=await page.locator('#battleSummary').textContent();
 await page.locator('#battleTeamSize').selectOption('2');
 await page.locator('#battleArena').selectOption('hazards');
 await page.locator('#battleTest').click();
 await expect(page.locator('#battleSummary')).toContainText('Победа:',{timeout:15000});
 const second=await page.locator('#battleSummary').textContent();
 expect(first).not.toEqual(second);
 await expect(page.locator('#battleSeek')).toBeEnabled();
});
