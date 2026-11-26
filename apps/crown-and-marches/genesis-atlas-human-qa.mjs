// Real campaigns; original and new buildings use identical geography and
// actual game state. Fixture improvements use the same game commands as UI.
import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const root=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/atlas-integration',output=join(root,'human-geography');mkdirSync(output,{recursive:true});const payload=join(root,'frozen-exemplars.json');assert.ok(existsSync(payload));
const url='http://127.0.0.1:4210/apps/crown-and-marches/?atlas-review=1',server=spawn(process.execPath,['scripts/serve-site.mjs'],{env:{...process.env,PORT:'4210',POCKET_WORKS_SITE_ROOT:process.env.PW_QA_SITE_ROOT||process.cwd()},stdio:'ignore'}),report=[],save=()=>writeFileSync(join(output,'human-geography.json'),JSON.stringify(report,null,2));
try{let ready=false;for(let i=0;i<50;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready);
let failures=0;for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch(engine==='chromium'?{args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{}),page=await browser.newPage({viewport:{width:1280,height:800},serviceWorkers:'block'}),errors=[],logs=[];page.on('pageerror',e=>errors.push(String(e.stack||e)));page.on('console',m=>logs.push({type:m.type(),text:m.text()}));let phase='start';
 const snap=()=>page.locator('#atlas').evaluate(e=>({...e.dataset}));
 try{
 await page.goto(url);await page.locator('[data-act="atlaslab"]').click();await page.locator('#atlasseed').fill('atlas-mountain-173');await page.locator('#atlasshape').selectOption('continents');await page.locator('#atlasdem').setInputFiles(payload);await page.locator('[data-act="atlasstart"]').click();await page.waitForFunction(()=>document.querySelector('.app-shell')?.dataset.campaign==='atlas'&&document.querySelector('#atlas')?.dataset.atlasSurface==='ready',null,{timeout:90000});
 const capture=async(name,zoom,full,human,identity=true,tag='')=>{phase=[name,zoom,full?'full':'partial',human?'human':'control',tag].filter(Boolean).join('-');const start=Date.now(),request=await page.evaluate(o=>window.__atlasReview.scene(o.name,o),{name,zoom,full,human,identity,tilt:true,surfaceScale:true,keepCache:true});if(request.missing){report.push({engine,phase,missing:true});save();return null;}
 await page.waitForFunction(p=>{const d=document.querySelector('#atlas')?.dataset;return d?.atlasSurface==='error'||d?.atlasSurface==='ready'&&d.atlasReadyId===d.atlasRequestId&&Number(d.atlasIntent)===p.intent;},request,{timeout:90000});const d=await snap();assert.equal(d.atlasSurface,'ready',JSON.stringify(d));const meta=await page.evaluate(()=>window.__atlasReview.meta());assert.equal(meta.receipt.intent,request.intent);assert.deepEqual([meta.camera.x,meta.camera.y,meta.camera.zoom],[request.camera.x,request.camera.y,request.camera.zoom]);assert.equal(meta.full,full);await page.screenshot({path:join(output,engine+'-'+phase+'.png')});assert.equal((await snap()).atlasReadyId,d.atlasReadyId);
 const result={engine,phase,meta,elapsed:Date.now()-start,request};report.push(result);save();return result;};
 const pair=async(name,zoom,full=true,tag='')=>{const a=await capture(name,zoom,full,false,true,tag),b=await capture(name,zoom,full,true,true,tag);if(!a||!b)return null;assert.deepEqual(a.meta.camera,b.meta.camera,'matched camera');assert.deepEqual(a.meta.bounds,b.meta.bounds,'matched region');assert.equal(a.meta.full,b.meta.full);assert.ok(b.meta.capital.roundtrip<.1);return b;};
 await pair('capital',5);await pair('capital',12);const close=await pair('capital',24);assert.ok(close?.meta.human?.buildings>0,'capital architecture missing');await pair('capital',12,false,'fog');
 phase='fog safety';const fog=await page.evaluate(()=>window.__atlasReview.fogMutation()),humanFog=await page.evaluate(()=>window.__atlasReview.humanFogMutation());assert.ok(fog.unknown>0&&fog.pixels&&fog.geometry&&fog.contours);assert.ok(humanFog.hidden>0&&humanFog.town&&humanFog.fields);report.push({engine,fog,humanFog});save();await capture('capital',12,false,true,false,'continuous-fog');
 phase='architecture sheet';await page.evaluate(()=>window.__atlasReview.architectureSheet());await page.locator('#human-architecture-sheet').screenshot({path:join(output,engine+'-architecture-families.png')});await page.evaluate(()=>window.__atlasReview.clearArchitectureSheet());
 phase='gameplay development';const fixture=await page.evaluate(()=>window.__atlasReview.humanFixture());report.push({engine,fixture});save();
 for(const [name,zoom] of [['riven',24],['village',24],['trade',24],['fortified',24],['crossing',18],['road',16],['rivercity',18],['continent',1]])await pair(name,zoom,true,'developed');
 // The fixture must include actual constructed port and fortification, and
 // at least one founded village. Report specific missing model placements.
 assert.ok(fixture.cities.some(c=>c.name==='Ривен'&&c.port>0),'Riven port not constructed');assert.ok(fixture.cities.some(c=>c.fort>0),'fort not constructed');assert.ok(fixture.cities.some(c=>!c.capital),'no founded settlement');
 await page.setViewportSize({width:390,height:844});await pair('capital',18,false,'mobile');assert.deepEqual(errors,[]);report.push({engine,passed:true});
 }catch(e){failures++;await page.screenshot({path:join(output,engine+'-failure.png')}).catch(()=>{});report.push({engine,phase,error:String(e.stack||e),errors,logs,diagnostics:await snap().catch(()=>null)});}finally{save();await browser.close();}
}assert.equal(failures,0,'Human Geography browser QA failed');}finally{server.kill('SIGTERM');save();}
