import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
const saveShot=async(page,info,label)=>{
 if(!process.env.PW_QA_OUTPUT_DIR)return;
 mkdirSync(process.env.PW_QA_OUTPUT_DIR,{recursive:true});
 await page.screenshot({path:join(process.env.PW_QA_OUTPUT_DIR,
 'final-'+info.project.name+'-'+label+'.png'),fullPage:false});
};
async function createEndedCampaign(page,{size=12,seed=413}={}){
 await page.goto('/apps/venets/index.html');
 await expect(page.locator('#begin')).toBeVisible();
 await page.evaluate(async({size,seed})=>{
  const {startCampaign,campaignYear,serializeCampaign}=await import('/apps/venets/sim/campaign.js');
  const g=startCampaign({seed,countyId:'co-01',size});
  while(!g.chapterComplete&&!g.finished)campaignYear(g);
  const raw=serializeCampaign(g);
  await new Promise((resolve,reject)=>{
   const request=indexedDB.open('venets-campaigns',1);
   request.onupgradeneeded=()=>{
     if(!request.result.objectStoreNames.contains('saves'))request.result.createObjectStore('saves');
   };
   request.onsuccess=()=>{
     const tx=request.result.transaction('saves','readwrite');
     tx.objectStore('saves').put(raw,'active');
     tx.oncomplete=()=>{request.result.close();resolve(null);};
     tx.onerror=()=>reject(tx.error);
   };
   request.onerror=()=>reject(request.error);
  });
 },{size,seed});
 await page.reload();
 await expect(page.locator('#resume')).toBeVisible();
 await page.locator('#resume').click();
 await expect(page.locator('#ending-screen')).toBeVisible();
}
test('real 90-year chapter shows law-grounded ending, heraldic seal, milestone timeline and the PocketWorks exit',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await createEndedCampaign(page);
 await expect(page.locator('#ending-title')).not.toBeEmpty();
 await expect(page.locator('#ending-note')).not.toBeEmpty();
 await expect(page.locator('#ending-herald svg')).toHaveCount(1);
 await expect(page.locator('#ending-timeline .ending-event')).not.toHaveCount(0);
 await expect(page.locator('#ending-stats .ending-measure')).toHaveCount(6);
 await expect(page.locator('#continue-legacy')).toBeVisible();
 await expect(page.locator('#download-chronicle')).toBeVisible();
 await expect(page.locator('.ending-home')).toHaveAttribute('href','../../');
 const year=await page.locator('#ending-eyebrow').textContent();
 expect(year).toContain('1156');
 await saveShot(page,info,'ending');
 expect(errors).toEqual([]);
});
test('downloaded historical scroll contains actual years and court events, and continued game still works',async({page})=>{
 await createEndedCampaign(page);
 const downloadPromise=page.waitForEvent('download');
 await page.locator('#download-chronicle').click();
 const file=await downloadPromise;
 expect(file.suggestedFilename()).toMatch(/^venets-413-1156\.txt$/);
 const {readFileSync}=await import('node:fs');
 const body=readFileSync(await file.path(),'utf8');
 expect(body).toContain('1066–1156');
 expect(body).toContain('ВЕХИ ЛЕТОПИСИ');
 expect(body).not.toContain('undefined');
 await page.locator('#continue-legacy').click();
 await expect(page.locator('#game-screen')).toBeVisible();
 await expect(page.locator('#year-count')).toHaveText('1156');
 await page.locator('#next-year').click();
 await expect(page.locator('#year-count')).toHaveText('1157');
});
test('the large world can reach its conclusion; 320px page remains fixed, with its history internally scrollable',async({page},info)=>{
 await page.setViewportSize({width:320,height:568});
 await createEndedCampaign(page,{size:48,seed:413});
 await expect(page.locator('#ending-title')).not.toBeEmpty();
 await expect(page.locator('#ending-timeline .ending-event')).not.toHaveCount(0);
 const metrics=await page.evaluate(()=>({
  width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,
  viewportW:innerWidth,viewportH:innerHeight
 }));
 expect(metrics.width).toBeLessThanOrEqual(metrics.viewportW+2);
 expect(metrics.height).toBeLessThanOrEqual(metrics.viewportH+3);
 await expect(page.locator('#download-chronicle')).toBeVisible();
 await expect(page.locator('#ending-new')).toBeVisible();
 await expect(page.locator('.ending-home')).toBeVisible();
 await saveShot(page,info,'ending-320');
 await page.locator('#ending-new').click();
 await expect(page.locator('#menu-screen')).toBeVisible();
 await expect(page.locator('#begin')).toBeVisible();
});
