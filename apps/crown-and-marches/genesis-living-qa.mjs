// Field-only paired review. Natural Ranges remains frozen; previous review script
// and its evidence are retained. No full campaign matrix or release gate bypass.
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
import {generate,activateWorld,newGame,serialize,restore,pathfind,step,W,H} from './world.mjs';
import {fingerprint} from './genesis-regression.mjs';
import {auditMajorExits,auditPhysicalEdges} from './genesis-hydrology.mjs';
const output=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/living-geography';mkdirSync(output,{recursive:true});
const report=[],save=()=>writeFileSync(join(output,'living-geography.json'),JSON.stringify(report,null,2));
const scenes=[{id:'mountain',seed:'atlas-mountain-173',neutral:{x:112.5,y:56.5},datum:1.170987733483314},{id:'hills',seed:'atlas-hills-291',neutral:{x:120.5,y:64.5},datum:.6576919226646424},{id:'valley',seed:'atlas-valley-418',neutral:{x:96.5,y:64.5},datum:10.555381492853163}];
const revisions=['genesis-3.2.0','genesis-3.3.0'];
const url='http://127.0.0.1:4207/apps/crown-and-marches/',server=spawn(process.execPath,['scripts/serve-site.mjs'],{env:{...process.env,PORT:'4207',POCKET_WORKS_SITE_ROOT:process.env.PW_QA_SITE_ROOT||process.cwd()},stdio:'ignore'});
const digest=m=>Object.fromEntries(Object.entries(m).filter(([k,v])=>ArrayBuffer.isView(v)).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')]));
try{
 const baseline=JSON.parse(readFileSync(new URL('./genesis-legacy-hashes.json',import.meta.url),'utf8'));for(const f of baseline.fixtures){activateWorld({worldSize:f.size});const m=generate(f.seed,f.version,f.shape);for(const [k,h] of Object.entries(f.hashes))assert.equal(fingerprint(m[k]),h);}
 activateWorld({worldSize:'standard'});assert.equal(auditMajorExits(generate('atlas-mountain-173',3,'continents',{revision:'genesis-3.1.0',approach:'structure',detail:4}),192,128).total,43);
 report.push({legacy:baseline.fixtures.length});save();
 const library=await loadLibrary(join(tmpdir(),'crown-dem-library'));
 for(const d of library)assert.equal(createHash('sha256').update(Buffer.from(Float32Array.from(d.metres).buffer)).digest('hex'),d.metadata.sampleSha256);
 const exemplars=packExemplars(library),payload=join(output,'frozen-exemplars.json');writeFileSync(payload,JSON.stringify(exemplars));writeFileSync(join(output,'dem-provenance.json'),JSON.stringify(library.map(d=>d.metadata),null,2));
 const nodeResults=[];for(const size of ['standard','large','huge'])for(const revision of revisions){const r=spawnSync(process.execPath,[fileURLToPath(new URL('./genesis-natural-memory.mjs',import.meta.url)),size,'field',payload,revision],{encoding:'utf8',timeout:90000});assert.equal(r.status,0,r.stderr||String(r.error));const m=JSON.parse(r.stdout.trim().split('\n').at(-1));nodeResults.push(m);report.push({memory:m});save();}
 const detail8Memory=spawnSync(process.execPath,[fileURLToPath(new URL('./genesis-natural-memory.mjs',import.meta.url)),'standard','field',payload,revisions[1],'8'],{encoding:'utf8',timeout:90000});assert.equal(detail8Memory.status,0,detail8Memory.stderr||String(detail8Memory.error));report.push({memory:JSON.parse(detail8Memory.stdout.trim().split('\n').at(-1))});save();
 for(const scene of scenes){const options={worldSize:'standard',states:6,mapShape:'continents',experimentalGeography:{revision:revisions[1],detail:4,approach:'field',exemplars}},s=newGame(scene.seed,options);
  assert.equal(s.cities.length,6);assert.ok(s.cities.every(c=>s.map.land[c.i]&&s.map.terrain[c.i]!==4));const routes=[];for(let i=0;i<s.cities.length;i++)for(let j=i+1;j<s.cities.length;j++){const a=s.cities[i],b=s.cities[j],path=pathfind(s,a.i,b.i);routes.push({from:a.id,to:b.id,connected:!!path?.length,length:path?.length??0,sameLandmass:s.map.landmass[a.i]===s.map.landmass[b.i]});}
  const starts=s.cities.map(c=>({id:c.id,cell:c.i,terrain:s.map.terrain[c.i],fertility:s.map.fert[c.i],resource:s.map.resource[c.i]}));
  const resourceCounts=Array(9).fill(0);for(const v of s.map.resource)if(v>=0)resourceCounts[v]++;
  for(let i=0;i<14;i++)step(s);const json=serialize(s),restored=restore(json);assert.deepEqual(digest(restored.map),digest(s.map));assert.deepEqual(digest(restored.map.geography),digest(s.map.geography));assert.equal(restored.day,s.day);
  const broken=JSON.parse(json),d=broken.geographyV3.exemplars[0];d.data=(d.data[0]==='A'?'B':'A')+d.data.slice(1);assert.throws(()=>restore(JSON.stringify(broken)),/Corrupt packed DEM/);
  report.push({scene:scene.id,gameplay:{starts,routes,resourceCounts,days:s.day,saveBytes:Buffer.byteLength(json),restored:true}});save();
 }
 let ready=false;for(let i=0;i<80;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready);
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){const browser=await type.launch({headless:true,...(engine==='chromium'?{args:['--enable-unsafe-swiftshader']}: {})});try{
 const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.evaluate(async exemplars=>{const w=await import('./world.mjs'),{Camera}=await import('./render.mjs'),{startGenesisGeneration}=await import('./genesis-generation.mjs');window.__living={w,Camera,startGenesisGeneration,exemplars};},exemplars);
 for(const scene of scenes){
 const generated=await page.evaluate(async({scene,revisions})=>{const {w,startGenesisGeneration,exemplars}=window.__living;w.activateWorld({worldSize:'standard'});const all={},stats=[],digest=async m=>Object.fromEntries(await Promise.all(Object.entries(m).filter(([k,v])=>ArrayBuffer.isView(v)).map(async([k,v])=>[k,Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',v)),x=>x.toString(16).padStart(2,'0')).join('')]))),{auditMajorExits,auditPhysicalEdges}=await import('./genesis-hydrology.mjs');
 for(const revision of revisions){const begin=performance.now(),options={states:6,mapShape:'continents',experimentalGeography:{revision,approach:'field',detail:4,exemplars}},result=await startGenesisGeneration(scene.seed,options,{mapOnly:true}).promise,m=result.value,g=m.geography;all[revision]=m;
 let routingUphill=0;for(let i=0;i<m.land.length;i++)if(m.land[i]&&m.down[i]>=0&&m.routingHeight[m.down[i]]>=m.routingHeight[i])routingUphill++;
 stats.push({revision,workerMs:result.ms,wallMs:performance.now()-begin,bytes:result.bytes,coarse:await digest(m),fine:await digest(g),routingUphill,hydrology:g.hydrologyAudit,exits:auditMajorExits(m,w.W,w.H),physical:auditPhysicalEdges(m,w.W,w.H)});
 }
 // Select camera positions once using the baseline; all variants use identical
 // world coordinates, zoom and datum. A missing lake is disclosed, not invented.
 const m=all[revisions[0]],g=m.geography,positions={neutral:scene.neutral,world:{x:w.W/2,y:w.H/2}};
 const choose=(name,score)=>{let best=-Infinity,pos=null;for(let y=10;y<w.H-10;y++)for(let x=10;x<w.W-10;x++){const i=y*w.W+x,v=score(i,x,y);if(v>best){best=v;pos={x:x+.5,y:y+.5};}}if(best>0)positions[name]=pos;};
 choose('mountain',(i,x,y)=>m.land[i]?m.height[i]+m.relief[i]*.3:0);
 positions.close=positions.mountain;
 choose('river',i=>m.land[i]&&m.river[i]&&!m.coast[i]?Math.log1p(m.flow[i]):0);
 choose('coast',i=>m.land[i]&&m.coast[i]?m.flow[i]*.001+m.height[i]:0);
 choose('mouth',i=>m.land[i]&&m.coast[i]&&m.river[i]?Math.log1p(m.flow[i]):0);
 choose('hills',i=>m.land[i]&&m.terrain[i]===3?m.relief[i]:0);
 let lakeBest=-1,lake=null;for(let i=0;i<g.land.length;i++)if(g.lakeWater[i]&&g.lake[i]>lakeBest){lakeBest=g.lake[i];lake={x:(i%g.width)/g.detail,y:Math.floor(i/g.width)/g.detail};}if(lake){positions.lake=lake;positions.lakeclose=lake;}if(positions.river)positions.riverclose=positions.river;
 const {lakeBasins}=await import('./genesis-waters.mjs'),candidate=all[revisions[1]].geography,basins=lakeBasins(candidate),connections=[],seenPairs=new Set(),r=candidate.detail,wid=candidate.width;
 // Find two represented basins linked by the actual fine drainage graph.
 for(let i=0;i<candidate.land.length;i++){if(!candidate.lakeWater[i])continue;const id=basins.labels[i],out=candidate.down[i];if(!id||out<0||basins.labels[out]===id)continue;let j=out;for(let k=0;k<r*96&&j>=0&&candidate.land[j];k++){const to=basins.labels[j];if(to===id)break;if(to&&to!==id){const key=id+':'+to;if(!seenPairs.has(key)){seenPairs.add(key);const a={x:(i%wid)/r,y:Math.floor(i/wid)/r},b={x:(j%wid)/r,y:Math.floor(j/wid)/r},distance=Math.hypot(a.x-b.x,a.y-b.y);connections.push({from:id,to,fromNode:i,toNode:j,steps:k+1,distance,a,b});}break;}j=candidate.down[j];}}
 const connection=connections.filter(c=>c.distance<25).sort((a,b)=>a.distance-b.distance)[0];if(connection)positions.lakeSystem={x:(connection.a.x+connection.b.x)/2,y:(connection.a.y+connection.b.y)/2};
 if(!positions.lake){let best=0;for(let i=0;i<candidate.land.length;i++)if(candidate.lakeWater[i]&&candidate.lake[i]>best){best=candidate.lake[i];positions.lake=positions.lakeclose={x:(i%wid)/r,y:Math.floor(i/wid)/r};}}
 
 const oldCases=new Map(stats[0].exits.cases.map(c=>[c.cell,c])),newCases=new Map(stats[1].exits.cases.map(c=>[c.cell,c]));const exitChanges={added:[...newCases].filter(([i])=>!oldCases.has(i)).map(([,c])=>c),removed:[...oldCases].filter(([i])=>!newCases.has(i)).map(([,c])=>c),retained:[...newCases].filter(([i])=>oldCases.has(i)).map(([i,c])=>({before:oldCases.get(i),after:c}))};
 window.__living.current={all,scene,positions};return {stats,positions,exitChanges,connections};},{scene,revisions});
 report.push({engine,scene:scene.id,...generated});save();
 for(const s of generated.stats){assert.equal(s.routingUphill,0);assert.equal(s.hydrology.unresolved,0);if(scene.id==='mountain'){const node=nodeResults.find(n=>n.size==='standard'&&n.revision===s.revision);report.push({engine,revision:s.revision,crossNodeDifferences:[...Object.keys(node.coarse).filter(k=>node.coarse[k]!==s.coarse[k]),...Object.keys(node.fine).filter(k=>node.fine[k]!==s.fine[k])]});}}
 const render=async(variant,location)=>{const meta=await page.evaluate(async({variant,location,revisions})=>{const {w,Camera,current}=window.__living,{genesisSource}=await import('./genesis-review.mjs'),{genesisLivingSource}=await import('./genesis-living-visual.mjs'),{naturalWatersSource}=await import('./genesis-waters.mjs'),{prepareBakedTerrain,BakedTerrainGL}=await import('./world-rendering-baked.mjs'),{vertical}=await import('./world-rendering-gl.mjs'),pos=current.positions[location],base=current.all[revisions[0]],m=variant==='baseline'?base:(variant==='detail8'||variant==='watersDetail8')?current.all.detail8:current.all[revisions[1]],cam=new Camera(w.W,w.H);cam.x=pos.x;cam.y=pos.y;cam.zoom=location.toLowerCase().includes('close')?13:5;cam.layout(1280,800);if(location==='world')cam.s=Math.min(1220/w.W,700/w.H);const radius=location.toLowerCase().includes('close')?15:30,bounds=location==='world'?[0,0,w.W,w.H]:[Math.max(0,Math.floor(pos.x-radius)),Math.max(0,Math.floor(pos.y-radius)),Math.min(w.W,Math.ceil(pos.x+radius)),Math.min(w.H,Math.ceil(pos.y+radius))],s={map:m,mapVersion:3,autonomous:true};
 cam.datum=location==='world'?0:location==='neutral'?current.scene.datum:vertical(base.height[Math.min(w.H-1,Math.floor(pos.y))*w.W+Math.min(w.W-1,Math.floor(pos.x))]);
 const waters=variant==='waters'||variant==='watersDetail8'||variant==='watersLocal8',living=variant==='living'||variant==='detail8',source=waters?await naturalWatersSource(s,cam,{bounds,detail:location==='world'?4:location.toLowerCase().includes('close')&&variant!=='watersLocal8'?16:8,vertical,yieldRow:()=>new Promise(r=>setTimeout(r,0))}):living?await genesisLivingSource(s,cam,{bounds,detail:location==='world'?4:8,vertical,yieldRow:()=>new Promise(r=>setTimeout(r,0))}):await genesisSource(s,cam,{bounds});
 const terrain=await prepareBakedTerrain(s,cam,{sourceOverride:source,geology:waters?'waters':variant==='baseline'||variant==='geometry'?'synthesis':'living',closeLOD:true});
 document.getElementById('living-gl')?.remove();const canvas=document.createElement('canvas');canvas.id='living-gl';canvas.width=1280;canvas.height=800;Object.assign(canvas.style,{position:'fixed',inset:0,width:'100%',height:'100%',zIndex:10001});document.body.append(canvas);const renderer=new BakedTerrainGL(canvas,terrain,{chunked:true});const frameMs=renderer.draw(cam,{finish:true});current.renderer=renderer;current.cam=cam;return {camera:{x:cam.x,y:cam.y,scale:cam.s,datum:cam.datum},terrain:terrain.stats,frameMs,device:renderer.device};},{variant,location,revisions});await page.locator('#living-gl').screenshot({path:join(output,[engine,scene.id,variant,location].join('-')+'.png')});const interactive=variant==='waters'&&['close','world','lakeclose','riverclose'].includes(location)?await page.evaluate(async()=>{const {renderer,cam}=window.__living.current,initial={x:cam.x,y:cam.y,s:cam.s},series=[];for(const mode of ['pan','zoom']){const gaps=[],draws=[];let prev=0;for(let i=0;i<73;i++){const time=await new Promise(requestAnimationFrame);if(i>12)gaps.push(time-prev);prev=time;const phase=i/72*Math.PI*2;if(mode==='pan'){cam.x=initial.x+Math.sin(phase)*2;cam.y=initial.y+Math.cos(phase)*1.5;}else{cam.x=initial.x;cam.y=initial.y;cam.s=initial.s*(1+.16*Math.sin(phase));}const ms=renderer.draw(cam);if(i>12)draws.push(ms);}const sorted=[...gaps].sort((a,b)=>a-b);series.push({mode,frames:gaps.length,fps:1000*gaps.length/gaps.reduce((a,b)=>a+b,0),p95:sorted[Math.ceil(sorted.length*.95)-1],max:Math.max(...gaps),submitP95:[...draws].sort((a,b)=>a-b)[Math.ceil(draws.length*.95)-1]});Object.assign(cam,initial);}return series;}):null;await page.evaluate(()=>window.__living.current.renderer.dispose());report.push({engine,scene:scene.id,variant,location,...meta,interactive});save();};
 for(const location of ['world','neutral','mountain','close','hills','river','riverclose','lake','lakeclose','lakeSystem','coast','mouth']){if(!generated.positions[location]){report.push({engine,scene:scene.id,missing:location});continue;}for(const variant of ['baseline','living','waters'])await render(variant,location);}
 if(scene.id==='mountain'){const detail8=await page.evaluate(async({scene,revision})=>{const {startGenesisGeneration,exemplars,current}=window.__living;const result=await startGenesisGeneration(scene.seed,{states:6,mapShape:'continents',experimentalGeography:{revision,approach:'field',detail:8,exemplars}},{mapOnly:true}).promise;current.all.detail8=result.value;return {workerMs:result.ms,bytes:result.bytes};},{scene,revision:revisions[1]});report.push({detail8});await render('watersDetail8','close');await render('watersLocal8','close');}
 await page.evaluate(()=>delete window.__living.current);
 }
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}}
}finally{server.kill('SIGTERM');save();}
