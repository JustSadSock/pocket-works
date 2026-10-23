import {test,expect} from '@playwright/test';
test('rupture defaults to ten minutes and evolves without resetting time or points',async({page})=>{
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#mode-rupture')).toHaveAttribute('aria-pressed','true');
 await page.locator('#primary-action').click();
 await expect(page.locator('#round-number')).toContainText('ЭВОЛЮЦИЯ');
 await expect(page.locator('#core-indicator')).toBeVisible();
 expect(await page.evaluate(()=>window.__perekosTest.state.gameMode)).toBe('rupture');
 await page.evaluate(()=>{const s=window.__perekosTest.state;s.remaining=540+1/120;for(let i=0;i<3;i++)window.__perekosTest.step()});
 await expect(page.locator('#draft')).toBeVisible();
 await page.locator('.rune-choice').first().click();await expect(page.locator('#build')).toBeVisible();
 await page.locator('#bench-fight').click();await expect(page.locator('#hud')).toBeVisible();
 expect(await page.evaluate(()=>window.__perekosTest.state.remaining)).toBeLessThan(541);
 await page.locator('#pause-btn').click();await page.locator('#quit').click();await page.locator('#quit-yes').click();
 await page.locator('#mode-duel').click();await page.locator('#primary-action').click();
 expect(await page.evaluate(()=>window.__perekosTest.state.gameMode)).toBe('duel');
});
