import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {fetchDolomites} from './terrain-dem-source.mjs';
const output=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/terrain-forge-study';mkdirSync(output,{recursive:true});
const url='http://127.0.0.1:4202/apps/crown-and-marches/';
const server=spawn(process.execPath,['scripts/serve-site.mjs'],{env:{...process.env,PORT:'4202',POCKET_WORKS_SITE_ROOT:process.env.PW_QA_SITE_ROOT||process.cwd()},stdio:'ignore'});
const reports=[];
try{
 const dem=await fetchDolomites();writeFileSync(join(output,'dem-provenance.json'),JSON.stringify(dem.metadata,null,2));
 let ready=false;for(let i=0;i<80;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready);
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){const browser=await type.launch({headless:true,...(engine==='chromium'?{args:['--enable-unsafe-swiftshader']}: {})});try{
 const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url,{waitUntil:'domcontentloaded'});
 const scenes=await page.evaluate(async()=>{
 const w=await import('./world.mjs'),{Atlas,Camera}=await import('./render.mjs');
 const canvas=document.createElement('canvas');canvas.id='geo-review-canvas';Object.assign(canvas.style,{position:'fixed',inset:'0',width:'100%',height:'100%',zIndex:10000});document.body.append(canvas);const atlas=new Atlas(canvas),worlds=new Map(),scenes=[];
 const s=w.campaignSandbox({seed:'living-atlas-reset-region',states:3,spacing:13,peaceful:true,regiments:0,roads:2,fort:1,humanFaction:-1,sides:[{population:6000,stockScale:4,gold:1200,fort:3},{population:1900,stockScale:3,gold:400},{population:650,stockScale:2,gold:300}]});const city=s.cities[0];const builds=[];for(const k of [0,1,2,3,4,6,'road'])builds.push(w.build(s,city,k));for(const q of s.cities)if(w.coastal(s,q))builds.push(w.buildPort(s,q));for(let i=0;i<8;i++)w.step(s);
 const camera=new Camera(w.W,w.H),bounds={x:s.cities.reduce((n,q)=>n+w.xx(q.i),0)/s.cities.length+.5,y:s.cities.reduce((n,q)=>n+w.yy(q.i),0)/s.cities.length+.5};camera.x=bounds.x;camera.y=bounds.y;const spanX=Math.max(...s.cities.map(q=>w.xx(q.i)))-Math.min(...s.cities.map(q=>w.xx(q.i))),spanY=Math.max(...s.cities.map(q=>w.yy(q.i)))-Math.min(...s.cities.map(q=>w.yy(q.i)));const regionZoom=Math.min(5,w.W/(spanX+12),w.H/(spanY+12));camera.zoom=regionZoom;

 worlds.set('original',s);scenes.push({id:'original-region',world:'original',x:bounds.x,y:bounds.y,zoom:regionZoom,close:Math.min(14,regionZoom*2)});scenes.push({id:'valmar',world:'original',x:w.xx(city.i)+.5,y:w.yy(city.i)+.5,zoom:14,close:24,city:city.id});
 const defs=[['mountain','atlas-mountain-173','mountain'],['bay','atlas-bay-242','bay'],['forest','atlas-forest-311','forest'],['valley','atlas-valley-418','valley']];
 for(const [id,seed,kind] of defs){const world=w.newGame(seed,{states:6,mapShape:kind==='bay'?'archipelago':'continents'});world.autonomous=true;worlds.set(id,world);let best=-1,score=-Infinity;
 for(let y=12;y<w.H-12;y+=2)for(let x=12;x<w.W-12;x+=2){const i=w.idx(x,y);if(!world.map.land[i])continue;let mountain=0,river=0,forest=0,water=0,fert=0,coast=0;
 for(let dy=-8;dy<=8;dy+=2)for(let dx=-8;dx<=8;dx+=2){const j=w.idx(x+dx,y+dy);mountain+=world.map.terrain[j]===4?2:world.map.terrain[j]===3?1:0;river+=world.map.river[j];forest+=world.map.terrain[j]===2;water+=!world.map.land[j];fert+=world.map.fert[j]*(world.map.land[j]?1:0);coast+=world.map.coast[j];}
 const n=kind==='mountain'?mountain+river*4:kind==='bay'?coast*3-Math.abs(water-35)*.9:kind==='forest'?forest*2-water:fert+river*2-mountain*.4-water;
 if(n>score){score=n;best=i;}}
 if(best<0)throw Error('No geographic fixture '+kind);scenes.push({id,world:id,x:w.xx(best)+.5,y:w.yy(best)+.5,zoom:5,close:13,score});
 }
 const settlements=[['village',650,0,0],['trade-town',2400,1,0],['fortified-capital',6000,3,0],['sea-port',4202,1,3]];
 for(const [id,pop,fort,port] of settlements){const seed='atlas-settlement-'+id;let world=null,city=null;
 for(let attempt=0;attempt<12;attempt++){world=w.campaignSandbox({seed:seed+'-'+attempt,states:6,theatre:'world',peaceful:true,regiments:0,roads:2,fort,humanFaction:-1,sides:Array.from({length:6},()=>({population:pop,stockScale:4,gold:1200,fort}))});city=world.cities.find(q=>port?w.coastal(world,q):!w.coastal(world,q));if(city)break;}
 if(!city)throw Error('No settlement fixture '+id);
 // Use the existing sandbox parameters for population and fortification; ordinary construction and port actions for buildings.
 // The village and trading town use the same simulation city schema, without capital-specific graphic privileges.
 if(id==='village'||id==='trade-town'||id==='sea-port')city.capital=false;
 if(id!=='village')for(const k of [0,1,2,3,6,'road'])w.build(world,city,k);
 for(let k=0;k<port;k++)w.buildPort(world,city);
 worlds.set(id,world);scenes.push({id,world:id,x:w.xx(city.i)+.5,y:w.yy(city.i)+.5,zoom:9,close:24,city:city.id});
 }
 window.__geographyReview={w,Atlas,Camera,atlas,worlds,scenes,canvas};return scenes;
 });
 const mountain=scenes.find(s=>s.id==='mountain');
 const variants=['forge','reference'];
 for(const kind of variants){
 const setup=await page.evaluate(async({scene,kind,dem})=>{const {w,Camera,worlds}=window.__geographyReview,s=worlds.get(scene.world);w.activateWorld(s);const {prepareBakedTerrain,BakedTerrainGL}=await import('./world-rendering-baked.mjs'),{realSource,reconstructTerrain,sourceMetrics,terrainMetrics}=await import('./terrain-art-lab.mjs'),{prepareTerrain}=await import('./world-rendering-gl.mjs');const cam=new Camera(w.W,w.H);cam.x=scene.x;cam.y=scene.y;cam.zoom=scene.zoom;cam.layout(1280,800);const before=w.serialize(s);if(kind==='real'||kind==='reference'){cam.x=cam.y=24;}let gpu=document.getElementById('world-gl-canvas');if(gpu)gpu.remove();gpu=document.createElement('canvas');gpu.id='world-gl-canvas';gpu.width=1280;gpu.height=800;Object.assign(gpu.style,{position:'fixed',inset:'0',width:'100%',height:'100%',zIndex:10001});document.body.append(gpu);const source=kind==='real'||kind==='reference'?realSource(dem):kind==='control'?await prepareTerrain(s,cam,{detail:8,heightStyle:'smooth',textureOnly:true}):await reconstructTerrain(s,cam,kind);const metrics=await sourceMetrics(source);const terrain=await prepareBakedTerrain(s,cam,{sourceOverride:source,geology:kind!=='real'&&kind!=='control'});const renderer=new BakedTerrainGL(gpu,terrain,{chunked:true});window.__glReview={renderer,cam,s,before,scene,kind};return {kind,seed:kind==='real'||kind==='reference'?'Dolomites DEM':s.seed,day:s.day,camera:{x:cam.x,y:cam.y,zoom:cam.zoom,scale:cam.s},terrain:terrain.stats,metrics,device:renderer.device,uploadMs:renderer.uploadMs,unchanged:before===w.serialize(s)};},{scene:mountain,kind,dem:kind==='real'||kind==='reference'?dem:null});
 assert.ok(setup.unchanged);assert.ok(setup.terrain.anchorError<1e-6);assert.ok((setup.terrain.visualAnchorError||0)<1e-6);reports.push({engine,setup});
 for(const view of ['overview','middle','close']){const data=await page.evaluate(view=>{const {renderer,cam,s,before,scene,kind}=window.__glReview,{w}=window.__geographyReview;cam.x=kind==='real'||kind==='reference'?24:scene.x;cam.y=kind==='real'||kind==='reference'?24:scene.y;cam.zoom=view==='overview'?scene.zoom:view==='close'?scene.close:(scene.zoom+scene.close)/2;cam.layout(1280,800);const ms=renderer.draw(cam,{finish:true});return {view,ms,camera:{x:cam.x,y:cam.y,zoom:cam.zoom,scale:cam.s},unchanged:before===w.serialize(s)};},view);await page.locator('#world-gl-canvas').screenshot({path:join(output,engine+'-'+kind+'-'+view+'.png')});reports.push({engine,kind,...data});assert.ok(data.unchanged);writeFileSync(join(output,'terrain-forge-study.json'),JSON.stringify(reports,null,2));}
 const motion=await page.evaluate(async()=>{const {renderer,cam,s,before,scene,kind}=window.__glReview,{w}=window.__geographyReview,N=24,results=[];for(const cull of [false,true]){const frames=[],sync=[],tri=[],calls=[];let last=performance.now();for(let i=0;i<N;i++){await new Promise(requestAnimationFrame);const now=performance.now(),t=i/(N-1);frames.push(now-last);last=now;cam.x=(kind==='real'||kind==='reference'?24:scene.x)+Math.sin(t*Math.PI*2)*2;cam.y=(kind==='real'||kind==='reference'?24:scene.y)+Math.sin(t*Math.PI)*1.4;cam.zoom=scene.zoom+(scene.close-scene.zoom)*Math.sin(t*Math.PI);cam.layout(1280,800);sync.push(renderer.draw(cam,{finish:true,cull}));tri.push(renderer.lastDraw.triangles/renderer.lastDraw.fullTriangles);calls.push(renderer.lastDraw.calls);}const p=(a,q)=>[...a].sort((a,b)=>a-b)[Math.ceil(a.length*q)-1];results.push({cull,frames:N,rafP95:p(frames,.95),syncP95:p(sync,.95),fps:1000/(frames.reduce((a,b)=>a+b,0)/N),triangleFraction:tri.reduce((a,b)=>a+b,0)/N,drawCalls:calls.reduce((a,b)=>a+b,0)/N});}return {results,unchanged:before===w.serialize(s)};});reports.push({engine,kind,motion});assert.ok(motion.unchanged);await page.evaluate(()=>window.__glReview.renderer.dispose());
 }
 assert.deepEqual(errors,[]);writeFileSync(join(output,'terrain-forge-study.json'),JSON.stringify(reports,null,2));
 }finally{await browser.close();}}
}finally{server.kill('SIGTERM');writeFileSync(join(output,'terrain-forge-study.json'),JSON.stringify(reports,null,2));}
