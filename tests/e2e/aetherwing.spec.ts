import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { attachCriticalScreenshot, monitorUnexpectedBrowserOutput } from './helpers';

type AetherwingState={
  loadingState?:string;started?:boolean;dragonReady?:boolean;usedFallback?:boolean;animationGroups?:number;boneCount?:number;authoredBiomeTemplates?:number;chunks?:number;fauna?:number;terrainMeshes?:number;waterMeshes?:number;riverMeshes?:number;materialsHealthy?:boolean;vegetationInstances?:number;treeInstances?:number;groundHeight?:number;brakeEvents?:number;lastGesture?:string;mode?:string;speed?:number;altitude?:number;pitch?:number;roll?:number;quality?:number;cameraDistance?:number;cameraGroundClearance?:number;assetErrors?:string[];
};

async function state(page:Page){return page.evaluate(()=>((window as any).__AI_TEST_STATE__??null) as AetherwingState|null);}
async function holdStick(page:Page,dx:number,dy:number,ms:number){
  const viewport=page.viewportSize();expect(viewport).not.toBeNull();
  const start={x:Math.round(viewport!.width*.22),y:Math.round(viewport!.height*.68)};
  const end={x:start.x+Math.round(dx*viewport!.width*.12),y:start.y+Math.round(dy*viewport!.height*.22)};
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:3});await page.waitForTimeout(ms);await page.mouse.up();await page.waitForTimeout(250);
}
async function snap(page:Page,testInfo:TestInfo,name:string){await attachCriticalScreenshot(page,testInfo,name,{fullPage:false});}
function expectCameraFramed(s:AetherwingState|null,label:string){expect(s?.cameraDistance??999,`${label}: chase camera lost the dragon`).toBeLessThan(26);expect(s?.cameraGroundClearance??-999,`${label}: chase camera intersected terrain`).toBeGreaterThan(1.25);}

test.describe('AETHERWING flight journey',()=>{
  test('loads authored dragon and exercises the major flight states',async({page},testInfo)=>{
    test.skip(!testInfo.project.name.includes('landscape'),'AETHERWING is landscape-first.');
    test.setTimeout(105_000);
    const monitor=monitorUnexpectedBrowserOutput(page);
    const response=await page.goto('/apps/aetherwing/',{waitUntil:'domcontentloaded'});expect(response?.status()??500).toBeLessThan(400);
    await page.waitForFunction(()=>{const s=(window as any).__AI_TEST_STATE__;return s?.loadingState==='awaiting-start';},undefined,{timeout:30_000});
    const loaded=await state(page);expect(loaded?.dragonReady).toBe(true);expect(loaded?.usedFallback,'Blender dragon unexpectedly fell back to primitive runtime geometry').toBe(false);expect(loaded?.animationGroups??0).toBeGreaterThanOrEqual(5);expect(loaded?.boneCount??0).toBeGreaterThanOrEqual(20);expect(loaded?.authoredBiomeTemplates??0,'Blender biome props did not load before the opening chunks were built').toBe(3);expect(loaded?.fauna??0).toBeGreaterThanOrEqual(20);expect(loaded?.assetErrors??[]).toEqual([]);
    await page.locator('#startBtn').click();
    await page.waitForFunction(()=>{const s=(window as any).__AI_TEST_STATE__;return s?.loadingState==='flying'&&s?.started===true;},undefined,{timeout:8_000});
    const sound=page.locator('#soundBtn');await expect(sound).toHaveText('SND ON');await sound.click();await expect(sound).toHaveText('SND OFF');await sound.click();await expect(sound).toHaveText('SND ON');
    await page.waitForFunction(()=>{const s=(window as any).__AI_TEST_STATE__;return (s?.chunks??0)>=9&&(s?.terrainMeshes??0)>=9&&(s?.vegetationInstances??0)>=300&&(s?.treeInstances??0)>=180;},undefined,{timeout:10_000});
    await page.waitForTimeout(450);
    const glide=await state(page);expect(glide?.speed??0).toBeGreaterThan(12);expect(glide?.altitude??0).toBeGreaterThan(8);expect(glide?.altitude??999).toBeLessThan(160);expect(glide?.chunks??0).toBeGreaterThanOrEqual(9);expect(glide?.terrainMeshes??0).toBeGreaterThanOrEqual(9);expect(glide?.riverMeshes??0,'opening river valley did not render a river mesh').toBeGreaterThan(0);expect(glide?.materialsHealthy).toBe(true);expect(glide?.vegetationInstances??0).toBeGreaterThanOrEqual(300);expect(glide?.treeInstances??0).toBeGreaterThanOrEqual(180);expectCameraFramed(glide,'glide');await snap(page,testInfo,'aetherwing-glide-default');

    await holdStick(page,0,-1,3000);
    const climb=await state(page);expect(climb?.pitch??-1).toBeGreaterThan(.08);expect(['climb','flap','glide']).toContain(climb?.mode);expect(climb?.materialsHealthy,'shared terrain/water material was disposed while crossing a chunk').toBe(true);expect(climb?.terrainMeshes??0).toBeGreaterThanOrEqual(9);expectCameraFramed(climb,'climb');await snap(page,testInfo,'aetherwing-climb');

    const beforeDive=climb?.speed??0;await holdStick(page,0,1,4200);
    const dive=await state(page);expect(dive?.pitch??1).toBeLessThan(-.18);expect(dive?.mode).toBe('dive');expect(dive?.speed??0,'dive did not convert altitude into speed').toBeGreaterThan(beforeDive+1.5);expect(dive?.materialsHealthy).toBe(true);expectCameraFramed(dive,'dive');await snap(page,testInfo,'aetherwing-dive');

    await holdStick(page,-1,0,2600);
    const bank=await state(page);expect(Math.abs(bank?.roll??0)).toBeGreaterThan(.12);expect(bank?.materialsHealthy).toBe(true);expectCameraFramed(bank,'bank');await snap(page,testInfo,'aetherwing-bank');

    const viewport=page.viewportSize()!;const bx=Math.round(viewport.width*.80),by=Math.round(viewport.height*.70);await page.touchscreen.tap(bx,by);await page.waitForTimeout(110);await page.touchscreen.tap(bx,by);await page.waitForTimeout(220);
    const brake=await state(page);expect(brake?.brakeEvents??0,'right-side tap did not reach the mobile input state').toBeGreaterThan(0);expect(brake?.lastGesture).toContain('brake');expect(brake?.mode).toBe('brake');expect(brake?.materialsHealthy).toBe(true);expect(brake?.terrainMeshes??0).toBeGreaterThanOrEqual(9);expectCameraFramed(brake,'brake');await snap(page,testInfo,'aetherwing-brake');

    await testInfo.attach('aetherwing-flight-state',{body:Buffer.from(`${JSON.stringify({loaded,glide,climb,dive,bank,brake},null,2)}\n`,'utf8'),contentType:'application/json'});
    monitor.assertClean();
  });
});
