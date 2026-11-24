import {test,expect} from '@playwright/test';
test('offline practice plays to a result, starts a new match and returns to launcher menu',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/crossfire/',{waitUntil:'domcontentloaded'});
 await page.locator('[data-mode="solo"]').click();
 await expect(page.locator('#board button')).toHaveCount(49);
 await expect(page.locator('#board .blue')).toHaveCount(1);
 await expect(page.locator('#board .red')).toHaveCount(1);
 for(let i=0;i<80;i++){
  if(await page.locator('#replay').isVisible())break;
  const hit=page.locator('#board .hit:not(:disabled)').first();
  const move=page.locator('#board .legal:not(:disabled)').first();
  if(await hit.count())await hit.click();
  else if(await move.count())await move.click();
  else await page.locator('#wait').click();
 }
 await expect(page.locator('#replay')).toBeVisible();
 await expect(page.locator('#status')).toHaveText(/победили|Ничья/);
 await page.locator('#replay').click();
 await expect(page.locator('#status')).toContainText('Синие 0 : 0 Красные');
 await expect(page.locator('#board .blue')).toHaveText('◆3');
 await page.locator('#back').click();
 await expect(page.locator('#menu')).toBeVisible();
 await expect(page.locator('#arena')).toBeHidden();
 expect(errors).toEqual([]);
});
