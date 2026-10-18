import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
async function snap(page,testInfo,tag){
 if(!process.env.PW_QA_OUTPUT_DIR)return;
 mkdirSync(process.env.PW_QA_OUTPUT_DIR,{recursive:true});
 await page.screenshot({path:join(process.env.PW_QA_OUTPUT_DIR,
   'wide-'+testInfo.project.name+'-'+tag+'.png'),fullPage:false});
}
const ENTRY='/apps/venets/index.html';
test('expanded 48-land campaign is opt-in, playable and navigable without page scroll',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(ENTRY);
 await expect(page.locator('#begin')).toBeVisible();
 await page.locator('.world-settings summary').click();
 await page.locator('[data-world-size="48"]').click();
 await expect(page.locator('[data-world-size="48"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('#begin').click();
 await expect(page.locator('#game-screen')).toBeVisible();
 await page.locator('[data-panel="lands"]').evaluate(el=>{
  if(getComputedStyle(el).display!=='none')el.click();
 });
 await expect(page.locator('.atlas-county')).toHaveCount(48);
 await expect(page.locator('#region-controls')).toBeVisible();
 await expect(page.locator('#region-label')).toHaveText('I / IV');
 await snap(page,testInfo,'atlas-region-one');
 await page.locator('#region-next').click();
 await expect(page.locator('#region-label')).toHaveText('II / IV');
 await snap(page,testInfo,'atlas-region-two');
 await expect(page.locator('.atlas-county.is-selected')).toHaveCount(1);
 await page.locator('#region-next').click();
 await expect(page.locator('#region-label')).toHaveText('III / IV');
 await page.locator('#region-prev').click();
 await expect(page.locator('#region-label')).toHaveText('II / IV');
 await page.locator('.atlas-county.is-selected').click();
 await expect(page.locator('#province-info')).toBeVisible();
 await page.locator('[data-atlas-view="family"]').click();
 await expect(page.locator('#genealogy-tree')).toBeVisible();
 await snap(page,testInfo,'family');
 await page.locator('[data-atlas-view="atlas"]').click();
 await page.locator('#next-year').click();
 await expect(page.locator('#year-count')).toHaveText('1067');
 expect(errors).toEqual([]);
});
test('48-land mode works on 320x568 with fixed time and regional navigation',async({page},testInfo)=>{
 await page.setViewportSize({width:320,height:568});
 await page.goto(ENTRY);
 await page.locator('.world-settings summary').click();
 await page.locator('[data-world-size="48"]').click();
 await page.locator('#begin').click();
 await page.locator('[data-panel="lands"]').click();
 await expect(page.locator('.living-atlas')).toBeVisible();
 await expect(page.locator('#region-next')).toBeVisible();
 await expect(page.locator('#next-year')).toBeVisible();
 await snap(page,testInfo,'320-phone');
 const metrics=await page.evaluate(()=>({
  width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,
  viewportW:innerWidth,viewportH:innerHeight
 }));
 expect(metrics.width).toBeLessThanOrEqual(metrics.viewportW+2);
 expect(metrics.height).toBeLessThanOrEqual(metrics.viewportH+3);
 await page.locator('#region-next').click();
 await expect(page.locator('#region-label')).toHaveText('II / IV');
});
test('48-land campaign resume preserves world scale and political state',async({page})=>{
 await page.goto(ENTRY);
 await page.locator('.world-settings summary').click();
 await page.locator('[data-world-size="48"]').click();
 await page.locator('#begin').click();
 await page.locator('#next-year').click();
 await expect(page.locator('#year-count')).toHaveText('1067');
 await page.reload();
 await expect(page.locator('#resume')).toBeVisible();
 await page.locator('#resume').click();
 await expect(page.locator('#year-count')).toHaveText('1067');
 await page.locator('[data-panel="lands"]').evaluate(el=>{
   if(getComputedStyle(el).display!=='none')el.click();
 });
 await expect(page.locator('.atlas-county')).toHaveCount(48);
});
