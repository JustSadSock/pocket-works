// Real Canvas, isolated cold module caches, warm redraws and shared-library proof.
import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const output=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/atlas-integration';mkdirSync(output,{recursive:true});
const results=[],save=()=>writeFileSync(join(output,'urban-render-preflight.json'),JSON.stringify(results,null,2));
const url='http://127.0.0.1:4211/apps/crown-and-marches/',server=spawn(process.execPath,['scripts/serve-site.mjs'],{env:{...process.env,PORT:'4211',POCKET_WORKS_SITE_ROOT:process.env.PW_QA_SITE_ROOT||process.cwd()},stdio:'ignore'});
const candidates=['cultural','historical','organic'];
const label=(r,stage)=>r.engine+' / '+r.candidate+' / '+stage;
function check(r,stage,fn){try{fn();r.checks.push({stage,passed:true});}catch(e){r.checks.push({stage,passed:false,error:label(r,stage)+': '+String(e.stack||e)});}save();}
function checkDraw(r,stage,f){check(r,stage,()=>{assert.ok(f.buildings>0&&f.buildingSprites===f.buildings,'actual building sprites not drawn');assert.ok(f.spriteDraws>=f.buildingSprites&&f.spriteDraws===f.spriteBuilds+f.spriteHits,'actual stamp accounting mismatch');assert.ok(f.plans.some(p=>p.courtyards>0),'courtyard branch not exercised');assert.ok(f.fields>0,'field branch not exercised');assert.ok(f.roads>0&&f.roadEdges.length>0,'road branch not exercised');assert.ok(f.bridgeEdges.some(e=>e.continuous&&e.spans>0),'bridge branch not exercised');assert.ok(f.plans.some(p=>p.walls>0),'wall branch not exercised');assert.ok(f.piers>0,'pier branch not exercised');});}
async function setup(browser,r){
 const page=await browser.newPage({viewport:{width:820,height:820},serviceWorkers:'block'});
 page.on('pageerror',e=>{r.errors.push(String(e.stack||e));save();});
 await page.route(url+'urban-render-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0;background:#b1b99b}</style><canvas id="fixture" width="800" height="800"></canvas>'}));
 await page.goto(url+'urban-render-fixture');
 await page.evaluate(async()=>{
  const {composeHumanGeography,humanArchitectureSheet}=await import('./atlas-human-geography.mjs'),{urbanRenderFixture}=await import('./atlas-urban-render-fixture.mjs'),canvas=document.querySelector('#fixture'),c=canvas.getContext('2d');
  let fixture=null,baseline=null;
  const clear=()=>{c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,canvas.width,canvas.height);};
  const image=()=>c.getImageData(0,0,canvas.width,canvas.height).data;
  const compare=(a,b,dx=0,dy=0)=>{let mismatches=0,compared=0;for(let y=0;y<canvas.height-dy;y++)for(let x=0;x<canvas.width-dx;x++){const j=(y*canvas.width+x)*4,k=((y+dy)*canvas.width+x+dx)*4;if(a[j+3]||b[k+3]){compared++;for(let z=0;z<4;z++)if(a[j+z]!==b[k+z]){mismatches++;break;}}}return {compared,mismatches};};
  const draw=(dx=0,dy=0,cacheMode='phase')=>{const {s,opts,cam,receipt}=fixture;clear();c.setTransform(cam.s,0,0,cam.s,dx,dy);return composeHumanGeography(c,s,{...cam,ox:dx,oy:dy},{...opts,cacheMode},dx||dy?{...receipt,key:'fixture-pan'}:receipt);};
  window.urbanPreflight={
   fresh(candidate,{reference=false}={}){fixture=urbanRenderFixture();fixture.opts.candidate=candidate;fixture.opts.terrain={fixture:true};fixture.receipt.revision='fixture';fixture.receipt.tilt=.28;const stats=draw(),bytes=image();let pixels=0;for(let k=3;k<bytes.length;k+=4)if(bytes[k])pixels++;const match=baseline?compare(baseline,bytes):null;if(reference)baseline=bytes;return {stats,pixels,match};},
   day(){fixture.s.day++;const stats=draw();return {stats,match:compare(baseline,image())};},
   pan(dx,dy){const stats=draw(dx,dy),actual=image(),fresh=draw(dx,dy,'fresh'),freshPixels=image(),repeat=draw(dx,dy),repeatPixels=image();return {stats,fresh,repeat,againstFresh:compare(actual,freshPixels),repeatAgainstFresh:compare(repeatPixels,freshPixels)};},
   returnPose(){const stats=draw(),actual=image(),fresh=draw(0,0,'fresh'),freshPixels=image();draw();return {stats,fresh,againstFresh:compare(actual,freshPixels),againstOrigin:compare(baseline,actual)};},
   integerControl(){const origin=draw(0,0,'integer'),originPixels=image(),stats=draw(12,8,'integer'),translated=image(),fresh=draw(12,8,'fresh'),freshPixels=image();c.putImageData(new ImageData(translated,canvas.width,canvas.height),0,0);return {origin,stats,fresh,shift:compare(originPixels,translated,12,8),againstFresh:compare(translated,freshPixels)};},
   construction(){const day=fixture.s.day,fort=fixture.s.cities[0].fort;fixture.s.cities[0].fort++;const stats=draw();return {stats,dayBefore:day,dayAfter:fixture.s.day,fortBefore:fort,fortAfter:fixture.s.cities[0].fort};},
   sheet(candidate){const sheet=humanArchitectureSheet(candidate);sheet.id='sheet';document.body.append(sheet);return [sheet.width,sheet.height];}
  };
 });return page;
}
async function evidence(page,r,stage,selector='#fixture'){const file=r.engine+'-urban-render-'+r.candidate+'-'+stage+'.png';try{await page.locator(selector).screenshot({path:join(output,file)});r.images.push(file);}catch(e){r.errors.push(label(r,stage)+' screenshot: '+String(e));}save();}
async function step(page,r,stage,fn,arg){r.stage=stage;try{r.data[stage]=await page.evaluate(fn,arg);save();return r.data[stage];}catch(e){r.errors.push(label(r,stage)+': '+String(e.stack||e));save();return null;}}
function record(engine,candidate){const r={engine,candidate,passed:false,stage:'setup',data:{},images:[],checks:[],errors:[]};results.push(r);save();return r;}
function finish(r){r.passed=r.checks.length>0&&r.checks.every(c=>c.passed)&&r.errors.length===0;r.stage='complete';save();}
try{
 let ready=false;for(let i=0;i<50;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,'urban preflight site unavailable');
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
  let browser;
  try{
   browser=await type.launch(engine==='chromium'?{args:['--no-sandbox']}:{});
   for(const candidate of candidates){
    const r=record(engine,candidate);let page;const start=Date.now();
    try{
     // Each new page is a fresh realm and browser context. No previous
     // candidate, fixture or architecture sheet may warm its module cache.
     page=await setup(browser,r);
     const cold=await step(page,r,'cold',c=>window.urbanPreflight.fresh(c,{reference:true}),candidate);await evidence(page,r,'cold');
     const warm=await step(page,r,'warm',c=>window.urbanPreflight.fresh(c),candidate);await evidence(page,r,'warm');
     const day=await step(page,r,'day',()=>window.urbanPreflight.day());await evidence(page,r,'day');
     const motion=await step(page,r,'pan',()=>window.urbanPreflight.pan(12,8));await evidence(page,r,'pan');
     const fractional=await step(page,r,'fractional-pan',()=>window.urbanPreflight.pan(14.4,9.2));await evidence(page,r,'fractional-pan');
     const returned=await step(page,r,'return-pose',()=>window.urbanPreflight.returnPose());await evidence(page,r,'return-pose');
     // Keep the original integer translation assertion as an explicit control.
     // Phase cache does not promise translation; it must match a fresh raster
     // at every pose and demonstrate a real cache hit on repeated/return poses.
     const integer=candidate==='cultural'?null:await step(page,r,'integer-control',()=>window.urbanPreflight.integerControl());if(candidate!=='cultural')await evidence(page,r,'integer-control');
     const construction=await step(page,r,'construction',()=>window.urbanPreflight.construction());await evidence(page,r,'construction');
     // Save the entire result and all images before checking a single assertion.
     const sheet=await step(page,r,'sheet',c=>window.urbanPreflight.sheet(c),candidate);await evidence(page,r,'sheet','#sheet');
     if(cold){checkDraw(r,'cold-render',cold.stats);check(r,'cold-cache',()=>{assert.equal(cold.stats.spriteCacheEntriesBefore,0,'cache not isolated');assert.ok(cold.stats.spriteBuilds>0,'cold cache created no sprites');assert.ok(cold.pixels>100,'no pixels rendered');});}
     if(warm){checkDraw(r,'warm-render',warm.stats);check(r,'warm-cache',()=>{assert.ok(warm.stats.spriteCacheEntriesBefore>0,'warm cache empty');assert.equal(warm.stats.spriteBuilds,0,'warm redraw unexpectedly rebuilt sprites');assert.ok(warm.stats.spriteHits>0&&!warm.stats.reused,'warm test must stamp sprites, not reuse screen layer');assert.ok(warm.match.compared>100&&warm.match.mismatches===0,'warm redraw differs from cold pixels');});}
     if(day)check(r,'calendar-layer-reuse',()=>{assert.ok(day.stats.reused&&day.stats.layoutMs===0&&day.stats.drawMs===0&&day.stats.spriteDraws===0,'calendar-only change invalidated layer');assert.ok(day.match.compared>100&&day.match.mismatches===0,'calendar layer pixels changed');});
     for(const [name,pose] of [['pan-pixels',motion],['fractional-pan-pixels',fractional]])check(r,name,()=>{
      assert.equal(pose.stats.cacheMode,'phase');assert.ok(!pose.stats.reused&&!pose.stats.spatialReuse,'new pose must be rasterized without translation');
      assert.ok(!pose.fresh.reused,'fresh comparator must rasterize');assert.ok(pose.againstFresh.compared>100&&pose.againstFresh.mismatches===0,'new pose differs from fresh raster');
      assert.ok(pose.repeat.poseCacheHit&&pose.repeat.reused&&!pose.repeat.spatialReuse,'identical pose failed to hit exact-pose bank');
      assert.equal(pose.repeat.spriteDraws,0,'exact pose cache unexpectedly stamped sprites');
      assert.ok(pose.repeatAgainstFresh.compared>100&&pose.repeatAgainstFresh.mismatches===0,'cached pose differs from fresh raster');
     });
     check(r,'return-pose-pixels',()=>{assert.ok(returned.stats.poseCacheHit&&returned.stats.reused&&!returned.stats.spatialReuse,'return failed to hit exact-pose bank');assert.ok(!returned.fresh.reused);assert.ok(returned.againstFresh.compared>100&&returned.againstFresh.mismatches===0,'returned pose differs from fresh raster');assert.ok(returned.againstOrigin.compared>100&&returned.againstOrigin.mismatches===0,'returned pose differs from initial pixels');});
     if(candidate!=='cultural')check(r,'integer-control-shift',()=>{assert.equal(integer.stats.cacheMode,'integer');assert.ok(integer.stats.spatialReuse,'small pan must translate resident image in integer control');assert.ok(integer.shift.compared>100&&integer.shift.mismatches===0,'translated layer must match exact pixel shift');assert.ok(integer.againstFresh.compared>100,'missing fresh raster comparison for translation control');});
     if(construction)check(r,'construction',()=>{assert.equal(construction.dayAfter,construction.dayBefore);assert.equal(construction.fortAfter,construction.fortBefore+1);assert.ok(!construction.stats.reused,'same-day construction failed to invalidate');assert.ok(construction.stats.plans.some(p=>p.walls>0),'fortification not rendered');});
     check(r,'sheet',()=>assert.deepEqual(sheet,[1200,760]));
    }catch(e){r.errors.push(label(r,r.stage)+': '+String(e.stack||e));if(page)await evidence(page,r,'failure');}
    finally{await page?.close();r.ms=Date.now()-start;finish(r);}
   }
   // Dedicated shared-cache test, with no sheet or unrelated draws in between.
   const r=record(engine,'historical-to-organic');let page;
   try{
    page=await setup(browser,r);
    const source=await step(page,r,'historical-cold',()=>window.urbanPreflight.fresh('historical'));await evidence(page,r,'historical-cold');
    const target=await step(page,r,'organic-shared',()=>window.urbanPreflight.fresh('organic'));await evidence(page,r,'organic-shared');
    if(source)checkDraw(r,'historical-cold-render',source.stats);if(target)checkDraw(r,'organic-shared-render',target.stats);
    check(r,'cross-candidate-cache',()=>{assert.equal(source.stats.spriteCacheEntriesBefore,0);assert.ok(source.stats.spriteBuilds>0&&source.pixels>100);assert.ok(target.stats.spriteCacheEntriesBefore>0);assert.equal(target.stats.spriteBuilds,0,'shared historical library should require no new sprites for identical layouts');assert.ok(target.stats.spriteHits>0&&target.pixels>100&&!target.stats.reused);assert.equal(target.stats.buildingSprites,source.stats.buildingSprites);});
   }catch(e){r.errors.push(label(r,r.stage)+': '+String(e.stack||e));if(page)await evidence(page,r,'failure');}finally{await page?.close();finish(r);}
  }catch(e){const r=record(engine,'browser');r.errors.push(label(r,'launch')+': '+String(e.stack||e));finish(r);}finally{await browser?.close();save();}
 }
 const failed=results.filter(r=>!r.passed);assert.ok(results.length===8&&failed.length===0,'Urban Canvas preflight failed: '+JSON.stringify(failed.map(r=>({engine:r.engine,candidate:r.candidate,checks:r.checks.filter(c=>!c.passed),errors:r.errors}))));
}finally{server.kill('SIGTERM');save();}
