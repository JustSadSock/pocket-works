import {test,expect} from '@playwright/test';
const ARCHIVE='pocket-works:meat-exe:archive';

test('field journal exports actual samples as anonymous JSON with calibrated 15–25 minute metric',async({page})=>{
 test.setTimeout(65000);
 await page.goto('/apps/meat-exe/');
 await page.evaluate(key=>{
  const telemetry={windows:5,seconds:20,weightedFps:910,minFps:39,slowWindows:0,
    peakGeometries:145,peakDrawCalls:46,peakInstances:180,budgetWarnings:0};
  const history=[930,1160,1380].map((elapsed,i)=>({
   elapsed,wave:5,victory:true,score:3500+i*100,kills:114+i,damageTaken:100+i,
   protocol:'normal',stageTimes:[200,190,220,220,elapsed-830],
   telemetry
  }));
  localStorage.setItem(key,JSON.stringify({echoes:11,runs:3,unlocked:[],history,protocol:'normal'}));
 },ARCHIVE);
 await page.reload();
 await page.locator('#archiveToggle').click();
 await expect(page.locator('.field-reading')).toContainText('В ЦЕЛИ 15–25 МИН: 100%');
 await expect(page.locator('.field-reading')).toContainText('МЕДИАНА FPS');
 const downloadEvent=page.waitForEvent('download');
 await page.locator('.field-export').click();
 const download=await downloadEvent;
 expect(download.suggestedFilename()).toBe('meat-exe-field-report.json');
 const chunks=[];
 for await(const chunk of await download.createReadStream())chunks.push(chunk);
 const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 expect(data.format).toBe('meat-exe-field-report');
 expect(data.balance.wins).toBe(3);
 expect(data.balance.targetShare).toBe(100);
 expect(data.history).toHaveLength(3);
 expect(data.history[0].telemetry.windows).toBe(5);
 expect(data).not.toHaveProperty('deviceId');
});
test('a live WebGL field sample is saved when pausing and survives reload',async({page,isMobile})=>{
 test.setTimeout(90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/meat-exe/');
 await page.locator('#startBtn').click();
 await expect(page.locator('#hud')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>window.__MEAT_QA__()?.calibration?.fieldPerformance?.windows||0),
  {timeout:26000}).toBeGreaterThan(0);
 const before=await page.evaluate(()=>window.__MEAT_QA__().calibration.fieldPerformance);
 expect(before.seconds).toBeGreaterThanOrEqual(4);
 if(isMobile)await page.locator('#pauseBtn').click();
 else await page.keyboard.press('Escape');
 await expect(page.locator('#pauseMenu')).toBeVisible();
 await page.locator('#menuPause').click();
 await page.reload();await page.locator('#resumeSaved').click();
 const after=await page.evaluate(()=>window.__MEAT_QA__().calibration.fieldPerformance);
 expect(after.windows).toBeGreaterThanOrEqual(before.windows);
 expect(after.minimumFps).toBeGreaterThanOrEqual(0);
 expect(errors).toEqual([]);
});
