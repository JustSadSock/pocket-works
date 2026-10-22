import {test,expect} from '@playwright/test';

test('backquote atlas previews all twelve existing screens without changing the match',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await page.locator('#primary-action').click();
 const before=await page.evaluate(()=>{const s=window.__perekosTest.state;return {seed:s.seed,score:[...s.score],runes:[...s.actors[0].runes],save:localStorage.getItem('pocket-works:perekos:match'),continueHidden:document.getElementById('continue').hidden}});
 await page.keyboard.press('Backquote');
 await expect(page.locator('#debug-atlas')).toBeVisible();
 await expect(page.locator('#debug-atlas [data-scene]')).toHaveCount(12);
 await page.locator('#debug-atlas [data-scene="draft"]').click();
 await expect(page.locator('#rune-cards .rune-seal-art')).toHaveCount(3);
 await page.locator('#debug-atlas [data-scene="build"]').click();
 await expect(page.locator('#bench-slots .rune-seal-art')).toHaveCount(6);
 await expect(page.locator('.spell-lane')).toHaveCount(3);
 await page.locator('#debug-atlas [data-scene="mage-select"]').click();
 await expect(page.locator('.mage-options .mage-option')).toHaveCount(6);
 await page.locator('#debug-atlas [data-scene="result"]').click();
 await expect(page.locator('#result')).toBeVisible();
 await page.keyboard.press('Backquote');
 await expect(page.locator('#debug-atlas')).toBeHidden();
 await expect(page.locator('#hud')).toBeVisible();
 const after=await page.evaluate(()=>{const s=window.__perekosTest.state;return {seed:s.seed,score:[...s.score],runes:[...s.actors[0].runes],save:localStorage.getItem('pocket-works:perekos:match'),continueHidden:document.getElementById('continue').hidden}});
 expect(after).toEqual(before);
 expect(errors).toEqual([]);
});
