import {chromium,webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

// Only input events drive gameplay. The debug snapshot is an observation surface,
// never a backdoor for teleporting, setting progress, or changing simulation time.
const directory=process.env.CORVUS_QA_DIR||'/tmp/corvus-qa';await mkdir(directory,{recursive:true});
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
let server,url=process.env.CORVUS_QA_URL;
if(!url){
 const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.glb':'model/gltf-binary','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'};
 server=createServer(async(req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(root,`.${pathname}${pathname.endsWith('/')?'index.html':''}`);
  if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}
  try{res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end('Not found');}
 });
 await new Promise(done=>server.listen(0,'127.0.0.1',done));url=`http://127.0.0.1:${server.address().port}`;
}
const reports=[],names=(process.env.CORVUS_QA_BROWSERS||'chromium,webkit').split(',');
try{for(const name of names){
 const type={chromium,webkit}[name];assert(type,`Unknown browser ${name}`);
 const executablePath=process.env[`CORVUS_${name.toUpperCase()}_PATH`];
 let browser,observed,heartbeat,failureShot;
 try{
  browser=await type.launch({headless:true,...(executablePath?{executablePath}:{}),...(name==='chromium'&&executablePath?{args:['--no-sandbox','--single-process','--no-zygote']}: {})});
  const context=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,deviceScaleFactor:1});
  const page=await context.newPage(),errors=[],failed=[],samples=[],checks=[];
  observed={checks,errors,failed,rendererFps:samples};page.setDefaultTimeout(120000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>failed.push(r.url()));
  const state=()=>page.evaluate(()=>window.__AI_TEST_STATE__);
  const shot=tag=>page.screenshot({path:`${directory}/${name}-${tag}.png`});failureShot=()=>shot('failed');
  heartbeat=setInterval(async()=>{try{const s=await state();if(s)console.log(name,'HEARTBEAT',JSON.stringify({phase:s.phase,position:s.position,yaw:s.yaw,speed:s.speed,grounded:s.grounded,mode:s.mode,carry:s.ecology?.carrying,foods:s.ecology?.foods,nuts:s.ecology?.nuts,visited:s.ecology?.visited}));}catch{}},2000);
  const wait=async predicate=>{try{return await page.waitForFunction(predicate,undefined,{timeout:240000});}catch(error){throw Error(`${error.message}; last observed state: ${JSON.stringify(await state())}`);}};
  const tap=async id=>{const b=await page.locator(id).boundingBox();assert(b);await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);};
  const hold=async(key,predicate)=>{console.log(name,'HOLD',key,predicate.toString());await page.keyboard.down(key);try{await wait(predicate);}finally{await page.keyboard.up(key);}console.log(name,'HOLD COMPLETE',key,JSON.stringify(await state()));};
  const home=async()=>{await tap('#pause');await tap('#home');await wait(()=>window.__AI_TEST_STATE__?.support==='home'&&window.__AI_TEST_STATE__.grounded);};
  await page.goto(`${url}/apps/corvus-yard/`);
  await wait(()=>window.__AI_TEST_STATE__?.phase==='menu');await shot('menu');
  if(process.env.CORVUS_QA_MUTE==='1')await tap('#sound');await tap('#start');await wait(()=>window.__AI_TEST_STATE__?.phase==='playing');assert.equal((await state()).rigReady,true);await shot('perched');checks.push('portrait touch start');console.log(name,'STARTUP',JSON.stringify(await state()));
  if(name==='chromium'){
   const cdp=await context.newCDPSession(page),b=await page.locator('#flap').boundingBox();assert(b);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});
   try{await wait(()=>window.__AI_TEST_STATE__?.position.y>10&&!window.__AI_TEST_STATE__.grounded);}finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}checks.push('native touch hold takeoff');
  }else await hold('Space',()=>window.__AI_TEST_STATE__?.position.y>10&&!window.__AI_TEST_STATE__.grounded);
  console.log(name,'AIRBORNE',JSON.stringify(await state()));await shot('flight');await wait(()=>window.__AI_TEST_STATE__?.mode==='glide');await shot('glide');
  const airborne=await state();assert(airborne.speed>3);assert(airborne.ecology.wildlife>0);checks.push('takeoff and glide');
  if(name==='chromium'){
   const cdp=await context.newCDPSession(page),stick=await page.locator('#stick').boundingBox(),flap=await page.locator('#flap').boundingBox();assert(stick&&flap);
   const startingYaw=(await state()).yaw;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:stick.x+stick.width*.8,y:stick.y+stick.height*.5,id:2},{x:flap.x+flap.width*.5,y:flap.y+flap.height*.5,id:3}]});
   try{await page.waitForFunction(yaw=>Math.abs(window.__AI_TEST_STATE__.yaw-yaw)>.15,startingYaw);}finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});}
   await page.waitForFunction(()=>!document.querySelector('#stick').classList.contains('pressed')&&!document.querySelector('#flap').classList.contains('pressed'));
   assert.equal(await page.locator('#stick .thumb').evaluate(e=>e.style.transform),'translate(0px, 0px)');checks.push('native two-finger stick/flap steering and touch cancellation');await shot('multitouch');
  }

  for(let i=0;i<5;i++){samples.push((await state()).fps);await page.waitForTimeout(250);}
  await tap('#pause');await wait(()=>window.__AI_TEST_STATE__?.phase==='paused');const stopped=(await state()).position;await page.waitForTimeout(300);assert.deepEqual((await state()).position,stopped);
  assert.equal(await page.locator('#pause-menu .exit').isVisible(),true);await tap('#home');await wait(()=>window.__AI_TEST_STATE__?.grounded&&window.__AI_TEST_STATE__.support==='home');checks.push('pause freeze and home return');
  // Walk off the home branch backwards; ground food is directly below/behind it.
  await hold('KeyS',()=>!window.__AI_TEST_STATE__.grounded&&window.__AI_TEST_STATE__.position.y<6.2);
  await hold('Shift',()=>window.__AI_TEST_STATE__.grounded&&window.__AI_TEST_STATE__.position.y<2);
  await shot('ground');checks.push('branch walkoff and ground landing');console.log(name,'GROUND',JSON.stringify(await state()));
  if(process.env.CORVUS_QA_FULL==='1'){
   const angle=a=>Math.atan2(Math.sin(a),Math.cos(a));
   const keys=new Set();
   const setKeys=async wanted=>{for(const k of keys)if(!wanted.includes(k)){await page.keyboard.up(k);keys.delete(k);}for(const k of wanted)if(!keys.has(k)){await page.keyboard.down(k);keys.add(k);}};
   const navigate=async(target,{flight=false,tolerance=.4,timeout=360000}={})=>{
    const deadline=Date.now()+timeout;let nextTelemetry=0;console.log(name,'NAVIGATE',JSON.stringify({target,flight,tolerance}));
    while(Date.now()<deadline){
     const s=await state();if(Date.now()>nextTelemetry){nextTelemetry=Date.now()+2000;console.log(name,'NAV STATE',JSON.stringify({position:s.position,yaw:s.yaw,speed:s.speed,grounded:s.grounded,mode:s.mode,phase:s.phase,carry:s.ecology.carrying}));}assert(Number.isFinite(s.yaw),'QA snapshot must expose yaw for observational steering');
     if(flight&&s.phase==='complete'&&s.ecology.visited.includes('bell-tower')){await setKeys([]);return s;}
     const dx=target[0]-s.position.x,dz=target[2]-s.position.z,dy=target[1]-s.position.y,d=Math.hypot(dx,dz);
     if(d<tolerance&&(!flight||Math.abs(dy)<1.2)){await setKeys([]);return s;}
     const error=angle(Math.atan2(dx,dz)-s.yaw),wanted=[];
     if(Math.abs(error)>.15)wanted.push(error>0?'KeyD':'KeyA');
     if(flight){if(dy>1.3){wanted.push('KeyW','Space');}else if(d>5)wanted.push('Space');if(d<5&&dy<1.4)wanted.push('Shift');}
     else if(Math.abs(error)<.65&&d>tolerance)wanted.push('KeyW');
     await setKeys(wanted);await page.waitForTimeout(100);
    }
    await setKeys([]);throw Error(`Navigation failed to ${target}: ${JSON.stringify(await state())}`);
   };
   for(let meal=0;meal<2;meal++){
    const target=(await state()).ecology.targets.filter(t=>t.kind==='scrap').sort((a,b)=>Math.hypot(a.position[0],a.position[2]+17)-Math.hypot(b.position[0],b.position[2]+17))[0];assert(target);await navigate(target.position,{tolerance:.35});await tap('#interact');await wait(()=>window.__AI_TEST_STATE__.ecology.carrying==='scrap');await tap('#interact');await page.waitForFunction(n=>window.__AI_TEST_STATE__.ecology.foods===n,meal+1);console.log(name,'MEAL',meal+1);
   }
   assert.equal((await state()).ecology.foods,2);await shot('two-meals');checks.push('two meals through actual pickup/eat controls');
   const walnut=(await state()).ecology.targets.filter(t=>t.kind==='walnut').sort((a,b)=>Math.hypot(a.position[0]+12,a.position[2]+20)-Math.hypot(b.position[0]+12,b.position[2]+20))[0];
   await navigate([-7.5,.46,-17]);await navigate([-7.5,.46,-22]);await navigate(walnut.position);await tap('#interact');await wait(()=>window.__AI_TEST_STATE__.ecology.carrying==='walnut');
   await navigate([-12,.46,-26]);
   await page.keyboard.down('KeyW');await hold('Space',()=>window.__AI_TEST_STATE__.position.y>5);await page.keyboard.up('KeyW');await tap('#drop');await wait(()=>window.__AI_TEST_STATE__.ecology.nuts>=1);await shot('cracked-walnut');checks.push('walnut carried, airborne drop and hard-surface crack');console.log(name,'NUT',JSON.stringify(await state()));
   await navigate([6,45,30],{flight:true,tolerance:2});await navigate([3,43.4,49],{flight:true,tolerance:.5});
   await setKeys(['Shift']);await wait(()=>window.__AI_TEST_STATE__.ecology.visited.includes('bell-tower'));await setKeys([]);
   assert.equal((await state()).phase,'complete');assert.equal(await page.locator('#hud').isVisible(),false);await shot('complete');checks.push('bell tower progression completion');await tap('#explore');assert.equal(await page.locator('#hud').isVisible(),true);
  }
  const expectedProgress=(await state()).ecology;await home();await tap('#pause');if((await page.locator('#pause-sound').textContent())!=='Звук: выключен')await tap('#pause-sound');await page.reload();await wait(()=>window.__AI_TEST_STATE__?.phase==='menu');assert.equal(await page.locator('#sound').textContent(),'Звук: выключен');const restored=(await state()).ecology;assert.equal(restored.foods,expectedProgress.foods);assert.equal(restored.nuts,expectedProgress.nuts);assert.deepEqual(restored.visited,expectedProgress.visited);checks.push('sound and progression persistence');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>navigator.serviceWorker.ready);await wait(()=>!!navigator.serviceWorker.controller);
  if(process.env.CORVUS_QA_NATIVE_OFFLINE==='1'){assert(server,'Native offline check requires the embedded HTTP server');await new Promise(done=>server.close(done));}else await context.setOffline(true);await page.reload();await wait(()=>window.__AI_TEST_STATE__?.phase==='menu');await tap('#start');await wait(()=>window.__AI_TEST_STATE__?.phase==='playing'&&window.__AI_TEST_STATE__.rigReady);await shot('offline');if(process.env.CORVUS_QA_NATIVE_OFFLINE==='1')await new Promise(done=>server.listen(Number(new URL(url).port),'127.0.0.1',done));else await context.setOffline(false);checks.push('service worker offline reload with local crow/world assets');
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  reports.push({browser:name,status:'passed',checks,airborne,rendererFps:samples,errors,failed});await context.close();
 }catch(error){try{await failureShot?.();}catch{}reports.push({browser:name,status:'failed',...observed,message:error.message});throw error;}finally{clearInterval(heartbeat);await browser?.close();}
}}finally{await writeFile(`${directory}/report.json`,JSON.stringify(reports,null,2));server?.close();}
