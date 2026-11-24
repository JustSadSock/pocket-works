
import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const output=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/crown-benchmark';
mkdirSync(output,{recursive:true});
const url='http://127.0.0.1:4187/apps/crown-and-marches/';
const server=spawn(process.execPath,['scripts/serve-site.mjs'],{env:{...process.env,PORT:'4187',POCKET_WORKS_SITE_ROOT:process.env.PW_QA_SITE_ROOT||process.cwd()},stdio:'ignore'});
const results=[];
try{
 let ready=false;for(let i=0;i<80;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready,'Preview must start');
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true});
 try{
 for(const [orientation,width,height] of [['portrait',390,844],['landscape',844,390]]){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 try{
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.locator('[data-act="lab"]').tap();await page.locator('[data-act="labstart"]').tap();
 await page.locator('[data-act="all"]').tap();await page.locator('[data-act="line"]').tap();
 const canvas=await page.locator('#atlas').boundingBox();assert.ok(canvas);
 const a={x:Math.floor(width*.24),y:Math.floor(height*.35)},b={x:Math.floor(width*.43),y:Math.floor(height*.42)};
 let input='touch-taps+pointer-drag';
 if(name==='chromium'){
 const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});for(let j=1;j<=5;j++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*j/5,y:a.y+(b.y-a.y)*j/5}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});input='touch-taps+CDP-touch-drag';await cdp.detach();
 }else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});await page.mouse.up();}
 await page.waitForFunction(()=>document.querySelector('[data-act="line"]')?.textContent==='Нарисовать строй',null,{timeout:5000});
 await page.locator('[data-act="speed"][data-value="1"]').tap();await page.waitForTimeout(500);await page.locator('[data-act="speed"][data-value="0"]').tap();
 await page.screenshot({path:join(output,name+'-'+orientation+'-commands.png')});
 const measurements=await page.evaluate(async()=>{
 const {customBattle,battleTick,BW,BH}=await import('./battle.mjs');const {Atlas,Camera}=await import('./render.mjs');
 const c=document.createElement('canvas');Object.assign(c.style,{position:'fixed',inset:'0',width:'100%',height:'100%',zIndex:9999});document.body.append(c);
 const atlas=new Atlas(c),camera=new Camera(BW,BH);camera.zoom=1.15;
 const percentile=(a,p)=>{a.sort((x,y)=>x-y);return Number((a[Math.floor((a.length-1)*p)]||0).toFixed(2));};
 const report=[];
 for(const n of [500,1000,3000]){
 const config={seed:123,landscape:'plain',weather:'clear',sides:[0,1].map(side=>({ai:true,offsetX:side?-220:220,units:[{type:2,n:n*.3},{type:4,n:n*.1},{type:7,n:n*.1}]}))};
 let b=customBattle(config);for(let i=0;i<60&&b.winner===null;i++)battleTick(b,.1);if(b.winner!==null)b=customBattle(config);
 const sim=[],render=[],intervals=[];let acc=0,frames=0,ticks=0,start=performance.now(),last=start;
 await new Promise(resolve=>{function frame(t){let delta=Math.min(.2,(t-last)/1000);if(frames)intervals.push(t-last);last=t;acc+=delta;
 while(acc>=.1&&b.winner===null){const now=performance.now();battleTick(b,.1);sim.push(performance.now()-now);acc-=.1;ticks++;if(ticks>200)break;}
 const now=performance.now();atlas.battle(b,camera,[],'high');render.push(performance.now()-now);frames++;
 if(t-start<3000&&ticks<200)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});
 const wall=performance.now()-start;report.push({soldiers:b.soldiers.length,frames,ticks,wallMs:Math.round(wall),fps:Number((frames*1000/wall).toFixed(1)),simMedian:percentile(sim,.5),simP95:percentile(sim,.95),renderMedian:percentile(render,.5),renderP95:percentile(render,.95),frameP95:percentile(intervals,.95),casualties:b.soldiers.filter(p=>p.hp<=0).length});
 }
 c.remove();return report;
 });
 for(const m of measurements){assert.ok(m.frames>0&&m.ticks>0&&m.soldiers>=500);}
 assert.deepEqual(errors,[]);results.push({engine:name,orientation,input,measurements});console.log(JSON.stringify(results.at(-1)));
 }finally{await context.close();}
 }
 }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');writeFileSync(join(output,'battle-performance.json'),JSON.stringify(results,null,2));}
