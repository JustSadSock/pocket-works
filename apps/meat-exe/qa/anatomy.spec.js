import {test,expect} from '@playwright/test';

test('living organ loads, procedural tissue state survives pause, refresh and resume',async ({page,isMobile})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/apps/meat-exe/');
 await page.locator('#startBtn').click();
 await expect(page.locator('#hud')).toBeVisible();
 let run=await page.evaluate(()=>window.__MEAT_QA__?.());
 expect(run.anatomy).toBeDefined();expect(run.anatomy.ruptures).toBe(0);
 expect(run.anatomy.immuneHeat).toBe(0);
 if(isMobile)await page.locator('#fireBtn').tap();
 else await page.locator('#stage').click({position:{x:350,y:250}});
 await expect.poll(()=>page.evaluate(()=>window.__MEAT_QA__?.().combat.shotsFired)).toBeGreaterThan(0);
 if(isMobile)await page.locator('#pauseBtn').click();
 else await page.keyboard.press('Escape');
 await expect(page.locator('#pauseMenu')).toBeVisible();
 await page.locator('#menuPause').click();
 await expect(page.locator('#resumeSaved')).toBeVisible();
 await page.reload();
 await expect(page.locator('#resumeSaved')).toBeVisible();
 await page.locator('#resumeSaved').click();
 run=await page.evaluate(()=>window.__MEAT_QA__?.());
 expect(run.mode).toBe('playing');expect(run.anatomy).toBeDefined();
 expect(errors).toEqual([]);
});

// A real end-to-end rupture: saved camera positioned next to a deterministic valve.
// No debug mutation of live simulation; all damage happens through player controls.
test('shooting a gland opens its corridor and the rupture persists',async ({page,isMobile,browserName})=>{
  test.setTimeout(90000);
  await page.goto('/apps/meat-exe/');
  const fixture=await page.evaluate(async()=>{
    const g=await import('/apps/meat-exe/organGen.js');
    for(let seed=2026;seed<2070;seed++){
      g.setSeed(seed);
      const node=g.getTissueNodes(0,0)[0];if(!node)continue;
      const open=new Set(g.generateOrgan(0,0).map(c=>c.x+','+c.y));
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const x=node.x+dx,z=node.z+dz;
        if(!open.has(x+','+z))continue;
        return {v:3,seed,x,z,yaw:Math.atan2(x-node.x,z-node.z),pitch:0,
          hp:100,maxHp:100,wave:1,toSpawn:0,score:0,ruptured:[],ruptureCount:0,
          enemies:[],pickups:[],immuneHeat:0,immuneDelay:0};
      }
    }
    return null;
  });
  expect(fixture).not.toBeNull();
  await page.evaluate(s=>localStorage.setItem('pocket-works:meat-exe:session',JSON.stringify(s)),fixture);
  await page.reload();
  await expect(page.locator('#resumeSaved')).toBeVisible();
  await page.locator('#resumeSaved').click();
  await expect(page.locator('#hud')).toBeVisible();
  if(isMobile){
    for(let i=0;i<5;i++){await page.locator('#fireBtn').tap();await page.waitForTimeout(270);}
  }else{
    await page.locator('#stage').click({position:{x:350,y:260}});
    await page.mouse.down();await page.waitForTimeout(1400);await page.mouse.up();
  }
  await expect.poll(()=>page.evaluate(()=>window.__MEAT_QA__?.().anatomy.ruptures),{timeout:18000}).toBeGreaterThan(0);
  const first=await page.evaluate(()=>window.__MEAT_QA__());
  expect(first.anatomy.immuneHeat).toBeGreaterThan(0);
  if(isMobile)await page.locator('#pauseBtn').click();
  else await page.keyboard.press('Escape');
  await expect(page.locator('#pauseMenu')).toBeVisible();
  await page.locator('#menuPause').click();
  await page.reload();
  await page.locator('#resumeSaved').click();
  const after=await page.evaluate(()=>window.__MEAT_QA__());
  expect(after.anatomy.ruptures).toBeGreaterThan(0);
});
