import {chromium,webkit} from '@playwright/test';
import {startPreview} from './server.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {configurations} from '../custom-warfare/configurations.mjs';
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
let failures=[],reference=null;
try{
 const driver=engine==='webkit'?webkit:chromium,b=await driver.launch();
 try{for(const art of [false,true]){
  const tag=engine+'-side'+side+'-'+(art?'candidate':'schematic'),context=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,recordVideo:{dir:out+'/'+tag,size:{width:1440,height:900}}}),p=await context.newPage(),errors=[],rounds=[],pairs=[],events={};let motionProfile=null,routeEvidence=null,campaignEvidence=null;p.on('pageerror',e=>errors.push(e.message));
  try{
   await p.goto(url+'?view='+ (art?'candidate':'schematic'));await p.waitForFunction(()=>window.integratedQA?.ready===true);
   if(configuration){
    await p.locator('#front').selectOption(process.env.BOW_FRONT||'wide');await p.locator('#campaign-length').selectOption('3');await p.locator('#seed').fill(configuration.seed);await p.locator('#landscape').selectOption(configuration.landscape);await p.locator('#objective').selectOption(configuration.objective);await p.locator('#duration').selectOption(String(configuration.seconds));await p.locator('#visibility').selectOption(configuration.fog?'fog':'open');if(process.env.BOW_CAMPAIGN_UI==='1')await p.locator('#campaign').check();
    for(let side of [0,1]){let a=configuration.armies[side];await p.locator('#army-side').selectOption(String(side));await p.locator('#'+a.preset).click();await p.locator('#army-size').selectOption(String(a.size));await p.locator('#army-quality').selectOption(a.quality)}
    await p.screenshot({path:out+'/'+tag+'-muster.png'});await p.locator('#start').click();await p.locator('#phase').waitFor({state:'visible'});assert.equal((await saved(p)).state.seed,configuration.seed);assert.deepEqual((await saved(p)).state.custom.config.armies.map(a=>a.roster),configuration.armies.map(a=>a.roster));
   }else{await p.locator('#chronicles').click();await p.locator('#chronicle-id').selectOption('agincourt');await p.locator('#chronicle-side').selectOption(String(side));await p.locator('#chronicle-launch').click();}
   await p.locator('#map').waitFor({state:'visible'});await p.waitForFunction(()=>!!window.integratedQA?.receipt());
   pairs.push(await pair(p,tag+'-initial',art));
   if(art){await p.locator('#focus').click();await p.waitForTimeout(250);await waitReceipt(p,true);await p.screenshot({path:out+'/'+tag+'-close60.png'});await p.locator('#fit').click();await p.waitForTimeout(200)}
   motionProfile=await nativeMotionProfile(p);if(configuration){await p.locator('#confirm').click();await p.waitForFunction(()=>window.integratedQA.receipt()?.phase==='plan');routeEvidence=await nativeRouteCheck(p);}
   for(let i=0;i<31;i++){
    let before=await saved(p);if(before.state.result)break;
    let planStart=Date.now(),order=await command(p,reference?.[i]?.order.executed),planMs=Date.now()-planStart,confirmStart=Date.now();
    if(reference)assert.deepEqual(order.orders,reference[i].order.orders,'Native order payload differs');
    await p.locator('#confirm').click();await p.locator('#confirm').click();await p.locator('#playback').waitFor({state:'visible',timeout:120000});
    let computeMs=Date.now()-confirmStart,playStart=Date.now(),speed=process.env.BOW_RHYTHM_NATIVE==='1'&&i===0?2:8;await p.locator('#speed').selectOption(String(speed));
    await p.evaluate(()=>{window.__bowFrameTimes=[];let last=performance.now();function record(t){if(document.querySelector('#playback').hidden||document.querySelector('#pause').textContent==='Играть')return;window.__bowFrameTimes.push(t-last);last=t;requestAnimationFrame(record)}requestAnimationFrame(record)});
    await p.waitForFunction(()=>{let e=document.querySelector('#scrub');return Number(e.max)>0&&Number(e.value)===Number(e.max)&&document.querySelector('#pause').textContent==='Играть'},{},{timeout:120000});
    await p.waitForFunction(()=>{let r=window.integratedQA.receipt();return r&&r.frame===r.lastFrame&&!r.playing});
    let playbackMs=Date.now()-playStart;if(art){let r=await receipt(p);for(let [kind,index] of Object.entries(r.markers||{})){if(events[kind]!==undefined)continue;await p.locator('#scrub').fill(String(index));await p.waitForFunction(n=>window.integratedQA.receipt()?.frame===n,index);await waitReceipt(p,true);await p.screenshot({path:out+'/'+tag+'-event-'+kind+'.png'});events[kind]={round:i+1,frame:index};}if(Object.keys(r.markers||{}).length){await p.locator('#scrub').fill(String(r.lastFrame));await p.waitForFunction(()=>{let q=window.integratedQA.receipt();return q?.frame===q?.lastFrame});}}
    if(i===0||i%5===4)pairs.push(await pair(p,tag+'-round'+i,art));
    const end=await receipt(p);if(end.frame!==end.lastFrame)throw Error('Not final playback frame');
    await p.locator('#skip').click();await p.locator('#playback').waitFor({state:'hidden'});
    let after=await saved(p);assert.equal(after.state.round,before.state.round+1);assert(after.state.time>before.state.time);
    let timing=await p.evaluate(()=>({raf:window.__bowFrameTimes||[],render:performance.getEntriesByName('banners:render').map(x=>x.duration)}));let trace={round:after.state.round,time:after.state.time,order,signature:end.signature,state:after.state,timing:{...timing,planMs,computeMs,playbackMs,speed},camera:end.camera,stats:end.stats};
    if(reference){assert.equal(trace.signature,reference[i].signature);assert.deepEqual(trace.state,reference[i].state,'Authoritative round state differs by renderer')}
    rounds.push(trace);
    await writeFile(out+'/'+tag+'.json',JSON.stringify({tag,rounds,pairs,events,motionProfile,routeEvidence,campaignEvidence,errors},null,2));
   }
   let final=await saved(p);assert(final.state.result);if(art){assert(reference,'Schematic reference battle failed');assert.equal(rounds.length,reference.length)}
   await p.screenshot({path:out+'/'+tag+'-result.png'});assert.equal(errors.length,0);assert(rounds.some(r=>r.order.executed.length),'No actual player commands in complete battle');
   if(!art)reference=rounds;if(configuration){if(process.env.BOW_CAMPAIGN_UI==='1'){let old=final.state;await p.locator('#campaign-recruit').click();await p.waitForFunction(()=>window.integratedQA.receipt()?.phase==='deploy');let next=(await saved(p)).state;assert.equal(next.custom.campaign.stage,2);assert.equal(next.custom.campaign.records[0].result,old.result);assert(next.units.some(u=>u.campaignId==='R1000'&&u.n===80));for(let u of old.units.filter(u=>u.side===0&&Math.floor(u.n)>0)){let v=next.units.find(v=>v.campaignId===u.campaignId);assert(v&&v.n===Math.floor(u.n))}campaignEvidence={stage:next.custom.campaign.stage,previous:next.custom.campaign.records[0],units:next.units.filter(u=>u.side===0).map(u=>[u.campaignId,u.n])};await p.screenshot({path:out+'/'+tag+'-campaign-next.png'});await p.reload();await p.waitForFunction(()=>window.integratedQA?.ready===true);await p.locator('#resume').click();assert.equal((await saved(p)).state.custom.campaign.stage,2)}else{await p.locator('#custom-return').click();await p.locator('#setup').waitFor({state:'visible'});assert.equal(await p.locator('#seed').inputValue(),configuration.seed);}}
  }catch(e){failures.push({tag,error:e.stack,receipt:await receipt(p).catch(()=>null),browserErrors:errors});await p.screenshot({path:out+'/'+tag+'-failure.png'}).catch(()=>{})}
  finally{await writeFile(out+'/'+tag+'.json',JSON.stringify({tag,rounds,pairs,events,motionProfile,routeEvidence,campaignEvidence,errors},null,2));await context.close()}
 }}finally{await b.close()}
}finally{server.close();await writeFile(out+'/failures.json',JSON.stringify(failures,null,2))}
if(failures.length)throw Error(JSON.stringify(failures));
