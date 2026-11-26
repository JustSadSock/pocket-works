// Execute production Canvas rendering in real browsers before expensive DEM.
import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const output=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/atlas-integration';mkdirSync(output,{recursive:true});
const results=[],save=()=>writeFileSync(join(output,'urban-render-preflight.json'),JSON.stringify(results,null,2));
const url='http://127.0.0.1:4211/apps/crown-and-marches/',server=spawn(process.execPath,['scripts/serve-site.mjs'],{env:{...process.env,PORT:'4211',POCKET_WORKS_SITE_ROOT:process.env.PW_QA_SITE_ROOT||process.cwd()},stdio:'ignore'});
try{
 let ready=false;for(let i=0;i<50;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,'urban preflight site unavailable');
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
  let browser,page;const errors=[],start=Date.now();
  try{
   browser=await type.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
   page=await browser.newPage({viewport:{width:820,height:820},serviceWorkers:'block'});page.on('pageerror',e=>errors.push(String(e.stack||e)));
   await page.route(url+'urban-render-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0;background:#b1b99b}</style><canvas id="fixture" width="800" height="800"></canvas>'}));
   await page.goto(url+'urban-render-fixture');
   const result=await page.evaluate(async()=>{
    const {composeHumanGeography,humanArchitectureSheet}=await import('./atlas-human-geography.mjs'),{urbanRenderFixture}=await import('./atlas-urban-render-fixture.mjs'),{s,opts,cam,receipt}=urbanRenderFixture(),canvas=document.querySelector('#fixture'),c=canvas.getContext('2d');
    c.scale(cam.s,cam.s);const first=composeHumanGeography(c,s,cam,opts,receipt);
    const bytes=c.getImageData(0,0,canvas.width,canvas.height).data;let pixels=0;for(let i=3;i<bytes.length;i+=4)if(bytes[i])pixels++;
    s.day++;const repeat=composeHumanGeography(c,s,cam,opts,receipt);
    s.cities[0].fort++;const construction=composeHumanGeography(c,s,cam,opts,receipt);
    const sheet=humanArchitectureSheet();sheet.id='sheet';document.body.append(sheet);
    return {first,repeat,construction,pixels,sheet:[sheet.width,sheet.height]};
   });
   const f=result.first;assert.ok(f.plans.some(p=>p.courtyards>0),'courtyard branch not exercised');assert.ok(f.fields>0,'field branch not exercised');assert.ok(f.buildings>0&&f.spriteBuilds>0,'sprite branch not exercised');assert.ok(f.roads>0&&f.roadEdges.length>0,'road branch not exercised');assert.ok(f.bridgeEdges.some(e=>e.continuous&&e.spans>0),'bridge branch not exercised');assert.ok(f.plans.some(p=>p.walls>0),'wall branch not exercised');assert.ok(f.piers>0,'pier branch not exercised');assert.ok(result.pixels>100,'no pixels rendered');assert.ok(result.repeat.reused&&result.repeat.layoutMs===0&&result.repeat.drawMs===0,'calendar-only change invalidated layer');assert.ok(!result.construction.reused,'same-day construction failed to invalidate');assert.deepEqual(result.sheet,[1200,760]);assert.deepEqual(errors,[]);
   await page.locator('#fixture').screenshot({path:join(output,engine+'-urban-render-fixture.png')});await page.locator('#sheet').screenshot({path:join(output,engine+'-urban-render-sheet.png')});results.push({engine,passed:true,ms:Date.now()-start,...result});
  }catch(e){await page?.screenshot({path:join(output,engine+'-urban-render-failure.png')}).catch(()=>{});results.push({engine,passed:false,ms:Date.now()-start,error:String(e.stack||e),errors});}finally{await browser?.close();save();}
 }
 assert.ok(results.length===2&&results.every(x=>x.passed),'Urban Canvas preflight failed; expensive QA not started');
}finally{server.kill('SIGTERM');save();}
