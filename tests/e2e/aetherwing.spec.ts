import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { attachCriticalScreenshot, monitorUnexpectedBrowserOutput } from './helpers';

type AetherwingState={
  loadingState?:string;started?:boolean;dragonReady?:boolean;usedFallback?:boolean;animationGroups?:number;boneCount?:number;chunks?:number;fauna?:number;mode?:string;speed?:number;altitude?:number;pitch?:number;roll?:number;quality?:number;assetErrors?:string[];
};

async function state(page:Page){return page.evaluate(()=>((window as any).__AI_TEST_STATE__??null) as AetherwingState|null);}
async function holdStick(page:Page,dx:number,dy:number,ms:number){
  const viewport=page.viewportSize();expect(viewport).not.toBeNull();
  const start={x:Math.round(viewport!.width*.22),y:Math.round(viewport!.height*.68)};
  const end={x:start.x+Math.round(dx*viewport!.width*.12),y:start.y+Math.round(dy*viewport!.height*.22)};
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:3});await page.waitForTimeout(ms);await page.mouse.up();await page.waitForTimeout(250);
}
async function snap(page:Page,testInfo:TestInfo,name:string){await attachCriticalScreenshot(page,testInfo,name,{fullPage:false});}

test.describe('AETHERWING flight journey',()=>{
  test('loads authored dragon and exercises the major flight states',async({page},testInfo)=>{
    test.skip(!testInfo.project.name.includes('landscape'),'AETHERWING is landscape-first.');
    test.setTimeout(105_000);
    const monitor=monitorUnexpectedBrowserOutput(page);
    const response=await page.goto('/apps/aetherwing/',{waitUntil:'domcontentloaded'});expect(response?.status()??500).toBeLessThan(400);
    await page.waitForFunction(()=>{const s=(window as any).__AI_TEST_STATE__;return s?.loadingState==='awaiting-start';},undefined,{timeout:30_000});
    const loaded=await state(page);expect(loaded?.dragonReady).toBe(true);expect(loaded?.usedFallback,'Blender dragon unexpectedly fell back to primitive runtime geometry').toBe(false);expect(loaded?.animationGroups??0).toBeGreaterThanOrEqual(5);expect(loaded?.boneCount??0).toBeGreaterThanOrEqual(20);expect(loaded?.fauna??0).toBeGreaterThanOrEqual(20);expect(loaded?.assetErrors??[]).toEqual([]);
    await page.locator('#startBtn').click();
    await page.waitForFunction(()=>{const s=(window as any).__AI_TEST_STATE__;return s?.loadingState==='flying'&&s?.started===true;},undefined,{timeout:8_000});
    await page.waitForFunction(()=>{const s=(window as any).__AI_TEST_STATE__;return (s?.chunks??0)>=9;},undefined,{timeout:10_000});
    await page.waitForTimeout(450);
    const glide=await state(page);expect(glide?.speed??0).toBeGreaterThan(12);expect(glide?.altitude??0).toBeGreaterThan(8);expect(glide?.chunks??0).toBeGreaterThanOrEqual(9);await snap(page,testInfo,'aetherwing-glide-default');

    await holdStick(page,0,-1,3000);
    const climb=await state(page);expect(climb?.pitch??-1).toBeGreaterThan(.08);expect(['climb','flap','glide']).toContain(climb?.mode);await snap(page,testInfo,'aetherwing-climb');

    const beforeDive=climb?.speed??0;await holdStick(page,0,1,4200);
    const dive=await state(page);expect(dive?.pitch??1).toBeLessThan(-.18);expect(dive?.mode).toBe('dive');expect(dive?.speed??0).toBeGreaterThan(Math.max(18,beforeDive*.92));await snap(page,testInfo,'aetherwing-dive');

    await holdStick(page,-1,0,2600);
    const bank=await state(page);expect(Math.abs(bank?.roll??0)).toBeGreaterThan(.12);await snap(page,testInfo,'aetherwing-bank');

    const viewport=page.viewportSize()!;const bx=Math.round(viewport.width*.80),by=Math.round(viewport.height*.70);await page.touchscreen.tap(bx,by);await page.waitForTimeout(110);await page.touchscreen.tap(bx,by);await page.waitForTimeout(220);
    const brake=await state(page);expect(brake?.mode).toBe('brake');await snap(page,testInfo,'aetherwing-brake');

    await testInfo.attach('aetherwing-flight-state',{body:Buffer.from(`${JSON.stringify({loaded,glide,climb,dive,bank,brake},null,2)}\n`,'utf8'),contentType:'application/json'});
    monitor.assertClean();
  });
});
