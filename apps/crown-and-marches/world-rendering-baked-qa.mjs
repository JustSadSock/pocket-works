import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const output=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/world-rendering-baked';mkdirSync(output,{recursive:true});
const url='http://127.0.0.1:4200/apps/crown-and-marches/';
const server=spawn(process.execPath,['scripts/serve-site.mjs'],{env:{...process.env,PORT:'4200',POCKET_WORKS_SITE_ROOT:process.env.PW_QA_SITE_ROOT||process.cwd()},stdio:'ignore'});
const reports=[];
try{
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
 const settlements=[['village',650,0,0],['trade-town',2400,1,0],['fortified-capital',6000,3,0],['sea-port',4200,1,3]];
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
 const setup=await page.evaluate(async scene=>{const {w,Camera,worlds,canvas}=window.__geographyReview,s=worlds.get(scene.world);w.activateWorld(s);const {prepareBakedTerrain,BakedTerrainGL}=await import('./world-rendering-baked.mjs');const cam=new Camera(w.W,w.H);cam.x=scene.x;cam.y=scene.y;cam.zoom=scene.zoom;cam.layout(1280,800);const before=w.serialize(s);const gpu=document.createElement('canvas');gpu.id='world-gl-canvas';gpu.width=1280;gpu.height=800;Object.assign(gpu.style,{position:'fixed',inset:'0',width:'100%',height:'100%',zIndex:10001});document.body.append(gpu);const terrain=await prepareBakedTerrain(s,cam);const renderer=new BakedTerrainGL(gpu,terrain);window.__glReview={renderer,terrain,cam,s,before,scene};return {seed:s.seed,day:s.day,camera:{x:cam.x,y:cam.y,zoom:cam.zoom,scale:cam.s},terrain:terrain.stats,device:renderer.device,uploadMs:renderer.uploadMs,unchanged:before===w.serialize(s)};},mountain);
 assert.ok(setup.unchanged);assert.ok(setup.terrain.anchorError<1e-6,'Source height samples changed');reports.push({engine,scene:'mountain',setup});writeFileSync(join(output,'world-rendering-baked.json'),JSON.stringify(reports,null,2));
 for(const view of ['overview','middle','close']){const data=await page.evaluate(view=>{const {renderer,cam,s,before,scene}=window.__glReview,{w}=window.__geographyReview;cam.x=scene.x;cam.y=scene.y;cam.zoom=view==='overview'?scene.zoom:view==='close'?scene.close:(scene.zoom+scene.close)/2;cam.layout(1280,800);const ms=renderer.draw(cam,{finish:true});return {view,ms,camera:{x:cam.x,y:cam.y,zoom:cam.zoom,scale:cam.s},unchanged:before===w.serialize(s)};},view);await page.locator('#world-gl-canvas').screenshot({path:join(output,engine+'-mountain-baked-'+view+'.png')});reports.push({engine,scene:'mountain',...data});assert.ok(data.unchanged);}
 // Measure the same camera path with resident buffers. RAF captures end-to-end
 // frame intervals; finish captures CPU submission + GPU completion.
 const motion=await page.evaluate(async()=>{const {renderer,cam,s,before,scene}=window.__glReview,{w}=window.__geographyReview,frames=[],sync=[],N=36;let last=performance.now();for(let i=0;i<N;i++){await new Promise(requestAnimationFrame);const now=performance.now(),t=i/(N-1);frames.push(now-last);last=now;cam.x=scene.x+Math.sin(t*Math.PI*2)*2;cam.y=scene.y+Math.sin(t*Math.PI)*1.4;cam.zoom=scene.zoom+(scene.close-scene.zoom)*Math.sin(t*Math.PI);cam.layout(1280,800);sync.push(renderer.draw(cam,{finish:true}));}const p=(a,q)=>[...a].sort((a,b)=>a-b)[Math.ceil(a.length*q)-1];return {frames:N,rafP50:p(frames,.5),rafP95:p(frames,.95),syncP50:p(sync,.5),syncP95:p(sync,.95),syncMax:Math.max(...sync),fps:1000/(frames.reduce((a,b)=>a+b,0)/N),unchanged:before===w.serialize(s)};});reports.push({engine,motion});assert.ok(motion.unchanged);
 for(let i=0;i<12;i++){await page.evaluate(i=>{const {renderer,cam,scene}=window.__glReview,t=i/11;cam.x=scene.x+Math.sin(t*Math.PI*2)*2;cam.y=scene.y+Math.sin(t*Math.PI)*1.4;cam.zoom=scene.zoom+(scene.close-scene.zoom)*Math.sin(t*Math.PI);cam.layout(1280,800);renderer.draw(cam,{finish:true});},i);await page.locator('#world-gl-canvas').screenshot({path:join(output,engine+'-motion-'+String(i).padStart(2,'0')+'.png')});}
 await page.evaluate(()=>window.__glReview.renderer.dispose());assert.deepEqual(errors,[]);writeFileSync(join(output,'world-rendering-baked.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports.filter(x=>x.engine===engine)));
 }finally{await browser.close();}}
}finally{server.kill('SIGTERM');writeFileSync(join(output,'world-rendering-baked.json'),JSON.stringify(reports,null,2));}
