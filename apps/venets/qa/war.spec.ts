import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
const screenshot=async(page,testInfo,state)=>{
 if(!process.env.PW_QA_OUTPUT_DIR)return;
 mkdirSync(process.env.PW_QA_OUTPUT_DIR,{recursive:true});
 await page.screenshot({path:join(process.env.PW_QA_OUTPUT_DIR,
  'war-'+testInfo.project.name+'-'+state+'.png'),fullPage:false});
};
test('claim-driven paid war is ordered in council and marches on real map',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 await page.goto('/apps/venets/index.html');
 await page.locator('#begin').click();
 await expect(page.locator('#game-screen')).toBeVisible();
 await expect(page.locator('[data-action-kind="war"]')).toBeVisible();
 await page.locator('[data-action-kind="war"]').click();
 await expect(page.locator('#confirm-dialog')).toBeVisible();
 await expect(page.locator('#confirm-text')).toContainText('10 монет');
 await page.locator('#confirm-approve').click();
 await expect(page.locator('#conflict-strip')).toContainText('Война');
 await screenshot(page,testInfo,'declaration');
 const atlasTab=page.locator('[data-panel="lands"]');
 if(await atlasTab.isVisible())await atlasTab.click();
 await expect(page.locator('.atlas-army')).toHaveCount(1);
 await expect(page.locator('.living-atlas')).toBeVisible();
 await screenshot(page,testInfo,'army');
 await page.locator('#next-year').click();
 await expect(page.locator('#year-count')).toHaveText('1067');
 await expect(page.locator('.atlas-county')).toHaveCount(12);
 await screenshot(page,testInfo,'march');
 expect(errors).toEqual([]);
});
