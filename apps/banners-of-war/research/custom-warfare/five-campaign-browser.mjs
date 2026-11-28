import {chromium,webkit} from '@playwright/test';
import {startPreview} from '../integrated-agincourt/server.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {configurations} from './configurations.mjs';
const out=resolve(process.env.BOW_INTEGRATED_OUTPUT),assets=process.env.BOW_ART_OUTPUT,engine=process.env.BOW_BROWSER,side=Number(process.env.BOW_SIDE||1),configuration=process.env.BOW_CUSTOM_CASE?configurations.find(c=>c.id===process.env.BOW_CUSTOM_CASE):null;
await mkdir(out,{recursive:true});const {server,url}=await startPreview(assets);
const key='pocket-works:banners-of-war:battle:1',saved=p=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),receipt=p=>p.evaluate(()=>window.integratedQA.receipt());
async function waitReceipt(p,art){await p.waitForFunction(art=>{const r=window.integratedQA?.receipt();return r&&r.art===art},art,{timeout:120000});return receipt(p)}
async function switchView(p,art){
 await p.waitForFunction(()=>['Схема','Диорама'].includes(document.querySelector('#integrated-view').textContent));
 let active=(await p.locator('#integrated-view').getAttribute('aria-pressed'))==='true';
 if(active!==art)await p.locator('#integrated-view').click();
 return waitReceipt(p,art);
}
async function tactical(p,on){let r=await receipt(p);if(!!r.camera.tactical!==on){await p.locator('#integrated-camera').click();await p.waitForFunction(on=>!!window.integratedQA.receipt()?.camera?.tactical===on,on,{timeout:120000});r=await waitReceipt(p,true)}assert(r.roundTripMax<.01);return r}
async function pair(p,label,art){
 let a=await switchView(p,true);if(a.camera.tactical)a=await tactical(p,false);await p.screenshot({path:out+'/'+label+'-candidate.png'});
 let b=await switchView(p,false);await p.screenshot({path:out+'/'+label+'-schematic.png'});
 assert.equal(a.signature,b.signature);assert.equal(a.terrainHash,b.terrainHash);assert.deepEqual(a.camera,b.camera);assert.deepEqual(a.units,b.units);
 assert.deepEqual([...a.covered,...a.fallback].sort((x,y)=>x-y),a.units.map(u=>u.id).sort((x,y)=>x-y));
 if(art){await switchView(p,true);let t=await tactical(p,true);assert.equal(t.signature,a.signature);assert.equal(t.terrainHash,a.terrainHash);await p.screenshot({path:out+'/'+label+'-tactical60.png'});}return {time:a.time,round:a.round,signature:a.signature,camera:a.camera,visible:a.units.length,fallback:a.fallback,stats:a.stats};
}
async function clearSelection(p){if(await p.locator('#clear').isEnabled())await p.locator('#clear').click();await p.waitForFunction(()=>!window.integratedQA.receipt()?.selected?.length);await p.waitForTimeout(80)}
async function clickUnit(p,u){
 u=(await receipt(p)).units.find(v=>v.id===u.id);if(!u||u.rout||u.escaped)return false;
 let box=await p.locator('#map').boundingBox(),{x,y}=u.projected;
 if(x<12||y<12||x>box.width-12||y>box.height-12)return false;
 let clear=await p.evaluate(({x,y})=>{let el=document.getElementById('map'),b=el.getBoundingClientRect();return document.elementFromPoint(b.left+x,b.top+y)===el},{x,y});if(!clear)return false;
 await p.locator('#map').click({position:{x,y}});try{await p.waitForFunction(id=>{let r=window.integratedQA.receipt();return r?.selected?.includes(id)&&r?.commandable?.includes(id)&&r?.phase==='plan'},u.id,{timeout:1600});return true}catch{return false}
}
async function command(p,reference){
 // Native selection/command controls only. No QA state setter, localStorage injection or AI observer.
 await p.locator('#fit').click();await p.waitForTimeout(150);
 const r=await receipt(p),own=r.units.filter(u=>u.side===0&&u.type!=='guard'&&u.n>=1&&!u.rout&&!u.escaped),enemy=r.units.filter(u=>u.side===1);
 const instructions=reference||own.filter(u=>u.type==='sword'||u.type==='archer'||u.type==='crossbow'||u.type==='knight').slice(0,5).map(u=>({id:u.id,kind:configuration&&!enemy.length?'brace':u.type==='archer'||u.type==='crossbow'?'shoot':side===0?'brace':'attack',target:enemy.slice().sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y)||a.id-b.id)[0]?.id}));
 let executed=[],diagnostics=[];
 for(const ins of instructions){
  const u=own.find(u=>u.id===ins.id),v=enemy.find(v=>v.id===ins.target);
  if(!u||(['shoot','attack'].includes(ins.kind)&&!v))continue;
  await clearSelection(p);
  if(!await clickUnit(p,u))continue;
  const control=p.locator('#orders [data-kind="'+ins.kind+'"]');if(!await control.isVisible()||!await control.isEnabled()){diagnostics.push({unit:u.id,kind:ins.kind,receipt:await receipt(p),unitstats:await p.locator('#unitstats').innerText()});throw Error('Commandable unit has hidden/disabled native command '+JSON.stringify(diagnostics.at(-1)))}await control.click();
  if(ins.kind!=='brace'){
    await p.waitForTimeout(80);const box=await p.locator('#map').boundingBox(),target=(await receipt(p)).units.find(q=>q.id===v.id);if(!target){await clearSelection(p);continue}const pos=target.projected;
    if(pos.x<12||pos.y<12||pos.x>box.width-12||pos.y>box.height-12){await p.locator('#clear').click();continue}
    const clear=await p.evaluate(({x,y})=>{let el=document.getElementById('map'),b=el.getBoundingClientRect();return document.elementFromPoint(b.left+x,b.top+y)===el},pos);
    if(!clear){await p.locator('#clear').click();continue}
    await p.locator('#map').click({position:pos});
  }
  const state=await saved(p),order=state.orders[u.id];if(order?.kind===ins.kind&&(ins.kind==='brace'||order.target===ins.target))executed.push(ins);
 }
 if(!executed.length&&!reference){
  for(let u of own){await clearSelection(p);if(!await clickUnit(p,u))continue;await p.locator('#orders [data-kind="brace"]').click();if((await saved(p)).orders[u.id]?.kind==='brace'){executed.push({id:u.id,kind:'brace'});break}}
 }
 if(!executed.length&&own.length)throw Error('No native player order committed; eligible '+JSON.stringify(own.map(u=>u.id)));
 if(reference)assert.deepEqual(executed,reference,'Native commands diverged');
 return {executed,orders:(await saved(p)).orders,diagnostics,uncommandable:r.units.filter(u=>u.side===0&&u.rout).map(u=>u.id)};
}
async function nativeRouteCheck(p){
 let initial=(await saved(p)).orders;await p.locator('#fit').click();await p.waitForTimeout(150);
 let r=await receipt(p),eligible=r.units.filter(u=>u.side===0&&!u.rout&&u.type!=='guard');
 for(let u of eligible){await clearSelection(p);if(!await clickUnit(p,u))continue;let q={x:u.x+45,y:u.y+18},target=await p.evaluate(async({q,key})=>{let r=window.integratedQA.receipt(),{k,o,portrait,tactical}=r.camera,s=JSON.parse(localStorage.getItem(key)).state;if(tactical){let m=await import('/apps/banners-of-war/research/integrated-agincourt/tactical-camera.js');return m.project(s,q,o,k)}let H=s.bounds?.height||900;return portrait?{x:o.x+(H-q.y)*k,y:o.y+q.x*k}:{x:o.x+q.x*k,y:o.y+q.y*k}},{q,key});let box=await p.locator('#map').boundingBox();if(target.x<10||target.y<10||target.x>box.width-10||target.y>box.height-10)continue;
 let free=await p.evaluate(({x,y})=>{let e=document.getElementById('map'),b=e.getBoundingClientRect();return document.elementFromPoint(b.left+x,b.top+y)===e},target);if(!free)continue;
 let control=p.locator('#orders [data-kind="move"]');assert(await control.isVisible()&&await control.isEnabled());await control.click();await p.locator('#map').click({position:target});let savedOrder=(await saved(p)).orders[u.id],end=savedOrder?.path?.at(-1);assert(savedOrder?.kind==='move'&&end,'Native move path missing');let error=Math.hypot(q.x-end.x,q.y-end.y);assert(error<4,'Route world-coordinate error '+error);await p.locator('#undo').click();assert.deepEqual((await saved(p)).orders,initial,'Undo must restore exact initial orders');await clearSelection(p);return {id:u.id,requested:q,actual:end,error,camera:r.camera}
 }throw Error('No reachable native route test point')
}
async function nativeMotionProfile(p){
 let before=await receipt(p),box=await p.locator('#map').boundingBox();let point={x:box.x+box.width*.34,y:box.y+box.height*.42};
 await p.evaluate(()=>{window.__bowMotion=[];let start=performance.now(),last=start;function tick(t){window.__bowMotion.push(t-last);last=t;if(t-start<3200)requestAnimationFrame(tick)}requestAnimationFrame(tick)});
 await p.mouse.move(point.x,point.y);for(let i=0;i<6;i++){await p.mouse.wheel(0,-120);await p.waitForTimeout(120)}
 await p.mouse.move(point.x,point.y);await p.mouse.down();await p.mouse.move(point.x+90,point.y+30,{steps:12});await p.mouse.up();for(let i=0;i<6;i++){await p.mouse.wheel(0,120);await p.waitForTimeout(120)}
 await p.waitForTimeout(1700);let timings=await p.evaluate(()=>window.__bowMotion||[]),after=await receipt(p);assert.equal(before.signature,after.signature);await p.locator('#fit').click();await p.waitForTimeout(160);return {camera:before.camera,visible:before.units.length,raf:timings,stats:after.stats};
}


