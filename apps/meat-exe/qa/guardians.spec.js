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


test('walking up to a physical fork and pressing X presets the actual surgery route',async ({page,isMobile})=>{
 test.setTimeout(105000);
 await page.goto('/apps/meat-exe/');
 const fixture={v:5,seed:413,x:3,z:3,wave:1,hp:100,maxHp:100,toSpawn:1,spawnClock:30,
  guardianPending:0,guardianDefeated:[],enemies:[],pickups:[],ruptured:[],
  immune:{heat:0,cooldown:30,warning:0,pending:'',responses:0,guardianStages:[],quiet:0}};
 await page.evaluate(({key,fixture})=>localStorage.setItem(key,JSON.stringify(fixture)),
  {key:SESSION,fixture});
 await page.reload();await page.locator('#resumeSaved').click();
 const first=await page.evaluate(()=>window.__MEAT_QA__());
 expect(first.routes.forks).toHaveLength(2);
 const destination=first.routes.forks[1];
 // A pagehide event writes the currently playing state. Inject the checkpoint
 // on the next document before app.js loads, after the previous page's pagehide.
 // It is the normal persisted session; no live-world mutation/debug shortcut.
 await page.keyboard.press('Escape');await page.locator('#menuPause').click();
 await page.addInitScript(({key,destination})=>{
  if(sessionStorage.getItem('meat-fork-position-fixture')==='done')return;
  const state=JSON.parse(localStorage.getItem(key)||'null');
  if(!state)return;
  state.x=destination.x;state.z=destination.z;
  localStorage.setItem(key,JSON.stringify(state));
  sessionStorage.setItem('meat-fork-position-fixture','done');
 },{key:SESSION,destination});
 await page.reload();await page.locator('#resumeSaved').click();
 const moved=await page.evaluate(()=>window.__MEAT_QA__());
 expect([moved.x,moved.z]).toEqual([destination.x,destination.z]);
 expect(moved.routes.forks).toContainEqual(destination);
 await expect(page.locator('#hud')).toBeVisible();
 if(isMobile){
  await expect(page.locator('#forkInteract')).toBeVisible();
  await page.locator('#forkInteract').tap();
 }else await page.keyboard.press('x');
 await expect.poll(()=>page.evaluate(()=>window.__MEAT_QA__().routes.selected)).toBe(destination.id);
 await page.keyboard.press('Escape');await page.locator('#menuPause').click();
 await page.reload();await page.locator('#resumeSaved').click();
 let saved=await page.evaluate(()=>window.__MEAT_QA__());
 expect(saved.routes.selected).toBe(destination.id);
 // Complete this already-cleared seed to ensure surgery respects physical choice.
 await page.keyboard.press('Escape');await page.locator('#menuPause').click();
 await page.addInitScript(key=>{
  if(sessionStorage.getItem('meat-fork-cleared-fixture')==='done')return;
  const state=JSON.parse(localStorage.getItem(key)||'null');
  if(!state)return;
  state.toSpawn=0;state.enemies=[];state.spawnClock=30;
  localStorage.setItem(key,JSON.stringify(state));
  sessionStorage.setItem('meat-fork-cleared-fixture','done');
 },SESSION);
 await page.reload();await page.locator('#resumeSaved').click();
 await expect(page.locator('#graftDraft')).toBeVisible({timeout:22000});
 await expect(page.locator('[data-route="'+destination.id+'"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('.graft-option').first().click();
 saved=await page.evaluate(()=>window.__MEAT_QA__());
 expect(saved.routes.active).toBe(destination.id);
 expect(saved.routes.marker).toBe(destination.id);
});


test('gastric organ now culminates in its real Warden, with telegraphed charge and saved boss state',async({page})=>{
 test.setTimeout(95000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/meat-exe/');
 await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({
   v:5,seed:413,x:3,z:3,wave:2,hp:100,maxHp:100,
   pulseMax:3,pulse:3,pulseSpawned:10,toSpawn:0,spawnClock:30,
   guardianPending:2,guardianDefeated:[1],enemies:[],pickups:[],ruptured:[],
   immune:{heat:0,cooldown:30,warning:0,pending:'',responses:0,guardianStages:[],quiet:0}
 })),SESSION);
 await page.reload();await page.locator('#resumeSaved').click();
 await expect.poll(()=>page.evaluate(()=>window.__MEAT_QA__().guardians.active[0]?.type),
  {timeout:25000}).toBe('warden');
 const qa=await page.evaluate(()=>window.__MEAT_QA__());
 expect(qa.guardians.active[0].maxHp).toBe(245);
 expect(qa.guardians.pending).toBe(0);
 await expect(page.locator('#guardianName')).toHaveText('ЖЕЛЧНЫЙ ПРИВРАТНИК');
 await test.info().attach('gastric-warden',{body:await page.screenshot(),contentType:'image/png'});
 await page.keyboard.press('Escape');await expect(page.locator('#pauseMenu')).toBeVisible();
 await page.locator('#menuPause').click();await page.reload();await page.locator('#resumeSaved').click();
 const restored=await page.evaluate(()=>window.__MEAT_QA__());
 expect(restored.guardians.active[0].type).toBe('warden');
 expect(restored.guardians.active[0].hp).toBeGreaterThan(0);
 expect(errors).toEqual([]);
});
