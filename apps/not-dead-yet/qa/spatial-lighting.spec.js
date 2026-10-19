import {test,expect} from '@playwright/test';
const origin='/apps/not-dead-yet/?qa=1';
test('five new apartment variants render physical alcoves and fixture-bound lights',async({page})=>{
 test.setTimeout(135000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__PW_ROGUE_QA__?.startSeed&&window.__PW_TEST_STATE__?.renderer3D,{timeout:25000});
 const families=new Set();
 for(const seed of [222,413,8787,4,14]){
  const report=await page.evaluate(seed=>{
   const api=window.__PW_ROGUE_QA__;
   api.startSeed(seed);
   const c=api.world().chunk(0,0),stats=api.visual().renderer;
   return{version:api.world().layoutVersion,family:c.layoutName,
    alcoves:c.alcoves?.length||0,lights:stats?.fixturePositions||[],
    occludedCells:stats?.occludedCells,lightMaskUploads:stats?.lightMaskUploads}
  },seed);
  expect(report.version).toBe(3);
  expect(report.alcoves).toBeGreaterThanOrEqual(2);
  families.add(report.family);
  // Leave a render frame between changing the deterministic seed and
  // reading GPU-backed upload telemetry. There is no artificial lightmap.
  await page.waitForTimeout(200);
  const metrics=await page.evaluate(()=>window.__PW_ROGUE_QA__.visual().renderer);
  expect(metrics.lightMaskUploads).toBeGreaterThan(0);
  expect(metrics.fixturePositions).toHaveLength(2);
  expect(metrics.occludedCells).toBeGreaterThan(0);
  expect(metrics.occludedCells).toBeLessThan(48*48);
  await page.screenshot({path:test.info().outputPath(`new-architecture-${seed}.png`),animations:'disabled'})
 }
 expect(families.size).toBe(5);
 expect(errors).toEqual([])
});
test('light mask changes when a physical door opens',async({page})=>{
 test.setTimeout(90000);
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__PW_ROGUE_QA__?.startSeed&&window.__PW_TEST_STATE__?.renderer3D,{timeout:25000});
 const initial=await page.evaluate(()=>{
  const api=window.__PW_ROGUE_QA__;api.startSeed(222);
  const w=api.world(),c=w.chunk(0,0),door=c.doors.find(d=>!w.doorState(d,c).open);
  return door?{x:door.x,z:door.z,id:door.id}:null
 });
 expect(initial).not.toBeNull();
 await page.waitForFunction(()=>window.__PW_ROGUE_QA__.visual().renderer.lightMaskUploads>0);
 const before=await page.evaluate(()=>window.__PW_ROGUE_QA__.visual().renderer.lightMaskUploads);
 const status=await page.evaluate(d=>{
  const api=window.__PW_ROGUE_QA__,w=api.world(),c=w.chunk(0,0);
  const door=c.doors.find(item=>item.x===d.x&&item.z===d.z&&item.id===d.id);
  const result=w.toggleDoor(door,[]);
  // Visual-QA mode freezes gameplay time for pixel reproducibility.
  // Advance the same physical hinge model explicitly to its open threshold.
  for(let i=0;i<9;i++)w.animateDoors(.12,[]);
  return result
 },initial);
 expect(status.ok).toBe(true);
 await page.waitForFunction(old=>window.__PW_ROGUE_QA__.visual().renderer.lightMaskUploads>old,before,{timeout:10000});
 const out=await page.evaluate(()=>window.__PW_ROGUE_QA__.visual().renderer);
 expect(out.fixturePositions).toHaveLength(2)
});