const path=process.env.BOW_CAMPAIGN_PATH||'conservative',browser=await (engine==='webkit'?webkit:chromium).launch(),context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,recordVideo:{dir:out+'/video',size:{width:1440,height:900}}}),p=await context.newPage(),errors=[],stages=[];
p.on('pageerror',e=>errors.push(e.message));
async function operationOrder(p,s){let mission=s.objective?.mission;if(!mission)return command(p,null);let F=s.bounds?.width||1400,r=await receipt(p),executed=[];
 await p.locator('#fit').click();await p.waitForTimeout(160);
 for(let u of s.units.filter(u=>u.side===0&&!u.rout&&!u.escaped&&u.n>=1&&u.type!=='guard')){
  let z=s.objective.zones[0],target=mission==='withdrawal'?{x:F*.18,y:u.y}:{x:z.x,y:Math.max(35,Math.min(865,z.y+(u.id%5-2)*36))};
  if(Math.hypot(u.x-target.x,u.y-target.y)<25||u.order.path?.length)continue;
  await clearSelection(p);if(!await clickUnit(p,u))continue;
  let kind=mission==='withdrawal'?'retreat':'advance',control=p.locator('#orders [data-kind="'+kind+'"]');if(!await control.isVisible()||!await control.isEnabled())continue;
  const q=await p.evaluate(async({target,key})=>{let r=window.integratedQA.receipt(),s=JSON.parse(localStorage.getItem(key)).state,{o,k,portrait,tactical}=r.camera;if(tactical){let m=await import('/apps/banners-of-war/research/integrated-agincourt/tactical-camera.js');return m.project(s,target,o,k)}return portrait?{x:o.x+(900-target.y)*k,y:o.y+target.x*k}:{x:o.x+target.x*k,y:o.y+target.y*k}},{target,key});
  let bounds=await p.locator('#map').boundingBox();if(q.x<12||q.y<12||q.x>bounds.width-12||q.y>bounds.height-12)continue;
  await control.click();await p.locator('#map').click({position:q});let order=(await saved(p)).orders[u.id];if(order?.kind===kind&&order.path.length)executed.push({id:u.id,kind,target});
 }
 await clearSelection(p);return {executed,orders:(await saved(p)).orders}}
