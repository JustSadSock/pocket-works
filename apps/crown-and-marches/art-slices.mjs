import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const output=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/living-atlas-reset';mkdirSync(output,{recursive:true});
const url='http://127.0.0.1:4193/apps/crown-and-marches/';
const server=spawn(process.execPath,['scripts/serve-site.mjs'],{env:{...process.env,PORT:'4193',POCKET_WORKS_SITE_ROOT:process.env.PW_QA_SITE_ROOT||process.cwd()},stdio:'ignore'});
const reports=[];
try{
 let ready=false;for(let i=0;i<80;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready,'Preview must start');
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){const browser=await type.launch({headless:true});try{const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url,{waitUntil:'domcontentloaded'});
 const report=await page.evaluate(async()=>{const w=await import('./world.mjs'),b=await import('./battle.mjs'),{Atlas,Camera,drawNavalScene}=await import('./render.mjs');const c=document.createElement('canvas');Object.assign(c.style,{position:'fixed',inset:'0',width:'100%',height:'100%',zIndex:10000});document.body.append(c);const atlas=new Atlas(c),shots={},meta={};const capture=(name)=>{shots[name]=c.toDataURL('image/png').split(',')[1];};
 try{
 const s=w.campaignSandbox({seed:'living-atlas-reset-region',states:3,spacing:13,peaceful:true,regiments:0,roads:2,fort:1,humanFaction:-1,sides:[{population:6000,stockScale:4,gold:1200,fort:3},{population:1900,stockScale:3,gold:400},{population:650,stockScale:2,gold:300}]});const city=s.cities[0];const builds=[];for(const k of [0,1,2,3,4,6,'road'])builds.push(w.build(s,city,k));for(const q of s.cities)if(w.coastal(s,q))builds.push(w.buildPort(s,q));for(let i=0;i<8;i++)w.step(s);
 const camera=new Camera(w.W,w.H),bounds={x:s.cities.reduce((n,q)=>n+w.xx(q.i),0)/s.cities.length+.5,y:s.cities.reduce((n,q)=>n+w.yy(q.i),0)/s.cities.length+.5};camera.x=bounds.x;camera.y=bounds.y;const spanX=Math.max(...s.cities.map(q=>w.xx(q.i)))-Math.min(...s.cities.map(q=>w.xx(q.i))),spanY=Math.max(...s.cities.map(q=>w.yy(q.i)))-Math.min(...s.cities.map(q=>w.yy(q.i)));const regionZoom=Math.min(5,w.W/(spanX+12),w.H/(spanY+12));camera.zoom=regionZoom;
 for(const [name,mode] of [['region','geography'],['region-political','political']]){for(const candidate of [false,true]){atlas.artCandidate=candidate;atlas.map(s,camera,mode,null,'high');capture(name+'-'+(candidate?'candidate':'baseline'));}}
 camera.x=w.xx(city.i)+.5;camera.y=w.yy(city.i)+.5;camera.zoom=14;
 for(const candidate of [false,true]){atlas.artCandidate=candidate;atlas.map(s,camera,'political',null,'high');capture('capital-'+(candidate?'candidate':'baseline'));}
 meta.region={seed:s.seed,day:s.day,cities:s.cities.map(q=>({id:q.id,name:q.name,i:q.i,pop:q.pop,fort:q.fort,port:q.port,build:q.build})),builds,regionCamera:{...bounds,zoom:regionZoom},capitalCamera:{x:camera.x,y:camera.y,zoom:14}};
 atlas.artCandidate=false;
 const fight=b.customBattle({seed:1080,landscape:'hills',weather:'clear',historical:true,sides:[0,1].map(side=>({ai:true,offsetX:side?-180:180,units:[{type:1,n:72},{type:2,n:72},{type:4,n:48},{type:7,n:48},{type:5,n:32},{type:8,n:8}]}))});const bc=new Camera(b.BW,b.BH);
 for(let k=0;k<650&&fight.winner===null;k++){b.battleTick(fight,.1);if(k===119||k===239||k===359){atlas.battle(fight,bc,[],'high');capture('land-motion-'+(k+1));}if(k>119&&fight.soldiers.filter(p=>p.hp<1).length>=20)break;}
 atlas.battle(fight,bc,[],'high');capture('land-active-baseline');const group=fight.units.find(g=>g.alive&&g.type===1)||fight.units.find(g=>g.alive);if(group){bc.x=group.x;bc.y=group.y;bc.zoom=4;for(let k=0;k<180;k++){atlas.battle(fight,bc,[group.id],'high');if(!atlas.detailPending)break;}capture('land-close-baseline');}
 meta.land={seed:1080,time:fight.time,soldiers:fight.soldiers.length,injured:fight.soldiers.filter(p=>p.hp<1).length,types:[...new Set(fight.soldiers.map(p=>p.type))]};
 const naval=w.customNavalBattle({seed:'living-atlas-reset-naval',wind:45,sides:[0,1].map(()=>[1,3,5,6,7].map(type=>({type,n:1,experience:.75})))});drawNavalScene(atlas,naval,[],'high');capture('naval-deployment-baseline');
 for(let k=0;k<1100&&naval.winner===null;k++){w.navalBattleTick(naval);if(k===99||k===199||k===299){drawNavalScene(atlas,naval,[],'high');capture('naval-motion-'+(k+1));}if(naval.shots>=8&&naval.ships.some(q=>q.hp<.95))break;}drawNavalScene(atlas,naval,[],'high');capture('naval-active-baseline');meta.naval={seed:naval.seed,time:naval.time,shots:naval.shots,ships:naval.ships.map(q=>({type:q.type,hp:q.hp,fire:q.fire,status:q.status}))};
 return {shots,meta};}finally{c.remove();}});
 for(const [name,png] of Object.entries(report.shots))writeFileSync(join(output,engine+'-'+name+'.png'),Buffer.from(png,'base64'));assert.deepEqual(errors,[]);assert.ok(report.meta.region.cities.length>=3);assert.ok(report.meta.land.injured>0,'Land scene must include actual combat');assert.ok(report.meta.naval.shots>0,'Naval scene must include real fire');reports.push({engine,...report.meta});console.log(JSON.stringify(reports.at(-1)));
 }finally{await browser.close();}}
}finally{server.kill('SIGTERM');writeFileSync(join(output,'slice-metadata.json'),JSON.stringify(reports,null,2));}
