import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const url='/apps/banners-of-war/research/vertical-slice/';
const budgetMs=20000,watchdogMs=30000;
for(const backend of ['canvas','canvas-legacy','webgl'])test('bounded renderer diagnostic: '+backend,async({page},info)=>{
 test.skip(info.project.name==='desktop-chromium','Mobile renderer comparison only');
 test.setTimeout(145000);
 await page.goto(url);await page.waitForFunction(()=>!!(window as any).sliceQA);await page.locator('#start').click();
 const rows:any[]=[];const save=()=>writeFile(info.outputPath('renderer-diagnostic.json'),JSON.stringify({backend,browser:info.project.name,budgetMs,watchdogMs,rows},null,2));
 for(const count of [20,60,100,158]){
  let timer:ReturnType<typeof setTimeout>|undefined;
  const entry:any={count,status:'started'};rows.push(entry);await save();
  try{
   const result:any=await Promise.race([page.evaluate(({count,backend,budgetMs})=>(window as any).sliceQA.benchmark(count,{selection:backend,frameLimit:12,budgetMs}),{count,backend,budgetMs}),new Promise(resolve=>{timer=setTimeout(()=>resolve({watchdog:true}),watchdogMs)})]);
   if(result.watchdog){entry.status='watchdog-timeout';await save();break}
   entry.status=!result.completed?'budget-exceeded':!result.backends[0]?.supported?'unsupported':'completed';entry.result=result;await save();
   if(entry.status!=='completed')break;
   expect(result.count).toBe(count);expect(result.results.length).toBe(3);
   for(const z of result.results){expect(z.modes.length).toBe(3);for(const m of z.modes)expect(Number.isFinite(m.fps)&&m.fps>0&&m.visible>0).toBe(true)}
  }catch(error){entry.status='error';entry.error=String(error);await save();throw error}
  finally{if(timer)clearTimeout(timer)}
 }
 for(const count of [20,60,100,158])if(!rows.some(r=>r.count===count))rows.push({count,status:'not-run-after-limit-or-unsupported'});
 await save();
});
