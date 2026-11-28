// Each browser/candidate owns a fresh page. Candidate failure is recorded
// independently and does not suppress the other candidate or browser.
import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const root=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/atlas-integration',output=join(root,'visual-fidelity');mkdirSync(output,{recursive:true});const payload=join(root,'frozen-exemplars.json');assert.ok(existsSync(payload),'integration fixture missing');
const url='http://127.0.0.1:4208/apps/crown-and-marches/?atlas-review=1',server=spawn(process.execPath,['scripts/serve-site.mjs'],{env:{...process.env,PORT:'4208',POCKET_WORKS_SITE_ROOT:process.env.PW_QA_SITE_ROOT||process.cwd()},stdio:'ignore'}),report=[],save=()=>writeFileSync(join(output,'fidelity.json'),JSON.stringify(report,null,2));
const candidates=[['identity',true,true],['continuous',true,false]],engines=[['chromium',chromium],['webkit',webkit]];
try{let ready=false;for(let i=0;i<50;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready);let candidateFailures=0;
for(const [variant,surfaceScale,identity] of candidates)for(const [engine,type] of engines){
 const browser=await type.launch(engine==='chromium'?{args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{});
 const page=await browser.newPage({viewport:{width:1280,height:800},serviceWorkers:'block'}),errors=[],logs=[];page.on('pageerror',e=>errors.push(String(e.stack||e)));page.on('console',m=>logs.push({type:m.type(),text:m.text()}));let phase='startup';
 const snapshot=()=>page.locator('#atlas').evaluate(el=>({...el.dataset}));
 const awaitReceipt=async p=>{await page.waitForFunction(p=>{const d=document.querySelector('#atlas')?.dataset;if(!d||Number(d.atlasIntent)!==p.intent)return false;if(d.atlasSurface==='error')return true;if(d.atlasSurface!=='ready'||d.atlasReadyId!==d.atlasRequestId||!d.atlasReceipt)return false;const r=JSON.parse(d.atlasReceipt),q=JSON.parse(d.atlasRequest);return r.intent===p.intent&&r.id===q.id&&r.key===q.key&&r.revision===q.revision&&r.detail===q.detail&&r.contourDetail===q.contourDetail&&r.tilt===q.tilt&&r.region[0]<=q.visible[0]&&r.region[1]<=q.visible[1]&&r.region[2]>=q.visible[2]&&r.region[3]>=q.visible[3]&&r.lod===Number(d.atlasLod)&&r.view.x===q.view.x&&r.view.y===q.view.y&&r.view.s===q.view.s;},p,{timeout:90000});const d=await snapshot();assert.equal(d.atlasSurface,'ready',JSON.stringify(d));return d;};
 try{
 await page.goto(url);await page.locator('[data-act="atlaslab"]').click();await page.locator('#atlasseed').fill('atlas-mountain-173');await page.locator('#atlasshape').selectOption('continents');await page.locator('#atlasdem').setInputFiles(payload);await page.locator('[data-act="atlasstart"]').click();await page.waitForFunction(()=>document.querySelector('.app-shell')?.dataset.campaign==='atlas'&&document.querySelector('#atlas')?.dataset.atlasSurface==='ready',null,{timeout:90000});
 const scene=async(name,full,tilt=true,keepCache=false,suffix='')=>{phase=[name,full?'full':'partial',tilt?'relief':'atlas',variant,suffix].filter(Boolean).join('-');const start=Date.now(),p=await page.evaluate(({name,full,tilt,surfaceScale,identity,keepCache})=>window.__atlasReview.scene(name,{full,tilt,surfaceScale,identity,keepCache}),{name,full,tilt,surfaceScale,identity,keepCache});if(p.missing){report.push({engine,variant,phase,missing:true});save();return;}
 try{const d=await awaitReceipt(p),meta=await page.evaluate(()=>window.__atlasReview.meta());assert.equal(meta.receipt.id,Number(d.atlasReadyId));assert.equal(meta.receipt.intent,p.intent);assert.deepEqual([meta.camera.x,meta.camera.y,meta.camera.zoom],[p.camera.x,p.camera.y,p.camera.zoom]);assert.equal(meta.full,full);await page.screenshot({path:join(output,engine+'-'+phase+'-game.png')});const after=await snapshot();assert.equal(after.atlasReadyId,d.atlasReadyId,'capture changed region');if(name==='capital'){assert.ok(meta.capital.roundtrip<.1,'capital projection roundtrip');const [x,y]=meta.capital.screen;await page.mouse.click(x,y);assert.ok((await page.locator('#panel').innerText()).length>0);}
 report.push({engine,variant,phase,meta,elapsed:Date.now()-start,diagnostics:d});save();}catch(e){await page.screenshot({path:join(output,engine+'-'+phase+'-failure.png')}).catch(()=>{});report.push({engine,variant,phase,error:String(e.stack||e),diagnostics:await snapshot().catch(()=>null),elapsed:Date.now()-start});save();throw e;}};
 await scene('capital',false);
 if(surfaceScale){phase='fog mutation';const fog=await page.evaluate(()=>window.__atlasReview.fogMutation());assert.ok(fog.unknown>0&&fog.refined>0&&fog.pixels&&fog.geometry&&fog.contours,JSON.stringify(fog));report.push({engine,variant,fog});save();}
 for(const name of ['continent','capital','mountain','river','lake','coast','forest','mouth','port','road','rivercity'])await scene(name,true,true,surfaceScale);
 if(identity){
 await scene('forest',true,true,true,'warm');await scene('mountain',true,true,true,'warm');await scene('forest',true,true,true,'revisit');
 phase='cold cancellation stress';const beforeStress=await page.evaluate(()=>window.__atlasReview.pending());const stress=[];
 for(const [name,full] of [['continent',true],['capital',false],['mountain',true],['capital',false],['coast',true]]){
 const request=await page.evaluate(({name,full})=>window.__atlasReview.scene(name,{full,tilt:true,surfaceScale:true,identity:true,keepCache:false}),{name,full});
 if(request.missing)continue;
 const {observed,next}=await page.evaluate(async()=>{const r=window.__atlasReview,start=performance.now();while(!r.pending().pending){if(performance.now()-start>15000)throw Error('No cold pending request');await new Promise(requestAnimationFrame);}const observed=r.pending();const next=await r.scene('capital',{full:false,tilt:false,surfaceScale:true,identity:true,keepCache:false});return {observed,next};});
 const immediately=await snapshot();assert.notEqual(immediately.atlasSurface,'ready');assert.equal(immediately.atlasReadyId,'');
 await awaitReceipt(next);const settled=await page.evaluate(()=>window.__atlasReview.pending());assert.ok(settled.cancelled>observed.cancelled);assert.ok(settled.stale>beforeStress.stale);assert.equal(settled.maxInFlight,1);assert.ok(settled.cacheBytes<=64*1024*1024);stress.push({request,observed,next,settled});}
 assert.ok(stress.length>=4);const final=await snapshot();report.push({engine,variant,stress,final});save();
 // Return to the same fully revealed close camera before actual movement.
 await scene('forest',true,true,true,'motion-start');
 phase='camera traversal';const motion=await page.evaluate(async()=>{const c=document.querySelector('#atlas'),gaps=[],latencies=[],draws=[];let prev=await new Promise(requestAnimationFrame),lastFrame=Number(c.dataset.atlasFrame),pending=0,start=performance.now();for(let i=0;i<100;i++){if(i%10===0){window.__atlasReview.motion(i%20===0?70:-70,18,i%30===0?1.08:1);pending=performance.now();}const t=await new Promise(requestAnimationFrame);gaps.push(t-prev);prev=t;const n=Number(c.dataset.atlasFrame);if(n!==lastFrame){if(pending){latencies.push(t-pending);pending=0;}draws.push(Number(c.dataset.atlasDrawMs));lastFrame=n;}}return {raf:gaps,draws,latencies,elapsed:performance.now()-start,cache:{hits:c.dataset.atlasCacheHits,evictions:c.dataset.atlasCacheEvictions,bytes:c.dataset.atlasCacheBytes,programReuse:c.dataset.atlasProgramReuse,cancelled:c.dataset.atlasCancelled}};});report.push({engine,variant,motion});save();
 await page.setViewportSize({width:390,height:844});for(const tilt of [false,true])await scene('capital',false,tilt,true,'mobile');}
 assert.deepEqual(errors,[]);report.push({engine,variant,passed:true});
 }catch(e){if(identity)candidateFailures++;await page.screenshot({path:join(output,engine+'-'+variant+'-failure.png')}).catch(()=>{});report.push({engine,variant,passed:false,phase,error:String(e.stack||e),errors,logs,state:await snapshot().catch(()=>null)});}
 finally{save();await browser.close();}
}
assert.equal(candidateFailures,0,'Geographic Identity candidate failed; Continuous Surface failures separately recorded');
}finally{server.kill('SIGTERM');save();}
