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
    const {composeHumanGeography,humanArchitectureSheet}=await import('./atlas-human-geography.mjs'),{urbanRenderFixture}=await import('./atlas-urban-render-fixture.mjs'),canvas=document.querySelector('#fixture'),c=canvas.getContext('2d'),results=[];
    for(const candidate of ['cultural','historical','organic']){const {s,opts,cam,receipt}=urbanRenderFixture();opts.candidate=candidate;opts.terrain={fixture:true};receipt.revision='fixture';receipt.tilt=.28;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,canvas.width,canvas.height);
    c.scale(cam.s,cam.s);const first=composeHumanGeography(c,s,cam,opts,receipt);
    const bytes=c.getImageData(0,0,canvas.width,canvas.height).data;let pixels=0;for(let i=3;i<bytes.length;i+=4)if(bytes[i])pixels++;
    s.day++;c.save();c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,canvas.width,canvas.height);c.restore();const repeat=composeHumanGeography(c,s,cam,opts,receipt);let motion=null;if(candidate!=='cultural'){c.setTransform(cam.s,0,0,cam.s,12,8);c.save();c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,canvas.width,canvas.height);c.restore();const moved=composeHumanGeography(c,s,{...cam,ox:12,oy:8},opts,{...receipt,key:'fixture-pan'}),image=c.getImageData(0,0,canvas.width,canvas.height).data;let mismatches=0,compared=0;for(let y=0;y<canvas.height-8;y++)for(let x=0;x<canvas.width-12;x++){const a=(y*canvas.width+x)*4,b=((y+8)*canvas.width+x+12)*4;if(bytes[a+3]||image[b+3]){compared++;for(let k=0;k<4;k++)if(bytes[a+k]!==image[b+k]){mismatches++;break;}}}motion={moved,compared,mismatches};c.setTransform(cam.s,0,0,cam.s,0,0);}
    s.cities[0].fort++;const construction=composeHumanGeography(c,s,cam,opts,receipt);
    const sheet=humanArchitectureSheet(candidate);sheet.id='sheet-'+candidate;document.body.append(sheet);
    results.push({candidate,first,repeat,construction,motion,pixels,sheet:[sheet.width,sheet.height]});}return results;
   });
   for(const sample of result){const f=sample.first;assert.ok(f.plans.some(p=>p.courtyards>0),'courtyard branch not exercised');assert.ok(f.fields>0,'field branch not exercised');assert.ok(f.buildings>0&&f.spriteBuilds>0,'sprite branch not exercised');assert.ok(f.roads>0&&f.roadEdges.length>0,'road branch not exercised');assert.ok(f.bridgeEdges.some(e=>e.continuous&&e.spans>0),'bridge branch not exercised');assert.ok(f.plans.some(p=>p.walls>0),'wall branch not exercised');assert.ok(f.piers>0,'pier branch not exercised');assert.ok(sample.pixels>100,'no pixels rendered');assert.ok(sample.repeat.reused&&sample.repeat.layoutMs===0&&sample.repeat.drawMs===0,'calendar-only change invalidated layer');assert.ok(!sample.construction.reused,'same-day construction failed to invalidate');if(sample.candidate!=='cultural'){assert.ok(sample.motion.moved.spatialReuse,'small pan must translate resident image');assert.ok(sample.motion.compared>100&&sample.motion.mismatches===0,'translated layer must match exact pixel shift');}assert.deepEqual(sample.sheet,[1200,760]);}assert.deepEqual(errors,[]);
   await page.locator('#fixture').screenshot({path:join(output,engine+'-urban-render-fixture.png')});for(const candidate of ['cultural','historical','organic'])await page.locator('#sheet-'+candidate).screenshot({path:join(output,engine+'-urban-render-sheet-'+candidate+'.png')});results.push({engine,passed:true,ms:Date.now()-start,candidates:result});
  }catch(e){await page?.screenshot({path:join(output,engine+'-urban-render-failure.png')}).catch(()=>{});results.push({engine,passed:false,ms:Date.now()-start,error:String(e.stack||e),errors});}finally{await browser?.close();save();}
 }
 assert.ok(results.length===2&&results.every(x=>x.passed),'Urban Canvas preflight failed; expensive QA not started');
}finally{server.kill('SIGTERM');save();}
