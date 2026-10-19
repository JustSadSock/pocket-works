import {test,expect} from '@playwright/test';
const ARC='pocket-works:meat-exe:archive';
test('replay protocol applies combat penalties and persists in saved run',async({page})=>{
 test.setTimeout(85000);
 await page.goto('/apps/meat-exe/');
 await page.locator('#archiveToggle').click();
 await expect(page.locator('#archivePanel')).toBeVisible();
 await expect(page.locator('#protocolOptions .protocol-option')).toHaveCount(4);
 await page.locator('.protocol-option').filter({hasText:'ХРУПКАЯ ПЛОТЬ'}).click();
 let qa=await page.evaluate(()=>window.__MEAT_QA__());
 expect(qa.archive.protocol).toBe('fragile');
 await page.locator('#startBtn').click();
 await expect(page.locator('#hud')).toBeVisible();
 qa=await page.evaluate(()=>window.__MEAT_QA__());
 expect(qa.calibration.protocol).toBe('fragile');
 expect(qa.hp).toBe(82);
 await page.keyboard.press('Escape');
 await expect(page.locator('#pauseMenu')).toBeVisible();
 await page.locator('#menuPause').click();
 await page.reload();
 await page.locator('#resumeSaved').click();
 const restored=await page.evaluate(()=>window.__MEAT_QA__());
 expect(restored.calibration.protocol).toBe('fragile');
 expect(restored.hp).toBe(82);
});
test('local recorded sessions show actual durations and win rate, not invented decorative stats',async({page})=>{
 await page.goto('/apps/meat-exe/');
 await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({
   echoes:12,runs:2,unlocked:[],equipped:null,protocol:'normal',
   history:[{elapsed:600,wave:5,kills:40,score:1000,damageTaken:180,
     protocol:'normal',victory:true,stageTimes:[100,130,120,160,90]},
   {elapsed:900,wave:3,kills:20,score:800,damageTaken:280,
     protocol:'siege',victory:false,stageTimes:[300,400,200]}]
 })),ARC);
 await page.reload();
 await page.locator('#archiveToggle').click();
 await expect(page.locator('.archive-stats')).toContainText('ПОБЕД 1');
 await expect(page.locator('.archive-stats')).toContainText('50%');
 await expect(page.locator('.archive-record')).toHaveCount(2);
});
