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
 else await page.keyboard.press('f'); // the real keyboard fire path; combat.spec covers mouse capture
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
        return {v:5,seed,x,z,yaw:Math.atan2(x-node.x,z-node.z),pitch:0,targetId:node.id,
          // An earned late-run anti-membrane build makes one *real* hit sufficient.
          // Isolate rupture/save logic from CI software-WebGL continuous-fire stress.
          level:8,damageBonus:95,grafts:['rupture_gland'],
          hp:100,maxHp:100,wave:1,toSpawn:1,spawnClock:30,score:0,ruptured:[],ruptureCount:0,
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
  const live=await page.evaluate(()=>window.__MEAT_QA__());
  expect(live.seed).toBe(fixture.seed);
  expect(live.x).toBeCloseTo(fixture.x,2);
  expect(live.z).toBeCloseTo(fixture.z,2);
  expect(live.yaw).toBeCloseTo(fixture.yaw,3);
  if(isMobile){
    // Switch to the biological shotgun. Two central hits are enough; stop as
    // soon as the real in-game rupture is observed to avoid needless GPU stress.
    await page.locator('#weaponBtn').tap();
    await expect(page.locator('#weaponValue')).toContainText('МЯСОРУБКА');
    // One genuine mobile touch resolves an upgraded membrane-breaking hit.
    await page.locator('#fireBtn').tap();
  }else{
    // A real keyboard-fire control prevents initial pointer-lock mouse motion
    // from rotating away from the gate between click and first shot.
    await page.keyboard.press('f');
  }
  await expect.poll(()=>page.evaluate(()=>window.__MEAT_QA__?.().anatomy.ruptures),{timeout:6000}).toBeGreaterThan(0);
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
