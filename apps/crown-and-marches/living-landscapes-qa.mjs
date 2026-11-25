import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const output=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/living-landscapes';mkdirSync(output,{recursive:true});
const url='http://127.0.0.1:4195/apps/crown-and-marches/';
const server=spawn(process.execPath,['scripts/serve-site.mjs'],{env:{...process.env,PORT:'4195',POCKET_WORKS_SITE_ROOT:process.env.PW_QA_SITE_ROOT||process.cwd()},stdio:'ignore'});
const reports=[];
try{
 let ready=false;for(let i=0;i<80;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready);
 for(const [engine,type] of [['chromium',chromium]]){const browser=await type.launch({headless:true});try{
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
 const asset=await page.evaluate(async()=>{const {resourceSheet}=await import('./landscape-assets.mjs');const t=performance.now(),sheet=resourceSheet();return {png:sheet.toDataURL('image/png').split(',')[1],ms:performance.now()-t};});writeFileSync(join(output,'architecture-and-vegetation-atlas.png'),Buffer.from(asset.png,'base64'));reports.push({engine,assets:asset.ms});
 const chosen=scenes.filter(s=>['mountain','bay','forest','valley','valmar','village','trade-town','fortified-capital','sea-port'].includes(s.id));
 for(const scene of chosen){const views=scene.id==='valmar'?['overview','middle','close']:['overview'];for(const view of views){const mode=['mountain','bay','forest','valley'].includes(scene.id)?'geography':'political';const meta=await page.evaluate(async({scene,mode,view})=>{const {w,Camera,atlas,worlds}=window.__geographyReview,s=worlds.get(scene.world);w.activateWorld(s);const cam=new Camera(w.W,w.H);cam.x=scene.x;cam.y=scene.y;cam.zoom=view==='close'?scene.close:view==='middle'?(scene.zoom+scene.close)/2:scene.zoom;atlas.artCandidate='living';const before=w.serialize(s),start=performance.now();atlas.map(s,cam,mode,null,'high');if(atlas.reviewPending)await atlas.reviewPending;atlas.map(s,cam,mode,null,'high');const cold=performance.now()-start,coldProfile={...atlas.metrics.geography};atlas.map(s,cam,mode,null,'high');return {seed:s.seed,day:s.day,view,mode,camera:{x:cam.x,y:cam.y,zoom:cam.zoom,scale:cam.s},cold,coldProfile,warm:atlas.metrics.geography.totalMs,...atlas.metrics.geography,unchanged:before===w.serialize(s),city:s.cities.find(q=>q.id===scene.city)?{id:scene.city,pop:s.cities.find(q=>q.id===scene.city).pop,port:s.cities.find(q=>q.id===scene.city).port,fort:s.cities.find(q=>q.id===scene.city).fort}:null};},{scene,mode,view});const name=[engine,scene.id,mode,view].join('-');await page.locator('#geo-review-canvas').screenshot({path:join(output,name+'.png')});reports.push({engine,scene:scene.id,...meta});assert.ok(meta.unchanged,'Renderer changed simulation');assert.ok(meta.settlements.every(q=>q.valid),'Unsafe settlement layout');}}
 writeFileSync(join(output,'living-landscapes.json'),JSON.stringify(reports,null,2));assert.deepEqual(errors,[]);const missing=reports.flatMap(r=>r.settlements||[]).filter(t=>!t.complete);console.log(JSON.stringify({frames:reports.length-1,missing:missing.map(t=>({name:t.name,missing:t.missing}))}));assert.deepEqual(missing,[],'Mandatory structures must not silently disappear');
 }finally{await browser.close();}}
}finally{server.kill('SIGTERM');writeFileSync(join(output,'living-landscapes.json'),JSON.stringify(reports,null,2));}
