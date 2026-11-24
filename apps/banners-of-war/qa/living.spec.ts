import {test,expect} from '@playwright/test';
test('Living Battlefield: four terrain choices, fog, sector overlays, three camera scales, offline save and replay',async({page,context},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/apps/banners-of-war/');
 await page.locator('#landscape').selectOption('ridge');await page.locator('#visibility').selectOption('fog');await page.locator('#objective').selectOption('territory');await page.locator('#start').click();
 await expect(page.locator('#phase')).toContainText('Развёртывание');await expect(page.locator('#red')).toContainText('в обзоре 0');await page.screenshot({path:info.outputPath('living-strategic.png')});
 await page.locator('#confirm').click();await page.locator('#plus').click();await page.locator('#plus').click();await page.screenshot({path:info.outputPath('living-tactical.png')});
 await page.locator('#focus').click();await page.waitForTimeout(120);await page.screenshot({path:info.outputPath('living-warriors.png')});
 await page.locator('#layer').selectOption('pressure');await page.locator('#layer').selectOption('contacts');await page.locator('#layer').selectOption('visibility');await page.waitForTimeout(150);await page.screenshot({path:info.outputPath('living-visibility.png')});
 await page.locator('#fit').click();await page.locator('#layer').selectOption('normal');await page.locator('#confirm').click();await page.locator('#confirm').click();await expect(page.locator('#playback')).toBeVisible({timeout:30000});await page.locator('#skip').click();await expect(page.locator('#round')).toContainText('2');
 await page.reload();await expect(page.locator('#resume')).toBeVisible();await page.locator('#resume').click();await expect(page.locator('#round')).toContainText('2');
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{},{timeout:15000});await context.setOffline(true);await page.reload();await expect(page.locator('#resume')).toBeVisible();await page.locator('#resume').click();await expect(page.locator('#round')).toContainText('2');await page.locator('#replay').click();await expect(page.locator('#playback')).toBeVisible({timeout:30000});await page.locator('#skip').click();await context.setOffline(false);
 expect(errors).toEqual([]);
});
test('browser performance: 26, 40, 60 and 100 regiments',async({page},info)=>{
 test.setTimeout(150000);const results=[];await page.goto('/apps/banners-of-war/');
 for(const count of [26,40,60,100]){
 await page.evaluate(async count=>{const {E}=await import('/apps/banners-of-war/engine.js');const kinds=['spear','sword','pike','archer','knight','crossbow','lightHorse','horseArcher'],n=count/2-1,roster=Array.from({length:n},(_,i)=>kinds[i%kinds.length]),s=E.create('Browser Bench',roster,roster,'adaptive','valley');for(const u of s.units){let i=u.id%100;u.x=(u.side?735:665)+(u.side?1:-1)*Math.floor(i/16)*70;u.y=65+(i%16)*49;}localStorage.setItem('pocket-works:banners-of-war:battle:1',JSON.stringify({format:3,state:s,orders:{},history:[],phase:'plan',observer:true,paletteAlt:false}))},count);
 await page.reload();await page.locator('#resume').click();await page.locator('#focus').click();
 await page.evaluate(()=>{performance.clearMeasures('banners:render');performance.clearMeasures('banners:round');performance.clearMeasures('banners:simulation')});let start=Date.now();await page.locator('#confirm').click();await page.locator('#confirm').click();let submitLatency=Date.now()-start;await expect(page.locator('#playback')).toBeVisible({timeout:45000});
 let frameTimes=await page.evaluate(()=>new Promise<number[]>(resolve=>{let v:number[]=[],last=performance.now();const tick=(now:number)=>{v.push(now-last);last=now;if(v.length<36)requestAnimationFrame(tick);else resolve(v.slice(1))};requestAnimationFrame(tick)}));
 const data=await page.evaluate(()=>{let get=(n:string)=>performance.getEntriesByName(n).map(x=>x.duration),memory=(performance as any).memory;return {round:get('banners:round').at(-1),simulation:get('banners:simulation').at(-1),render:get('banners:render'),heapBytes:memory?.usedJSHeapSize??null}});
 const mean=(a:number[])=>a.reduce((s,n)=>s+n,0)/Math.max(1,a.length),p95=(a:number[])=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length*.95)]??null;
 expect(data.round).toBeGreaterThan(0);expect(data.simulation).toBeGreaterThan(0);expect(data.render.length).toBeGreaterThan(5);
 results.push({count,viewport:page.viewportSize(),submitLatency,roundMs:data.round,simulationMs:data.simulation,renderMean:mean(data.render),renderP95:p95(data.render),frameMean:mean(frameTimes),frameP95:p95(frameTimes),heapBytes:data.heapBytes});await page.locator('#skip').click();
 }
 await info.attach('living-browser-performance.json',{body:JSON.stringify(results,null,2),contentType:'application/json'});
});
