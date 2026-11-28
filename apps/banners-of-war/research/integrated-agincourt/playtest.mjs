import {chromium,webkit} from '@playwright/test';
import {startPreview} from './server.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve(process.env.BOW_INTEGRATED_OUTPUT),assets=process.env.BOW_ART_OUTPUT,engine=process.env.BOW_BROWSER,side=Number(process.env.BOW_SIDE);
await mkdir(out,{recursive:true});const {server,url}=await startPreview(assets);
const key='pocket-works:banners-of-war:battle:1',saved=p=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),receipt=p=>p.evaluate(()=>window.integratedQA.receipt());
async function waitReceipt(p,art){await p.waitForFunction(art=>{const r=window.integratedQA?.receipt();return r&&r.art===art},art,{timeout:120000});return receipt(p)}
async function switchView(p,art){
 await p.waitForFunction(()=>['Схема','Диорама'].includes(document.querySelector('#integrated-view').textContent));
 let active=(await p.locator('#integrated-view').getAttribute('aria-pressed'))==='true';
 if(active!==art)await p.locator('#integrated-view').click();
 return waitReceipt(p,art);
}
async function pair(p,label,art){
 let a=await switchView(p,true);await p.screenshot({path:out+'/'+label+'-candidate.png'});
 let b=await switchView(p,false);await p.screenshot({path:out+'/'+label+'-schematic.png'});
 assert.equal(a.signature,b.signature);assert.equal(a.terrainHash,b.terrainHash);assert.deepEqual(a.camera,b.camera);assert.deepEqual(a.units,b.units);
 assert.deepEqual([...a.covered,...a.fallback].sort((x,y)=>x-y),a.units.map(u=>u.id).sort((x,y)=>x-y));
 if(art)await switchView(p,true);return {time:a.time,round:a.round,signature:a.signature,camera:a.camera,visible:a.units.length,fallback:a.fallback,stats:a.stats};
}
async function clearSelection(p){if(await p.locator('#clear').isEnabled())await p.locator('#clear').click();await p.waitForFunction(()=>!window.integratedQA.receipt()?.selected?.length);await p.waitForTimeout(80)}
async function clickUnit(p,u){
 u=(await receipt(p)).units.find(v=>v.id===u.id);if(!u)return false;
 let box=await p.locator('#map').boundingBox(),{x,y}=u.projected;
 if(x<12||y<12||x>box.width-12||y>box.height-12)return false;
 let clear=await p.evaluate(({x,y})=>{let el=document.getElementById('map'),b=el.getBoundingClientRect();return document.elementFromPoint(b.left+x,b.top+y)===el},{x,y});if(!clear)return false;
 await p.locator('#map').click({position:{x,y}});try{await p.waitForFunction(id=>window.integratedQA.receipt()?.selected?.includes(id),u.id,{timeout:1600});return true}catch{return false}
}
async function command(p,reference){
 // Native selection/command controls only. No QA state setter, localStorage injection or AI observer.
 await p.locator('#fit').click();await p.waitForTimeout(150);
 const r=await receipt(p),own=r.units.filter(u=>u.side===0&&u.type!=='guard'&&u.n>0),enemy=r.units.filter(u=>u.side===1);
 const instructions=reference||own.filter(u=>u.type==='sword'||u.type==='archer'||u.type==='crossbow'||u.type==='knight').slice(0,5).map(u=>({id:u.id,kind:u.type==='archer'||u.type==='crossbow'?'shoot':side===0?'brace':'attack',target:enemy.slice().sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y)||a.id-b.id)[0]?.id}));
 let executed=[];
 for(const ins of instructions){
  const u=own.find(u=>u.id===ins.id),v=enemy.find(v=>v.id===ins.target);
  if(!u||(['shoot','attack'].includes(ins.kind)&&!v))continue;
  await clearSelection(p);
  if(!await clickUnit(p,u))continue;
  await p.locator('#orders [data-kind="'+ins.kind+'"]').click();
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
 if(!executed.length)throw Error('No native player order committed');
 if(reference)assert.deepEqual(executed,reference,'Native commands diverged');
 return {executed,orders:(await saved(p)).orders};
}
let failures=[],reference=null;
try{
 const driver=engine==='webkit'?webkit:chromium,b=await driver.launch();
 try{for(const art of [false,true]){
  const tag=engine+'-side'+side+'-'+(art?'candidate':'schematic'),context=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,recordVideo:{dir:out+'/'+tag,size:{width:1440,height:900}}}),p=await context.newPage(),errors=[],rounds=[],pairs=[];p.on('pageerror',e=>errors.push(e.message));
  try{
   await p.goto(url+'?view='+ (art?'candidate':'schematic'));
   await p.locator('#chronicles').click();await p.locator('#chronicle-id').selectOption('agincourt');await p.locator('#chronicle-side').selectOption(String(side));await p.locator('#chronicle-launch').click();
   await p.locator('#map').waitFor({state:'visible'});await p.waitForFunction(()=>!!window.integratedQA?.receipt());
   pairs.push(await pair(p,tag+'-initial',art));
   for(let i=0;i<31;i++){
    let before=await saved(p);if(before.state.result)break;
    let order=await command(p,reference?.[i]?.order.executed);
    if(reference)assert.deepEqual(order.orders,reference[i].order.orders,'Native order payload differs');
    await p.locator('#confirm').click();await p.locator('#confirm').click();await p.locator('#playback').waitFor({state:'visible',timeout:120000});
    await p.locator('#speed').selectOption('8');
    await p.waitForFunction(()=>{let e=document.querySelector('#scrub');return Number(e.max)>0&&Number(e.value)===Number(e.max)&&document.querySelector('#pause').textContent==='Играть'},{},{timeout:120000});
    await p.waitForFunction(()=>{let r=window.integratedQA.receipt();return r&&r.frame===r.lastFrame&&!r.playing});
    if(i===0||i%5===4)pairs.push(await pair(p,tag+'-round'+i,art));
    const end=await receipt(p);if(end.frame!==end.lastFrame)throw Error('Not final playback frame');
    await p.locator('#skip').click();await p.locator('#playback').waitFor({state:'hidden'});
    let after=await saved(p);assert.equal(after.state.round,before.state.round+1);assert(after.state.time>before.state.time);
    let trace={round:after.state.round,time:after.state.time,order,signature:end.signature,state:after.state};
    if(reference){assert.equal(trace.signature,reference[i].signature);assert.deepEqual(trace.state,reference[i].state,'Authoritative round state differs by renderer')}
    rounds.push(trace);
    await writeFile(out+'/'+tag+'.json',JSON.stringify({tag,rounds,pairs,errors},null,2));
   }
   let final=await saved(p);assert(final.state.result);if(reference)assert.equal(rounds.length,reference.length);
   await p.screenshot({path:out+'/'+tag+'-result.png'});assert.equal(errors.length,0);
   if(!art)reference=rounds;
  }catch(e){failures.push({tag,error:e.stack});await p.screenshot({path:out+'/'+tag+'-failure.png'}).catch(()=>{})}
  finally{await writeFile(out+'/'+tag+'.json',JSON.stringify({tag,rounds,pairs,errors},null,2));await context.close()}
 }}finally{await b.close()}
}finally{server.close();await writeFile(out+'/failures.json',JSON.stringify(failures,null,2))}
if(failures.length)throw Error(JSON.stringify(failures));
