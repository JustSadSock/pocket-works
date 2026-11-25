import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const output=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/unified-world';mkdirSync(output,{recursive:true});
const url='http://127.0.0.1:4198/apps/crown-and-marches/';
const server=spawn(process.execPath,['scripts/serve-site.mjs'],{env:{...process.env,PORT:'4198',POCKET_WORKS_SITE_ROOT:process.env.PW_QA_SITE_ROOT||process.cwd()},stdio:'ignore'});
const reports=[];
try{
 let ready=false;for(let i=0;i<80;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready);
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){const browser=await type.launch({headless:true});try{
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
 const chosen=scenes.filter(s=>['mountain','valmar','village'].includes(s.id));
 // Rural reference: advance the actual village economy, without changing the old fixture or its map.
 const rural=await page.evaluate(()=>{const {w,worlds,scenes}=window.__geographyReview,old=worlds.get('village');w.activateWorld(old);const s=w.restore(w.serialize(old)),scene=scenes.find(q=>q.id==='village'),city=s.cities.find(q=>q.id===scene.city);for(let k=0;k<40;k++)w.step(s);let farms=0;for(let i=0;i<s.district.length;i++)if(s.admin[i]===city.id&&s.district[i]===2&&s.development[i]>.15)farms++;worlds.set('rural-village',s);return {...scene,id:'rural-village',world:'rural-village',farms};});chosen[chosen.findIndex(x=>x.id==='village')]=rural;
 // Valmar first, then the mountain and rural control. Same source state and
 // camera for A and B; candidate-only renderer is not bound to campaign input.
 for(const scene of chosen.sort((a,b)=>(a.id==='valmar'?-1:b.id==='valmar'?1:0))){
 const views=scene.id==='valmar'?['overview','middle','close']:['overview','close'];
 for(const view of views){
 const result=await page.evaluate(async({scene,view})=>{const {w,Camera,worlds,canvas}=window.__geographyReview,s=worlds.get(scene.world);w.activateWorld(s);const {buildUnifiedScene,renderUnified,proportions}=await import('./unified-world.mjs');const cam=new Camera(w.W,w.H);cam.x=scene.x;cam.y=scene.y;cam.zoom=view==='close'?scene.close:view==='middle'?(scene.zoom+scene.close)/2:scene.zoom;cam.layout(1280,800);const before=w.serialize(s),begin=performance.now(),model=await buildUnifiedScene(s,cam,scene.id==='mountain'),buildMs=performance.now()-begin;window.__unified={model,cam,s,before};return {seed:s.seed,day:s.day,view,camera:{x:cam.x,y:cam.y,zoom:cam.zoom,scale:cam.s},buildMs,buildMaxSlice:model.buildMaxSlice,objects:model.objects.length,proportions,settlements:model.towns.map(t=>({id:t.city.id,name:t.city.name,pop:t.city.pop,fort:t.city.fort,port:t.city.port,buildings:t.buildings.length,walls:t.walls.length,piers:t.piers.length,valid:t.valid,complete:t.complete,missing:t.missing,layoutMs:t.layoutMs,maxSlice:t.maxSlice,graph:t.graph})),unchanged:before===w.serialize(s)};},{scene,view});
 for(const style of ['diorama','illustrated']){
 const meta=await page.evaluate(async(style)=>{const {model,cam,s,before}=window.__unified,{w,canvas}=window.__geographyReview,{renderUnified}=await import('./unified-world.mjs');const frame=await renderUnified(model,cam,style);canvas.width=1280;canvas.height=800;const c=canvas.getContext('2d');const t=performance.now();c.drawImage(frame.canvas,0,0);const warm=performance.now()-t;return {ms:frame.ms,maxSlice:frame.maxSlice,triangles:frame.triangles,projection:frame.projection,warm,unchanged:before===w.serialize(s)};},style);
 const name=[engine,scene.id,style,view].join('-');await page.locator('#geo-review-canvas').screenshot({path:join(output,name+'.png')});reports.push({engine,scene:scene.id,style,...result,...meta});writeFileSync(join(output,'unified-world.json'),JSON.stringify(reports,null,2));assert.ok(meta.unchanged,'Renderer changed simulation');}
 assert.ok(result.unchanged);}
 }
 assert.deepEqual(errors,[]);const bad=reports.flatMap(r=>r.settlements||[]).filter(t=>!t.valid||!t.complete||t.graph.mandatory.some(p=>!p.connected));console.log(JSON.stringify({frames:reports.length,invalid:bad.map(t=>({name:t.name,missing:t.missing,graph:t.graph}))}));assert.deepEqual(bad,[],'Spatial and mandatory structure checks');
 }finally{await browser.close();}}
}finally{server.kill('SIGTERM');writeFileSync(join(output,'unified-world.json'),JSON.stringify(reports,null,2));}
