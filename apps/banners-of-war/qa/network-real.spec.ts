import {test,expect,devices,type Page} from '@playwright/test';
import {makeProject,flatTerrain,validateScenarioProject} from '../laboratory.js';

async function apiRead(page:Page,path:string){
 return page.evaluate(async path=>{
  const r=await fetch('/pocketnet/banners/'+path,{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)throw Error('Network read failed: '+r.status);
  return r.json();
 },path);
}
const view=(p:Page,id:string)=>apiRead(p,id+'/view');
async function waitPhase(p:Page,id:string,phases:string[]){
 await expect.poll(async()=>phases.includes((await view(p,id)).phase),{timeout:30000}).toBe(true);
 return view(p,id);
}
async function roomCode(p:Page){
 await expect(p.locator('#net-status')).toContainText(/Комната [0-9A-F]{16}/);
 return (await p.locator('#net-status').textContent())!.match(/[0-9A-F]{16}/)![0].toLowerCase();
}
async function joinAndAccept(a:Page,b:Page,id:string){
 await b.goto('/apps/banners-of-war/?battle='+id);
 await expect(b.locator('#net-accept')).toBeEnabled({timeout:20000});
 await expect(a.locator('#net-accept')).toBeEnabled({timeout:20000});
 await Promise.all([a.locator('#net-accept').click(),b.locator('#net-accept').click()]);
}
async function mapTap(p:Page,state:any,x:number,y:number){
 const map=p.locator('#net-map');
 const {w,h}=await map.evaluate(el=>({w:el.clientWidth,h:el.clientHeight}));
 const sw=state.scenario.width,sh=state.scenario.height,k=Math.min(w/sw,h/sh);
 await map.tap({position:{x:(w-sw*k)/2+x*k,y:(h-sh*k)/2+y*k}});
}
async function seal(p:Page){
 await expect(p.locator('#net-ready')).toBeEnabled({timeout:30000});
 p.once('dialog',d=>d.accept());
 await p.locator('#net-ready').click();
}
async function endDeployment(a:Page,b:Page,id:string){
 await waitPhase(a,id,['deployment']);
 for(const p of [a,b])await expect(p.locator('#net-deploy-ready')).toBeEnabled({timeout:20000});
 await Promise.all([a.locator('#net-deploy-ready').click(),b.locator('#net-deploy-ready').click()]);
 await waitPhase(a,id,['planning']);
}
function combatFixture(){
 const p=makeProject({seed:'Human-QA',width:1400,height:900});
 p.title='Human QA: six regiments';p.terrain=flatTerrain(p.width,p.height);p.seconds=180;p.fog=true;
 const template={...p.armies[0].units[0],type:'spear',profile:null,n:120,cols:16,form:'line',ammo:0,customSpec:null};
 for(const side of [0,1]){
  p.armies[side].units=Array.from({length:6},(_,j)=>({...template,name:'Regiment '+(j+1),group:'Line',x:side?755:645,y:450+(j-2.5)*46*(side?-1:1),a:side?Math.PI:0}));
  p.armies[side].guard={x:side?940:460,y:450};
 }
 expect(validateScenarioProject(p).errors).toEqual([]);
 return p;
}
test('two real Pocket ID clients complete and reconnect',async({browser},info)=>{
 const origin=info.project.use.baseURL!;let suffix=Date.now().toString(36)+info.project.name.slice(-2);let {defaultBrowserType,...device}=devices[info.project.name.includes('webkit')?'iPhone 13':'Pixel 7'];let A=await browser.newContext({...device,baseURL:origin,ignoreHTTPSErrors:true}),B=await browser.newContext({...device,baseURL:origin,ignoreHTTPSErrors:true});try{
 const accounts:string[]=[],recoveryCodes:string[]=[];
 for(const [ctx,name] of [[A,'BWAlpha'+suffix],[B,'BWBeta'+suffix]] as const){
  const page=await ctx.newPage();
  try {
   await page.goto('/');
   const registered=await page.evaluate(async nickname=>{
    const response=await fetch('/pocket-id/register',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({nickname,avatar:'clay'})});
    const body=await response.json();
    return {status:response.status,id:body.user?.id,recoveryCode:body.recoveryCode};
   },name);
   expect(registered.status).toBe(201);
   expect(registered.id).toBeTruthy();
   const me=await page.evaluate(async()=>{
    const response=await fetch('/pocket-id/me',{credentials:'same-origin'});
    const body=await response.json();
    return {status:response.status,id:body.user?.id};
   });
   expect(me).toEqual({status:200,id:registered.id});
   const session=(await ctx.cookies(origin)).find(c=>c.name==='__Host-pw-id');
   expect(session).toMatchObject({httpOnly:true,secure:true,sameSite:'Lax',path:'/'});
   accounts.push(registered.id);recoveryCodes.push(registered.recoveryCode);
  } finally {await page.close()}
 }
 expect(new Set(accounts).size).toBe(2);
 let a=await A.newPage(),b=await B.newPage(),errors:string[]=[];for(let p of [a,b])p.on('pageerror',e=>errors.push(e.message));await a.goto('/apps/banners-of-war/');await a.locator('#network').click();await expect(a.locator('#net-status')).toContainText('Pocket ID');await a.locator('#net-length').fill('60');await a.locator('#net-time').selectOption('0');await a.locator('#net-create').click();await expect(a.locator('#net-status')).toContainText('Комната');let code=(await a.locator('#net-status').textContent())!.match(/[0-9A-F]{16}/)![0];await a.screenshot({path:info.outputPath('room-host.png')});await b.goto('/apps/banners-of-war/?battle='+code);await expect(b.locator('#net-accept')).toBeEnabled();await expect(a.locator('#net-accept')).toBeEnabled({timeout:15000});await Promise.all([a.locator('#net-accept').click(),b.locator('#net-accept').click()]);
 for(let round=1;round<=2;round++){for(let p of [a,b]){await expect(p.locator('#net-ready')).toBeVisible({timeout:20000});await p.locator('#net-all').click();await p.locator('#net-hold').click();p.once('dialog',d=>d.accept());await p.locator('#net-ready').click()}if(round===1){await expect(a.locator('#net-replay-done')).toBeVisible({timeout:30000});await expect(b.locator('#net-replay-done')).toBeVisible({timeout:30000});await a.screenshot({path:info.outputPath('round-replay.png')});await B.setOffline(true);await b.reload().catch(()=>{});await B.setOffline(false);await b.goto('/apps/banners-of-war/?battle='+code);await expect(b.locator('#net-replay-done')).toBeVisible({timeout:20000});await Promise.all([a.locator('#net-replay-done').click(),b.locator('#net-replay-done').click()])}}
 await expect(a.locator('#net-desk h3')).toBeVisible({timeout:30000});await expect(b.locator('#net-desk h3')).toBeVisible({timeout:30000});await a.locator('#net-round-select').selectOption('1');await expect(a.locator('#net-export')).toBeVisible({timeout:10000});await a.screenshot({path:info.outputPath('finished-archive.png')});

 // A real multi-round encounter: custom historical-scale scenario, free deployment,
 // independent browser orders, natural victory/time limit, full post-battle archive.
 await a.locator('#net-journal-back').click();
 await expect(a.locator('#net-create')).toBeVisible();
 await a.locator('#net-file').setInputFiles({name:'combat.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(combatFixture()))});
 await expect(a.locator('#net-scenario')).toHaveValue('file');
 await a.locator('#net-deployment').selectOption('free');
 await a.locator('#net-time').selectOption('0');
 await a.locator('#net-create').click();
 const combatId=await roomCode(a);
 await joinAndAccept(a,b,combatId);
 let deploy=await waitPhase(a,combatId,['deployment']);
 const regiment=deploy.units.find((u:any)=>u.side===deploy.side&&u.type!=='guard');
 expect(regiment).toBeTruthy();
 await mapTap(a,deploy,regiment.x,regiment.y);
 await mapTap(a,deploy,regiment.x-50,regiment.y);
 await expect.poll(async()=>Math.abs((await view(a,combatId)).units.find((u:any)=>u.id===regiment.id).x-(regiment.x-50)),{timeout:15000}).toBeLessThan(5);
 await endDeployment(a,b,combatId);
 let state=await view(a,combatId);
 for(let guard=0;guard<7&&state.phase!=='finished';guard++){
  expect(state.phase).toBe('planning');
  const round=state.round;
  if(round<=2){
   for(const p of [a,b]){
    const own=await view(p,combatId);
    await expect(p.locator('#net-all')).toBeVisible({timeout:20000});
    await p.locator('#net-all').click();
    await p.locator('#net-kind').selectOption('advance');
    await mapTap(p,own,own.side?400:1000,own.scenario.height/2);
    await p.locator('#net-save').click();
    await expect.poll(async()=>Object.keys((await view(p,combatId)).draft).length,{timeout:15000}).toBeGreaterThan(0);
    if(p===a)expect((await view(b,combatId)).draft).toEqual({});
   }
  }
  await Promise.all([seal(a),seal(b)]);
  state=await waitPhase(a,combatId,['replay','finished']);
  if(state.phase==='replay'){
   const privateRound=await apiRead(b,combatId+'/round?n='+round);
   expect(Object.keys(privateRound).sort()).toEqual(['frames','number']);
   await expect(a.locator('#net-replay-done')).toBeVisible({timeout:30000});
   await expect(b.locator('#net-replay-done')).toBeVisible({timeout:30000});
   await a.screenshot({path:info.outputPath('combat-round-'+round+'.png')});
   await Promise.all([a.locator('#net-replay-done').click(),b.locator('#net-replay-done').click()]);
   state=await waitPhase(a,combatId,['planning']);
  }
 }
 expect(state.phase).toBe('finished');
 expect(state.resultReason).not.toMatch(/surrender|agreement/);
 expect(state.completed).toBeGreaterThan(0);
 const archive=await apiRead(a,combatId+'/round?n='+state.completed);
 expect(archive.orders).toBeTruthy();
 expect(archive.after.units.some((u:any)=>(u.combatSeconds||0)>0)).toBe(true);
 await expect(a.locator('#net-desk h3')).toBeVisible({timeout:30000});
 await expect(a.locator('#net-export')).toBeVisible({timeout:20000});
 await a.screenshot({path:info.outputPath('combat-finished.png')});

 // Rematch is created through the public UI and can end in a negotiated draw.
 await a.locator('#net-rematch').click();
 const rematchId=await roomCode(a);
 expect(rematchId).not.toBe(combatId);
 await joinAndAccept(a,b,rematchId);
 await endDeployment(a,b,rematchId);
 for(const p of [a,b])await p.getByText('Военный совет',{exact:true}).click();
 await a.locator('#net-draw').click();
 await expect(b.locator('#net-draw')).toContainText('Принять ничью',{timeout:20000});
 await b.locator('#net-draw').click();
 expect((await waitPhase(a,rematchId,['finished'])).resultReason).toBe('agreement');

 // Correspondence: close the original tab with sealed orders, then recover
 // the same Pocket ID in a separate browser context using the real recovery API.
 await expect(a.locator('#net-journal-back')).toBeVisible({timeout:20000});
 await a.locator('#net-journal-back').click();
 await expect(a.locator('#net-create')).toBeVisible();
 await a.locator('#net-mode').selectOption('correspondence');
 await a.locator('#net-time').selectOption('3600');
 await a.locator('#net-length').fill('60');
 await a.locator('#net-create').click();
 const corr=await roomCode(a);
 await joinAndAccept(a,b,corr);
 const planning=await waitPhase(a,corr,['planning']);
 expect(planning.rules.mode).toBe('correspondence');
 expect(planning.deadline-planning.serverNow).toBeGreaterThan(0);
 expect(planning.deadline-planning.serverNow).toBeLessThanOrEqual(3600000);
 await seal(a);
 await expect.poll(async()=>((await view(b,corr)).ready[0]),{timeout:20000}).toBe(true);
 await a.close();
 const C=await browser.newContext({...device,baseURL:origin,ignoreHTTPSErrors:true});
 try {
  const recovered=await C.newPage();
  recovered.on('pageerror',e=>errors.push(e.message));
  await recovered.goto('/');
  const identity=await recovered.evaluate(async recoveryCode=>{
   const r=await fetch('/pocket-id/recover',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({recoveryCode})});
   const body=await r.json();return {status:r.status,id:body.user?.id};
  },recoveryCodes[0]);
  expect(identity).toEqual({status:200,id:accounts[0]});
  await recovered.goto('/apps/banners-of-war/');
  await recovered.locator('#network').click();
  const journal=recovered.locator('[data-open-room="'+corr+'"]');
  await expect(journal).toBeVisible({timeout:20000});
  await recovered.screenshot({path:info.outputPath('correspondence-journal.png')});
  await journal.click();
  const restored=await waitPhase(recovered,corr,['planning']);
  expect(restored.ready[restored.side]).toBe(true);
  await seal(b);
  await waitPhase(recovered,corr,['replay']);
  await expect(recovered.locator('#net-replay-done')).toBeVisible({timeout:30000});
  await expect(b.locator('#net-replay-done')).toBeVisible({timeout:30000});
  await Promise.all([recovered.locator('#net-replay-done').click(),b.locator('#net-replay-done').click()]);
  await waitPhase(b,corr,['planning']);
  await b.getByText('Военный совет',{exact:true}).click();
  b.once('dialog',d=>d.accept());
  await b.locator('#net-surrender').click();
  expect((await waitPhase(recovered,corr,['finished'])).resultReason).toBe('surrender');
 } finally {await C.close()}
 expect(errors).toEqual([]);
 
 }finally{await A.close();await B.close()}
});
