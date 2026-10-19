import {test,expect} from '@playwright/test';
const SAVE='pocket-works:meat-exe:session';
const ARCHIVE='pocket-works:meat-exe:archive';

test('a resumed final-heart clear produces a real win, rewards, recorded run and restart',async({page})=>{
 test.setTimeout(90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/meat-exe/');
 // Restore an actual cleared terminal combat checkpoint. No debug API
 // calls are used to force victory; the normal win detector must finish.
 await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({
  v:5,seed:413,x:3,z:3,wave:5,hp:87,maxHp:100,
  elapsed:510,waveTime:90,toSpawn:0,spawnClock:25,score:8400,kills:112,
  pulseMax:3,pulse:1,enemies:[],pickups:[],ruptured:[],
  guardianPending:0,guardianDefeated:[1,3,4],heartPhase:3,
  immune:{heat:0,cooldown:30,warning:0,pending:'',responses:0,guardianStages:[],quiet:0}
 })),SAVE);
 await page.reload();await page.locator('#resumeSaved').click();
 await expect.poll(()=>page.evaluate(()=>window.__MEAT_QA__()?.mode),{timeout:15000}).toBe('won');
 await expect(page.locator('#resultTitle')).toContainText('СЕРДЦЕ РАЗОРВАНО');
 await expect(page.locator('#resultBody')).toContainText('АРХИВ: +');
 const result=await page.evaluate(({key,a})=>({
   save:localStorage.getItem(key),
   archive:JSON.parse(localStorage.getItem(a))
 }),{key:SAVE,a:ARCHIVE});
 expect(result.save).toBeNull();
 expect(result.archive.history.at(-1).victory).toBe(true);
 expect(result.archive.history.at(-1).wave).toBe(5);
 await test.info().attach('campaign-victory',{body:await page.screenshot(),contentType:'image/png'});
 await page.locator('#menuResult').click();
 await expect(page.locator('#startBtn')).toBeVisible();
 await expect(page.locator('#resumeSaved')).toBeHidden();
 await page.locator('#startBtn').click();
 await expect(page.locator('#hud')).toBeVisible();
 expect(await page.evaluate(()=>window.__MEAT_QA__().wave)).toBe(1);
 expect(errors).toEqual([]);
});

test('live renderer keeps bounded allocations and responsive pause during extended gameplay',async({page,isMobile})=>{
 const seconds=process.env.MEAT_GPU_SOAK==='1'?600:12;
 test.setTimeout(seconds*1000+100000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/meat-exe/');
 await page.locator('#startBtn').click();
 await expect(page.locator('#hud')).toBeVisible();
 const checkpoints=[];
 for(let i=0;i<Math.ceil(seconds/3);i++){
  if(!isMobile){
   await page.keyboard.down(i%2?'d':'w');
   await page.waitForTimeout(Math.min(3000,seconds*1000-i*3000));
   await page.keyboard.up(i%2?'d':'w');
  }else await page.waitForTimeout(Math.min(3000,seconds*1000-i*3000));
  const sample=await page.evaluate(()=>window.__MEAT_QA__().runtime);
  expect(sample.budget.ok,JSON.stringify(sample)).toBe(true);
  expect(sample.visibleChunks).toBeLessThanOrEqual(9);
  expect(sample.instancedLive).toBeGreaterThanOrEqual(0);
  checkpoints.push({visibleChunks:sample.visibleChunks,instancedLive:sample.instancedLive,
    gpuGeometries:sample.gpuGeometries,measuredFps:sample.measuredFps});
  if(await page.locator('#result').isVisible())break;
 }
 await test.info().attach('runtime-budget',{body:JSON.stringify(checkpoints,null,2),contentType:'application/json'});
 if(await page.locator('#hud').isVisible()){
  if(isMobile)await page.locator('#pauseBtn').click();else await page.keyboard.press('Escape');
  await expect(page.locator('#pauseMenu')).toBeVisible();
 }
 expect(errors).toEqual([]);
});