try{
 await p.goto(url+'?view=candidate');await p.waitForFunction(()=>window.integratedQA?.ready===true);
 await p.locator('#seed').fill('Five operations '+path);await p.locator('#front').selectOption('close');await p.locator('#landscape').selectOption('dry-plain');await p.locator('#objective').selectOption('time');await p.locator('#duration').selectOption('360');await p.locator('#campaign-length').selectOption('5');await p.locator('#campaign').check();
 await p.locator('summary').filter({hasText:'Армии сопоставимой стоимости'}).click();await p.locator('#army-doctrine').selectOption('hybrid');await p.locator('#apply-doctrine').click();assert((await p.locator('#budget').innerText()).includes('1201'));assert.equal(await p.locator('#regiment-0-quality').inputValue(),'veteran');await p.screenshot({path:out+'/doctrine-hybrid.png'});
 for(let side of [0,1]){await p.locator('#army-side').selectOption(String(side));await p.locator('#compact').click()}
 await p.locator('#army-side').selectOption('0');await p.locator('#regiment-details summary').click();await p.locator('#regiment-0-size').selectOption('1.25');await p.locator('#regiment-1-quality').selectOption('veteran');await p.screenshot({path:out+'/muster.png'});await p.locator('#start').click();await p.waitForFunction(()=>window.integratedQA.receipt()?.phase==='deploy');
 assert.equal((await saved(p)).state.custom.campaign.length,5);
 for(let stage=1;stage<=5;stage++){
  let before=(await saved(p)).state;assert.equal(before.custom.campaign.stage,stage);assert.equal(before.bounds.width,1000);
  // Art comparison: native saved deployment, same authoritative state, separate original frames.
  if(stage===1||stage===2){await p.goto(url+'?view=candidate&fieldArt=before');await p.waitForFunction(()=>window.integratedQA?.ready===true);await p.locator('#resume').click();await p.waitForFunction(()=>window.integratedQA.receipt()?.phase==='deploy');let a=await pair(p,'stage-'+stage+'-before',true);assert.deepEqual((await saved(p)).state,before);await p.goto(url+'?view=candidate');await p.waitForFunction(()=>window.integratedQA?.ready===true);await p.locator('#resume').click();await p.waitForFunction(()=>window.integratedQA.receipt()?.phase==='deploy');let b=await pair(p,'stage-'+stage+'-after',true);assert.equal(a.signature,b.signature);assert.deepEqual(a.camera,b.camera);assert.deepEqual((await saved(p)).state,before)}
  else await pair(p,'stage-'+stage+'-deploy',true);
  await p.locator('#confirm').click();await p.waitForFunction(()=>window.integratedQA.receipt()?.phase==='plan');let route=await nativeRouteCheck(p),rounds=[];
  for(let i=0;i<13;i++){
   let pre=(await saved(p)).state;if(pre.result)break;let planStart=Date.now(),order=await operationOrder(p,pre),planMs=Date.now()-planStart,confirmStart=Date.now(),continued=false;
   if(!Object.keys(order.orders).length&&await p.locator('#continue-plan').isVisible()){await p.locator('#continue-plan').click();continued=true}else{await p.locator('#confirm').click();await p.locator('#confirm').click()}
   await p.locator('#playback').waitFor({state:'visible',timeout:120000});let computeMs=Date.now()-confirmStart,playStart=Date.now(),speed=i===0?2:8;await p.locator('#speed').selectOption(String(speed));
   await p.waitForFunction(()=>{let e=document.querySelector('#scrub');return +e.max>0&&+e.value===+e.max&&document.querySelector('#pause').textContent==='Играть'},{},{timeout:120000});await p.waitForFunction(()=>{let r=window.integratedQA.receipt();return r&&r.frame===r.lastFrame&&!r.playing});
   let playbackMs=Date.now()-playStart;if(i===0||i===5)await pair(p,'stage-'+stage+'-round-'+i,true);let end=await receipt(p);assert.equal(end.frame,end.lastFrame);await p.locator('#skip').click();await p.locator('#playback').waitFor({state:'hidden'});let after=(await saved(p)).state;assert.equal(after.round,pre.round+1);assert(after.time>pre.time);rounds.push({order,state:after,signature:end.signature,planMs,computeMs,playbackMs,speed,continued})
  }
  let final=(await saved(p)).state;assert(final.result,'Complete native operation');assert(rounds.some(r=>r.order.executed.length)||final.objective?.mission==='withdrawal');await p.screenshot({path:out+'/stage-'+stage+'-result.png'});let record={stage,initial:before,final,rounds,route};stages.push(record);
  await writeFile(out+'/campaign-browser.json',JSON.stringify({path,stages,errors},null,2));
  if(stage<5){
   assert(await p.locator('#campaign-route').isVisible(),'Campaign defeated before five operations');let available=await p.locator('#campaign-route option').evaluateAll(o=>o.map(q=>q.value));
   let choices=path==='conservative'?(stage===1?['secure','withdraw','crossing']:['withdraw','secure','crossing','bold','assault']):(stage===1?['crossing','assault','bold']:['assault','bold','crossing','secure','withdraw']);let nextRoute=choices.find(r=>available.includes(r));assert(nextRoute);
   await p.locator('#campaign-route').selectOption(nextRoute);let decision=path==='conservative'&&stage%2===0?'rest':stage===1&&await p.locator('#campaign-recruit').isEnabled()?'recruit':'reinforce';
   if(decision==='reinforce'){let priorities=await p.locator('#campaign-priority option').evaluateAll(o=>o.map(q=>q.value).filter(Boolean));if(priorities.length)await p.locator('#campaign-priority').selectOption(priorities[0])}
   await p.screenshot({path:out+'/stage-'+stage+'-decision.png'});await p.locator('#campaign-'+decision).click();await p.waitForFunction(()=>window.integratedQA.receipt()?.phase==='deploy');let next=(await saved(p)).state,c=next.custom.campaign,last=c.records.at(-1);assert.equal(c.stage,stage+1);assert.equal(c.route,nextRoute);assert(!(final.custom.campaign.route==='withdraw'&&nextRoute==='withdraw'));assert.equal(last.result,final.result);assert.equal(c.resource,final.custom.campaign.resource+last.reward-last.spent);assert(c.resource>=0);
   for(let u of final.units.filter(u=>u.side===0&&Math.floor(u.n)>0)){let v=next.units.find(v=>v.campaignId===u.campaignId);assert(v&&v.n>=Math.floor(u.n)&&v.n<=u.campaignCapacity)}
   record.next=next;await p.reload();await p.waitForFunction(()=>window.integratedQA?.ready===true);await p.locator('#resume').click();await p.waitForFunction(()=>window.integratedQA.receipt()?.phase==='deploy');assert.deepEqual((await saved(p)).state,next);
  }
  await writeFile(out+'/campaign-browser.json',JSON.stringify({path,stages,errors},null,2));
 }
 assert.equal(stages.length,5);assert.equal(errors.length,0);assert.equal(await p.locator('#campaign-route').count(),0);assert((await p.locator('#dialogbody').innerText()).includes('операционных очков'));await p.locator('#custom-return').click();await p.locator('#setup').waitFor({state:'visible'});
 console.log(JSON.stringify({path,stages:stages.map(s=>({stage:s.stage,result:s.final.result,route:s.next?.custom.campaign.route,resource:s.next?.custom.campaign.resource,rounds:s.rounds.length,planMs:s.rounds.reduce((n,r)=>n+r.planMs,0),playbackMs:s.rounds.reduce((n,r)=>n+r.playbackMs,0),continued:s.rounds.filter(r=>r.continued).length}))}));
}catch(e){await p.screenshot({path:out+'/failure.png'}).catch(()=>{});await writeFile(out+'/failure.json',JSON.stringify({error:e.stack,receipt:await receipt(p).catch(()=>null),stages,errors}));throw e}
finally{await context.close();await browser.close();server.close()}
