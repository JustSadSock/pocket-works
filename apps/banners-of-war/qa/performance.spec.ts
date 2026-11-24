import {test,expect} from '@playwright/test';
test('browser performance: 26, 40, 60 and 100 regiments',async({page},info)=>{
 test.setTimeout(150000);const results=[];await page.goto('/apps/banners-of-war/');
 for(const count of [26,40,60,100]){
 await page.evaluate(async count=>{const {E}=await import('/apps/banners-of-war/engine.js');const kinds=['spear','sword','pike','archer','knight','crossbow','lightHorse','horseArcher'],n=count/2-1,roster=Array.from({length:n},(_,i)=>kinds[i%kinds.length]),s=E.create('Browser Bench',roster,roster,'adaptive','valley');s.aiVersion=4;s.difficulty='commander';for(const u of s.units){let i=u.id%100;u.x=(u.side?735:665)+(u.side?1:-1)*Math.floor(i/16)*70;u.y=65+(i%16)*49;}localStorage.setItem('pocket-works:banners-of-war:battle:1',JSON.stringify({format:3,state:s,orders:{},history:[],phase:'plan',observer:true,paletteAlt:false}))},count);
 await page.reload();await page.locator('#resume').click();await page.locator('#focus').click();
 await page.evaluate(()=>{performance.clearMeasures('banners:render');performance.clearMeasures('banners:round');performance.clearMeasures('banners:simulation')});let start=Date.now();await page.locator('#confirm').click();await page.locator('#confirm').click();let submitLatency=Date.now()-start;await expect(page.locator('#playback')).toBeVisible({timeout:45000});
 await page.locator('#speed').selectOption('8');let frameTimes=await page.evaluate(()=>new Promise<number[]>(resolve=>{let v:number[]=[],last=performance.now();const tick=(now:number)=>{v.push(now-last);last=now;if(v.length<36)requestAnimationFrame(tick);else resolve(v.slice(1))};requestAnimationFrame(tick)}));
 const data=await page.evaluate(()=>{let get=(n:string)=>performance.getEntriesByName(n).map(x=>x.duration),memory=(performance as any).memory;return {round:get('banners:round').at(-1),simulation:get('banners:simulation').at(-1),render:get('banners:render'),geography:get('banners:geography'),heapBytes:memory?.usedJSHeapSize??null}});
 const mean=(a:number[])=>a.reduce((s,n)=>s+n,0)/Math.max(1,a.length),p95=(a:number[])=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length*.95)]??null;
 expect(data.round).toBeGreaterThan(0);expect(data.simulation).toBeGreaterThan(0);expect(data.render.length).toBeGreaterThan(5);
 let result={count,viewport:page.viewportSize(),submitLatency,roundMs:data.round,simulationMs:data.simulation,renderMean:mean(data.render),renderP95:p95(data.render),frameMean:mean(frameTimes),frameP95:p95(frameTimes),geographyMean:mean(data.geography),heapBytes:data.heapBytes};results.push(result);console.log('BANNERS_PERF '+JSON.stringify(result));await info.attach('banners-perf-'+count+'.json',{body:JSON.stringify(result),contentType:'application/json'});await page.locator('#skip').click();
 }
 await info.attach('living-browser-performance.json',{body:JSON.stringify(results,null,2),contentType:'application/json'});
});
