// Runs only after the independent integration gate succeeds. Real campaign,
// same geography/camera/chart state for each paired candidate and lab reference.
import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const root=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/atlas-integration',output=join(root,'visual-fidelity');mkdirSync(output,{recursive:true});const payload=join(root,'frozen-exemplars.json');assert.ok(existsSync(payload),'integration fixture missing');
const url='http://127.0.0.1:4208/apps/crown-and-marches/?atlas-review=1',server=spawn(process.execPath,['scripts/serve-site.mjs'],{env:{...process.env,PORT:'4208',POCKET_WORKS_SITE_ROOT:process.env.PW_QA_SITE_ROOT||process.cwd()},stdio:'ignore'}),report=[],save=()=>writeFileSync(join(output,'fidelity.json'),JSON.stringify(report,null,2));
try{let ready=false;for(let i=0;i<50;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready);
let failures=0;
for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){const browser=await type.launch(engine==='chromium'?{args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{});
const page=await browser.newPage({viewport:{width:1280,height:800},serviceWorkers:'block'}),errors=[],logs=[];page.on('pageerror',e=>errors.push(String(e.stack||e)));page.on('console',m=>logs.push({type:m.type(),text:m.text()}));let phase='startup';
try{
 await page.goto(url);await page.locator('[data-act="atlaslab"]').click();await page.locator('#atlasseed').fill('atlas-mountain-173');await page.locator('#atlasshape').selectOption('continents');await page.locator('#atlasdem').setInputFiles(payload);await page.locator('[data-act="atlasstart"]').click();await page.waitForFunction(()=>document.querySelector('.app-shell')?.dataset.campaign==='atlas'&&document.querySelector('#atlas')?.dataset.atlasSurface==='ready',null,{timeout:90000});
 const scene=async(name,full,tilt,reference=false)=>{phase=[name,full?'full':'partial',tilt?'relief':'atlas'].join('-');const before=await page.locator('#atlas').getAttribute('data-atlas-frame'),p=await page.evaluate(({name,full,tilt})=>window.__atlasReview.scene(name,{full,tilt}),{name,full,tilt});if(p.missing){report.push({engine,phase,missing:true});save();return;}
 await page.waitForFunction(({before,tilt})=>{const d=document.querySelector('#atlas')?.dataset;return d?.atlasSurface==='error'||d?.atlasSurface==='ready'&&Number(d.atlasFrame)>Number(before)&&d.atlasView===(tilt?'relief':'atlas');},{before,tilt},{timeout:90000});assert.equal(await page.locator('#atlas').getAttribute('data-atlas-surface'),'ready');const meta=await page.evaluate(()=>window.__atlasReview.meta());await page.screenshot({path:join(output,engine+'-'+phase+'-game.png')});let lab=null;if(reference){lab=await page.evaluate(()=>window.__atlasReview.reference());await page.locator('#atlas-reference').screenshot({path:join(output,engine+'-'+phase+'-lab.png')});await page.evaluate(()=>window.__atlasReview.clearReference());}if(name==='capital'){assert.ok(meta.capital.roundtrip<.1,'capital projection roundtrip');const [x,y]=meta.capital.screen;await page.mouse.click(x,y);assert.ok((await page.locator('#panel').innerText()).length>0,'capital selection');}
 report.push({engine,phase,meta,lab});save();};
 for(const tilt of [false,true])await scene('capital',false,tilt,true);
 phase='fog mutation';const fog=await page.evaluate(()=>window.__atlasReview.fogMutation());assert.ok(fog.unknown>0&&fog.refined>0&&fog.pixels&&fog.geometry&&fog.contours,JSON.stringify(fog));report.push({engine,fog});save();
 for(const name of ['continent','capital','mountain','river','lake','coast','forest'])for(const tilt of [false,true])await scene(name,true,tilt,['mountain','river','coast'].includes(name));
 await page.setViewportSize({width:390,height:844});for(const tilt of [false,true])await scene('capital',false,tilt);assert.deepEqual(errors,[]);report.push({engine,passed:true});
}catch(e){failures++;await page.screenshot({path:join(output,engine+'-failure.png')}).catch(()=>{});report.push({engine,phase,error:String(e.stack||e),errors,logs,state:await page.locator('.app-shell').evaluate(el=>({...el.dataset})).catch(()=>null)});}
finally{save();await browser.close();}}
assert.equal(failures,0,'Visual Fidelity review failed');
}finally{server.kill('SIGTERM');save();}
