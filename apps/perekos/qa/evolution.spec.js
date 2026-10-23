import {test,expect} from '@playwright/test';
test('new rupture grants real mutation, keeps rune slots and shows upgraded spell on court',async({page})=>{
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await page.locator('#mode-rupture').click();await page.locator('#primary-action').click();
 await page.evaluate(()=>{const s=window.__perekosTest.state;s.remaining=540+1/120;window.__perekosTest.step();window.__perekosTest.step()});
 await expect(page.locator('#draft')).toBeVisible();
 await page.locator('#evo-path-mutate').click();
 await expect(page.locator('.evo-offer')).toHaveCount(3);
 await page.locator('.evo-offer-beam').click();
 await expect(page.locator('#build')).toBeVisible();
 await expect(page.locator('#evo-readout')).toContainText('Разящий луч');
 expect(await page.evaluate(()=>window.__perekosTest.state.actors[0].evolution)).toEqual({form:'beam',level:1});
 await page.locator('#bench-fight').click();
 await expect(page.locator('#hud')).toBeVisible();
 await page.evaluate(()=>{const s=window.__perekosTest.state;s.actors[0].cast=0;for(let i=0;i<4;i++)window.__perekosTest.step()});
 expect(await page.evaluate(()=>window.__perekosTest.state.beams.some(b=>b.style==='evo-beam'))).toBe(true);
});
test('fusion tab tells player exact live prerequisites and fuses an assembled chain',async({page})=>{
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await page.locator('#mode-rupture').click();await page.locator('#primary-action').click();
 await page.evaluate(()=>{const s=window.__perekosTest.state;s.remaining=540+1/120;window.__perekosTest.step();window.__perekosTest.step()});
 await expect(page.locator('#draft')).toBeVisible();
 await page.locator('#evo-path-fuse').click();
 await expect(page.locator('.evo-empty')).toContainText('цепочку');
 await page.evaluate(()=>{window.__perekosTest.state.actors[0].runes=['on_cast','ball','as_storm']});
 await page.locator('#evo-path-add').click();await page.locator('#evo-path-fuse').click();
 await expect(page.locator('.evo-offer-storm_lattice')).toBeVisible();
 await page.locator('.evo-offer-storm_lattice').click();
 await expect(page.locator('#build')).toBeVisible();
 await expect(page.locator('#evo-readout')).toContainText('Грозовая решётка');
 expect(await page.evaluate(()=>window.__perekosTest.state.actors[0].fusions)).toContain('storm_lattice');
});
test('classic duel keeps its original single-route rune draft',async({page})=>{
 await page.goto('/apps/perekos/',{waitUntil:'domcontentloaded'});
 await page.locator('#mode-duel').click();await page.locator('#primary-action').click();
 await page.evaluate(()=>{const s=window.__perekosTest.state;s.remaining=1/120;window.__perekosTest.step()});
 await expect(page.locator('#draft')).toBeVisible();await expect(page.locator('#draft-path')).toBeHidden();
});
