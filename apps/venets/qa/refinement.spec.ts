import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
async function shot(page,testInfo,tag){
 if(!process.env.PW_QA_OUTPUT_DIR)return;
 mkdirSync(process.env.PW_QA_OUTPUT_DIR,{recursive:true});
 await page.screenshot({path:join(process.env.PW_QA_OUTPUT_DIR,
  'polish-'+testInfo.project.name+'-'+tag+'.png'),fullPage:false});
}
const start=async page=>{
 await page.goto('/apps/venets/index.html');
 await expect(page.locator('#begin')).toBeVisible();
 await page.locator('#begin').click();
 await expect(page.locator('#game-screen')).toBeVisible();
 await expect(page.locator('#save-status')).toHaveText('Сохранено');
};
test('compact council still exposes every legal decision and the paid-war route',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await start(page);
 await expect(page.locator('[data-action-kind="war"]')).toBeVisible();
 const more=page.locator('.more-actions');
 if(await more.isVisible()){
   const initial=await page.locator('#actions .action-choice').count();
   await expect(more).toHaveAttribute('aria-expanded','false');
   await more.click();
   await expect(more).toHaveAttribute('aria-expanded','true');
   expect(await page.locator('#actions .action-choice').count()).toBeGreaterThan(initial);
   await shot(page,info,'all-actions');
   await more.click();
   await expect(more).toHaveAttribute('aria-expanded','false');
 }
 await shot(page,info,'compact-council');
 expect(errors).toEqual([]);
});
test('saving the next year retains a recoverable previous checkpoint, without losing it on restore',async({page},info)=>{
 await start(page);
 await page.locator('#next-year').click();
 await expect(page.locator('#year-count')).toHaveText('1067');
 await expect(page.locator('#save-status')).toHaveText('Сохранено');
 await page.locator('#back-menu').click();
 await expect(page.locator('#restore-backup')).toBeVisible();
 await shot(page,info,'checkpoint-menu');
 await page.locator('#restore-backup').click();
 await expect(page.locator('#restore-dialog')).toBeVisible();
 await page.locator('#restore-dialog button[value="cancel"]').click();
 await expect(page.locator('#restore-dialog')).not.toBeVisible();
 await page.locator('#restore-backup').click();
 await page.locator('#restore-dialog button[value="confirm"]').click();
 await expect(page.locator('#game-screen')).toBeVisible();
 await expect(page.locator('#year-count')).toHaveText('1066');
 await page.reload();
 await expect(page.locator('#resume')).toBeVisible();
 await page.locator('#resume').click();
 await expect(page.locator('#year-count')).toHaveText('1066');
});
test('corrupt active record exposes the last verified campaign rather than a broken empty game',async({page})=>{
 await start(page);
 await page.locator('#next-year').click();
 await expect(page.locator('#save-status')).toHaveText('Сохранено');
 await page.evaluate(()=>new Promise((resolve,reject)=>{
   const req=indexedDB.open('venets-campaigns',1);
   req.onsuccess=()=>{
     const tx=req.result.transaction('saves','readwrite');
     tx.objectStore('saves').put('{bad-json','active');
     tx.oncomplete=()=>{req.result.close();resolve(null)};
     tx.onerror=()=>reject(tx.error);
   };
   req.onerror=()=>reject(req.error);
 }));
 await page.reload();
 await expect(page.locator('#restore-backup')).toBeVisible();
 await expect(page.locator('#resume')).toBeHidden();
 await page.locator('#restore-backup').click();
 await page.locator('#restore-dialog button[value="confirm"]').click();
 await expect(page.locator('#game-screen')).toBeVisible();
 await expect(page.locator('#year-count')).toHaveText('1066');
});
test('restoration controls and council remain usable on a 320x568 device without page scrolling',async({page},info)=>{
 await page.setViewportSize({width:320,height:568});
 await start(page);
 await expect(page.locator('.action-choice').first()).toBeVisible();
 await shot(page,info,'320-council');
 const geometry=await page.evaluate(()=>({
   pageW:document.documentElement.scrollWidth,viewW:innerWidth,
   pageH:document.documentElement.scrollHeight,viewH:innerHeight
 }));
 expect(geometry.pageW).toBeLessThanOrEqual(geometry.viewW+2);
 expect(geometry.pageH).toBeLessThanOrEqual(geometry.viewH+3);
 await page.locator('#next-year').click();
 await expect(page.locator('#save-status')).toHaveText('Сохранено');
 await page.locator('#back-menu').click();
 await expect(page.locator('#restore-backup')).toBeVisible();
});
