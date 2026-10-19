import {test,expect} from '@playwright/test';
const store='pocket-works:meat-exe:session';
test('a genuine gastric 3D chamber renders and shows warned guardian',async ({page})=>{
 test.setTimeout(90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/meat-exe/');
 const saved={v:5,seed:413,x:3,z:3,wave:2,hp:100,maxHp:100,toSpawn:1,spawnClock:30,
  enemies:[],pickups:[],ruptured:[],immune:{heat:88,cooldown:0,warning:0,pending:'',responses:0,guardianStages:[],quiet:0}};
 await page.evaluate(({store,saved})=>localStorage.setItem(store,JSON.stringify(saved)),{store,saved});
 await page.reload();await page.locator('#resumeSaved').click();
 await expect(page.locator('#hud')).toBeVisible();
 await expect(page.locator('#zoneValue')).toHaveText('ЖЕЛУДОК');
 let world=await page.evaluate(()=>window.__MEAT_QA__());
 expect(world.biome).toBe('gastric');expect(world.worldStage).toBe(2);
 const art=await page.evaluate(async()=>{
  const g=await import('/apps/meat-exe/gastricArt.js');
  return g.gastricChamber(0,0,413).type;
 });
 expect(art).toBe('pylorus');
 await test.info().attach('gastric-pylorus-room',{body:await page.screenshot(),contentType:'image/png'});
 await expect.poll(()=>page.evaluate(()=>window.__MEAT_QA__()?.immunity.responses),{timeout:28000}).toBeGreaterThan(0);
 world=await page.evaluate(()=>window.__MEAT_QA__());
 expect(world.immunity.guardianStages).toContain(2);
 expect(world.ecology.enemies.some(e=>e.type==='warden')).toBe(true);
 await test.info().attach('gastric-guardian',{body:await page.screenshot(),contentType:'image/png'});
 // Keyboard pause does not wait for canvas mouse pointer-lock stability.
 await page.keyboard.press('Escape');
 await expect(page.locator('#pauseMenu')).toBeVisible();
 await page.locator('#menuPause').click();await page.reload();
 await page.locator('#resumeSaved').click();
 world=await page.evaluate(()=>window.__MEAT_QA__());
 expect(world.immunity.guardianStages).toContain(2);
 expect(world.ecology.enemies.some(e=>e.type==='warden')).toBe(true);
 expect(errors).toEqual([]);
});
