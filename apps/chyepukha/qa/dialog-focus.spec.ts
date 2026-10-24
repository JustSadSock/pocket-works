import {test,expect} from '@playwright/test';

test('comic dialog traps keyboard focus and returns it to the launcher',async({page})=>{
 await page.goto('/apps/chyepukha/index.html?chyepukha-preview=results');
 const trigger=page.locator('[data-act=comic]');
 await trigger.focus();
 await trigger.click();
 const dialog=page.getByRole('dialog');
 await expect(dialog).toBeVisible();
 const inside=()=>page.evaluate(()=>Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement)));
 expect(await inside()).toBe(true);
 await page.keyboard.press('Shift+Tab');
 expect(await inside()).toBe(true);
 await page.keyboard.press('Tab');
 expect(await inside()).toBe(true);
 await page.locator('[data-act=close-comic]').click();
 await expect(dialog).toHaveCount(0);
 await expect(trigger).toBeFocused();
});
