import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const url='/apps/banners-of-war/research/orthographic-art/';
test('orthographic atlas preparation and visible Canvas frame cost',async({page},info)=>{
 test.skip(info.project.name==='desktop-chromium','Mobile viewport benchmark');test.setTimeout(240000);await page.goto(url);await page.waitForFunction(()=>!!(window as any).orthoQA,{},{timeout:150000});const data:any[]=[];for(let n of [20,60,100,158]){let r=await page.evaluate(n=>(window as any).orthoQA.benchmark(n),n);data.push(r);await writeFile(info.outputPath('orthographic-performance.json'),JSON.stringify(data,null,2));expect(r.count).toBe(n);expect(r.fps).toBeGreaterThan(0);expect(r.p95).toBeLessThan(1000)}// 30 FPS target is recorded, not silently declared achieved.
});
