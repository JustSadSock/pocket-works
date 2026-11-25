// Natural Mountain Systems, isolated first-phase review. Frozen historical
// art is reused from original artifacts; no gameplay campaign matrix.
import {chromium,webkit} from '@playwright/test';
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {loadLibrary} from './geographic-dem-library.mjs';
import {packExemplars} from './genesis-natural.mjs';
import {generate,activateWorld} from './world.mjs';
import {fingerprint} from './genesis-regression.mjs';
const output=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/natural-mountains';mkdirSync(output,{recursive:true});
const reports=[],save=()=>writeFileSync(join(output,'natural-mountains.json'),JSON.stringify(reports,null,2));
const url='http://127.0.0.1:4207/apps/crown-and-marches/',server=spawn(process.execPath,['scripts/serve-site.mjs'],{env:{...process.env,PORT:'4207',POCKET_WORKS_SITE_ROOT:process.env.PW_QA_SITE_ROOT||process.cwd()},stdio:'ignore'});
const scenes=[{id:'mountain',seed:'atlas-mountain-173',neutral:{x:112.5,y:56.5},datum:1.170987733483314,reference:'alpine'},{id:'hills',seed:'atlas-hills-291',neutral:{x:120.5,y:64.5},datum:.6576919226646424,reference:'rolling'},{id:'valley',seed:'atlas-valley-418',neutral:{x:96.5,y:64.5},datum:10.555381492853163,reference:'gorge'}];
try{
 const baseline=JSON.parse(readFileSync(new URL('./genesis-legacy-hashes.json',import.meta.url),'utf8'));for(const f of baseline.fixtures){activateWorld({worldSize:f.size});const m=generate(f.seed,f.version,f.shape);for(const [k,h] of Object.entries(f.hashes))assert.equal(fingerprint(m[k]),h);}
 reports.push({legacy:42});save();
 const library=await loadLibrary(join(tmpdir(),'crown-dem-library'));
 for(const d of library)assert.equal(createHash('sha256').update(Buffer.from(Float32Array.from(d.metres).buffer)).digest('hex'),d.metadata.sampleSha256);
 const exemplars=packExemplars(library),payload=join(output,'frozen-exemplars.json');writeFileSync(payload,JSON.stringify(exemplars));writeFileSync(join(output,'dem-provenance.json'),JSON.stringify(library.map(d=>d.metadata),null,2));
 const nodeResults=[];for(const size of ['standard','large','huge'])for(const approach of ['natural','field']){const r=spawnSync(process.execPath,[fileURLToPath(new URL('./genesis-natural-memory.mjs',import.meta.url)),size,approach,payload],{encoding:'utf8',timeout:90000});assert.equal(r.status,0,r.stderr||String(r.error));const m=JSON.parse(r.stdout.trim().split('\n').at(-1));nodeResults.push(m);reports.push({node:m});save();}
 let ready=false;for(let i=0;i<80;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready);
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){const browser=await type.launch({headless:true,...(engine==='chromium'?{args:['--enable-unsafe-swiftshader']}: {})});try{
 const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.evaluate(async ({exemplars,library})=>{const w=await import('./world.mjs'),{Camera}=await import('./render.mjs'),{startGenesisGeneration}=await import('./genesis-generation.mjs'),digest=async m=>Object.fromEntries(await Promise.all(Object.entries(m).filter(([k,v])=>ArrayBuffer.isView(v)).map(async([k,v])=>[k,Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',v)),x=>x.toString(16).padStart(2,'0')).join('')])));const refs={};for(const d of library){const N=193,a=new Float32Array(N*N);for(let y=0;y<N;y++)for(let x=0;x<N;x++)a[y*N+x]=d.metres[y*2*d.size+x*2];refs[d.id]={...d,size:N,detail:4,metres:a};}window.__natural={w,Camera,startGenesisGeneration,digest,exemplars,refs};},{exemplars,library});
 const render=async(kind,location,stage=null)=>{const meta=await page.evaluate(async({kind,location,stage})=>{const {w,Camera,current,refs}=window.__natural,{genesisSource}=await import('./genesis-review.mjs'),{realSource}=await import('./terrain-art-lab.mjs'),{prepareBakedTerrain,BakedTerrainGL}=await import('./world-rendering-baked.mjs'),{vertical}=await import('./world-rendering-gl.mjs'),{scene,all,chosen}=current,m=all[kind],real=kind==='real',pos=real?{x:24,y:24}:location==='world'?{x:w.W/2,y:w.H/2}:location==='neutral'||stage?scene.neutral:chosen[kind],cam=new Camera(w.W,w.H);cam.x=pos.x;cam.y=pos.y;cam.zoom=location==='close'?13:5;cam.layout(1280,800);if(location==='world')cam.s=Math.min(1220/w.W,700/w.H);const bounds=location==='world'?[0,0,w.W,w.H]:[Math.max(0,Math.floor(pos.x-30)),Math.max(0,Math.floor(pos.y-30)),Math.min(w.W,Math.ceil(pos.x+30)),Math.min(w.H,Math.ceil(pos.y+30))];const s={map:m,mapVersion:3,autonomous:true};
 const source=real?realSource(refs[scene.reference]):await genesisSource(s,cam,{bounds,stage});
 cam.datum=real?source.center:location==='world'?0:location==='neutral'||stage?scene.datum:vertical(m.height[Math.floor(pos.y)*w.W+Math.floor(pos.x)]);
 const terrain=await prepareBakedTerrain(s,cam,{sourceOverride:source,geology:'synthesis',closeLOD:true});
 let canvas=document.getElementById('natural-gl');if(canvas)canvas.remove();canvas=document.createElement('canvas');canvas.id='natural-gl';canvas.width=1280;canvas.height=800;Object.assign(canvas.style,{position:'fixed',inset:0,width:'100%',height:'100%',zIndex:10001});document.body.append(canvas);const renderer=new BakedTerrainGL(canvas,terrain,{chunked:true});const frameMs=renderer.draw(cam,{finish:true});current.renderer=renderer;return {camera:{x:cam.x,y:cam.y,scale:cam.s,datum:cam.datum},terrain:terrain.stats,frameMs,device:renderer.device};},{kind,location,stage});await page.locator('#natural-gl').screenshot({path:join(output,[engine,sceneName,kind,stage||location].join('-')+'.png')});await page.evaluate(()=>window.__natural.current.renderer.dispose());reports.push({engine,scene:sceneName,kind,location,stage,...meta});save();};
 let sceneName='';
 for(const scene of scenes){sceneName=scene.id;
 const generated=await page.evaluate(async scene=>{const {w,startGenesisGeneration,exemplars,digest}=window.__natural;w.activateWorld({worldSize:'standard'});const all={},chosen={},stats=[];
 for(const approach of ['natural','field']){const options={states:6,mapShape:'continents',experimentalGeography:{revision:'genesis-3.2.0',approach,detail:4,...(approach==='field'?{exemplars}:{}),captureStages:true}},stages=[],begin=performance.now();let last=begin,maxGap=0,timer=setInterval(()=>{const now=performance.now();maxGap=Math.max(maxGap,now-last);last=now;},8);let result;try{result=await startGenesisGeneration(scene.seed,options,{mapOnly:true,onProgress:x=>stages.push(x)}).promise;}finally{clearInterval(timer);maxGap=Math.max(maxGap,performance.now()-last);}const m=result.value,g=m.geography,coarse=await digest(m),fine=await digest(g);
 all[approach]=m;let score=-Infinity,pos=null;for(let y=24;y<w.H-24;y+=2)for(let x=24;x<w.W-24;x+=2){let hill=0,mountain=0,river=0,water=0,lo=Infinity,hi=-Infinity;for(let dy=-8;dy<=8;dy+=2)for(let dx=-8;dx<=8;dx+=2){const i=(y+dy)*w.W+x+dx;hill+=+(m.terrain[i]===3);mountain+=+(m.terrain[i]===4);river+=m.river[i];water+=!m.land[i];lo=Math.min(lo,m.height[i]);hi=Math.max(hi,m.height[i]);}const value=scene.id==='mountain'?mountain*2+hill+(hi-lo)*20-water:scene.id==='hills'?hill*3-mountain*2-water:river*4+hill*.5-water;if(value>score){score=value;pos={x:x+.5,y:y+.5};}}chosen[approach]=pos;
 let physicalUphill=0,routingUphill=0,maxFill=0,fillVolume=0,fillSamples=0;for(let i=0;i<m.land.length;i++)if(m.land[i]&&m.down[i]>=0){physicalUphill+=+(m.height[m.down[i]]>=m.height[i]);routingUphill+=+(m.routingHeight[m.down[i]]>=m.routingHeight[i]);}for(let i=0;i<g.land.length;i++)if(g.land[i]){const d=g.surface[i]-g.bed[i];maxFill=Math.max(maxFill,d);fillVolume+=d;if(d>.012)fillSamples++;}
 stats.push({approach,workerMs:result.ms,wallMs:performance.now()-begin,maxGap,bytes:result.bytes,stages,coarse,fine,physicalUphill,routingUphill,maxFill,fillVolume,fillSamples,hydrology:g.hydrologyAudit,exits:g.exitAudit});}
 window.__natural.current={scene,all,chosen};return {chosen,stats};},scene);reports.push({engine,scene:scene.id,...generated});save();
 for(const g of generated.stats){assert.equal(g.routingUphill,0);assert.equal(g.hydrology.unresolved,0);if(scene.id==='mountain'){const node=nodeResults.find(n=>n.size==='standard'&&n.approach===g.approach);const diff=[...Object.keys(node.coarse).filter(k=>node.coarse[k]!==g.coarse[k]),...Object.keys(node.fine).filter(k=>node.fine[k]!==g.fine[k])];reports.push({engine,approach:g.approach,crossNodeDifferences:diff});save();}}
 for(const kind of ['natural','field']){
 for(const location of ['world','neutral','own-best','close'])await render(kind,location);
 if(engine==='chromium'){for(const type of ['height','slope','basin','biome']){const image=await page.evaluate(async({kind,type})=>{const {w,current}=window.__natural,{diagnosticCanvas}=await import('./genesis-review.mjs');return diagnosticCanvas(current.all[kind],w.W,w.H,type).toDataURL();},{kind,type});writeFileSync(join(output,[engine,scene.id,kind,type].join('-')+'.png'),Buffer.from(image.split(',')[1],'base64'));}}
 for(const stage of ['before','bed','filled'])await render(kind,'neutral',stage);
 }
 // Reuse original DEM references, render on the same material pipeline.
 await render('real','neutral');
 if(scene.id==='mountain'&&engine==='chromium'){
 const oldAudit=await page.evaluate(()=>{const {w,current}=window.__natural,out=[];for(const [name,approach,auditProfile] of [['tectonic-original','tectonic','original'],['tectonic-no-fold','tectonic','no-fold'],['structure-original','structure','original'],['structure-rounded','structure','rounded'],['structure-blend','structure','blend']]){const m=w.generate(current.scene.seed,3,'continents',{approach,detail:4,captureStages:true,auditProfile});current.all[name]=m;const g=m.geography;let maxFill=0,filled=0,fillVolume=0;for(let i=0;i<g.land.length;i++)if(g.land[i]){const d=g.surface[i]-g.bed[i];maxFill=Math.max(maxFill,d);filled+=+(d>.012);fillVolume+=d;}out.push({name,maxFill,filled,fillVolume});}return out;});reports.push({engine,ablation:oldAudit});save();
 for(const x of oldAudit)for(const stage of ['before','bed','filled'])await render(x.name,'neutral',stage);
 }
 await page.evaluate(()=>delete window.__natural.current);
 }
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}}
}finally{server.kill('SIGTERM');save();}
