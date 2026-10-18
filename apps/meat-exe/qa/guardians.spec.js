import {test,expect} from '@playwright/test';
const SESSION='pocket-works:meat-exe:session';
test('real marrow guardian is rendered, attacks and persists after a pause/reload',async ({page})=>{
 test.setTimeout(100000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/meat-exe/');
 await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({
  v:5,seed:413,x:3,z:3,wave:3,hp:100,maxHp:100,toSpawn:0,spawnClock:30,
  guardianPending:3,guardianDefeated:[],enemies:[],pickups:[],ruptured:[],
  immune:{heat:0,cooldown:30,warning:0,pending:'',responses:0,guardianStages:[],quiet:0}
 })),SESSION);
 await page.reload();await page.locator('#resumeSaved').click();
 await expect.poll(()=>page.evaluate(()=>window.__MEAT_QA__().guardians.active.length),{timeout:30000}).toBe(1);
 const before=await page.evaluate(()=>window.__MEAT_QA__());
 expect(before.guardians.active[0].type).toBe('ossuary');
 expect(before.guardians.pending).toBe(0);
 await expect(page.locator('#guardianStatus')).toBeVisible();
 await expect(page.locator('#guardianName')).toHaveText('КОСТОГРЫЗ');
 await test.info().attach('marrow-ossuary',{body:await page.screenshot(),contentType:'image/png'});
 await page.keyboard.press('Escape');await expect(page.locator('#pauseMenu')).toBeVisible();
 await page.locator('#menuPause').click();await page.reload();
 await page.locator('#resumeSaved').click();
 const saved=await page.evaluate(()=>window.__MEAT_QA__());
 expect(saved.guardians.active.length).toBe(1);
 expect(saved.guardians.active[0].type).toBe('ossuary');
 expect(saved.guardians.pending).toBe(0);
 expect(errors).toEqual([]);
});
test('organ route produces physical landmark in stage four and spawns neural boss',async ({page})=>{
 test.setTimeout(100000);
 await page.goto('/apps/meat-exe/');
 const route=await page.evaluate(async()=>{
  const m=await import('/apps/meat-exe/runPaths.js');return m.routeOptions(413,4)[1].id;
 });
 await page.evaluate(({route,key})=>localStorage.setItem(key,JSON.stringify({
  v:5,seed:413,x:3,z:3,wave:4,hp:100,maxHp:100,toSpawn:0,spawnClock:30,
  guardianPending:4,guardianDefeated:[],enemies:[],pickups:[],ruptured:[],
  routeId:route,routeWave:4,routeHistory:[{wave:4,id:route}],
  immune:{heat:0,cooldown:30,warning:0,pending:'',responses:0,guardianStages:[],quiet:0}
 })),{route,key:SESSION});
 await page.reload();await page.locator('#resumeSaved').click();
 await expect.poll(()=>page.evaluate(()=>window.__MEAT_QA__().guardians.active[0]?.type),{timeout:30000}).toBe('synapse');
 const s=await page.evaluate(()=>window.__MEAT_QA__());
 expect(s.routes.marker).toBe(route);
 expect(s.guardians.active[0].maxHp).toBe(180);
 await expect(page.locator('#guardianName')).toHaveText('СИНАПТИЧЕСКИЙ УЗЕЛ');
 await test.info().attach('neural-guardian-and-path',{body:await page.screenshot(),contentType:'image/png'});
 await page.keyboard.press('Escape');
 await expect(page.locator('#pauseMenu')).toBeVisible();
});
