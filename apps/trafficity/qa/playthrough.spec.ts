import { expect, test } from '@playwright/test';

test('solo dispatch works on desktop, Android and iPhone', async ({page}, info) => {
 const failures:string[]=[];
 page.on('pageerror',e=>failures.push(e.message));
 await page.goto('/apps/trafficity/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#solo')).toBeVisible();
 await page.locator('#solo').click();
 await expect(page.locator('#dispatch')).toBeVisible();
 const beginning=await page.evaluate(()=> (window as any).__AI_TEST_STATE__);
 expect(beginning.phase).toBe('playing');
 expect(beginning.cars).toHaveLength(4);
 expect(beginning.cityReady).toBeTruthy();
 await page.locator('#auto').click();
 const queued=await page.evaluate(()=> (window as any).__AI_TEST_STATE__);
 expect(queued.cars[0].route.length).toBeGreaterThan(0);
 await page.locator('#next').click();
 const moved=await page.evaluate(()=> (window as any).__AI_TEST_STATE__);
 expect(moved.turn).toBe(1);
 expect(moved.cars[0].at).not.toBe(beginning.cars[0].at);
 const bounds=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,appHeight:document.querySelector('.shell')?.getBoundingClientRect().height||0,viewportHeight:innerHeight}));
 expect(bounds.width).toBeLessThanOrEqual(bounds.viewport+2);
 const mapBounds=await page.evaluate(()=>{
  const a=document.querySelector('#cityCanvas').getBoundingClientRect();
  const b=document.querySelector('.city-inner').getBoundingClientRect();
  return {cw:a.width,ch:a.height,pw:b.width,ph:b.height,top:Math.abs(a.top-b.top)};
 });
 expect(Math.abs(mapBounds.cw-mapBounds.pw)).toBeLessThanOrEqual(2);
 expect(Math.abs(mapBounds.ch-mapBounds.ph)).toBeLessThanOrEqual(2);
 expect(mapBounds.top).toBeLessThanOrEqual(2);
 expect(bounds.appHeight).toBeLessThanOrEqual(bounds.viewportHeight+2);
 await page.locator('#pause').click();
 await expect(page.locator('#pauseOverlay')).toBeVisible();
 await page.locator('#continue').click();
 await expect(page.locator('#pauseOverlay')).toBeHidden();
 await page.screenshot({path:(process.env.PW_QA_OUTPUT_DIR||'/tmp')+'/trafficity-'+info.project.name+'-solo.png'});
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#resume')).toBeVisible();
 await page.locator('#resume').click();
 const resumed=await page.evaluate(()=> (window as any).__AI_TEST_STATE__);
 expect(resumed.turn).toBe(1);
 expect(resumed.cars[0].at).toBe(moved.cars[0].at);
 expect(failures).toEqual([]);
});

test('roads, zoom and animated turn feedback are responsive',async({page})=>{
 await page.goto('/apps/trafficity/',{waitUntil:'domcontentloaded'});
 await page.locator('#solo').click();
 const initial=await page.evaluate(()=>window.__AI_TEST_STATE__);
 expect(initial.rulesVersion).toBe(3);
 await page.locator('#zoomIn').click();
 const zoom=await page.evaluate(()=>window.__AI_TEST_STATE__);
 expect(zoom.camera.zoom).toBeGreaterThan(1);
 await page.locator('#zoomReset').click();
 await page.locator('#auto').click();
 await page.locator('#next').click();
 const movement=await page.evaluate(()=>window.__AI_TEST_STATE__);
 expect(movement.turn).toBe(1);
 await expect(page.locator('#cityCanvas')).toBeVisible();
 await page.waitForTimeout(1050);
 const settled=await page.evaluate(()=>window.__AI_TEST_STATE__);
 expect(settled.motion).toBe(null);
});
test('full 30 turn match finishes with delivery points', async ({page}) => {
 await page.goto('/apps/trafficity/',{waitUntil:'domcontentloaded'});
 await page.locator('#solo').click();
 for(let turn=0;turn<30;turn++){
  await page.locator('[data-vehicle="0"]').click();
  await page.locator('#auto').click();
  await page.locator('[data-vehicle="1"]').click();
  await page.locator('#auto').click();
  await page.locator('#next').click();
 }
 const end=await page.evaluate(()=> (window as any).__AI_TEST_STATE__);
 expect(end.phase).toBe('finished');
 expect(end.turn).toBe(30);
 expect(end.scores[0]).toBeGreaterThan(0);
 expect(end.scores[1]).toBeGreaterThan(0);
 await expect(page.locator('#finish')).toBeVisible();
 await expect(page.locator('#finishScore')).toContainText(':');
 await page.locator('#again').click();
 const next=await page.evaluate(()=> (window as any).__AI_TEST_STATE__);
 expect(next.turn).toBe(0);
 expect(next.phase).toBe('playing');
});
