// Two real Chromium pages, with the production PocketNet module behind a
// transport shim. Client UI, WebSockets, session cache and roles are real.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from '@playwright/test';
import module, * as testModule from '../server/module.ts';

const root=resolve(import.meta.dirname,'../../..');
const mime={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  let path=resolve(root,'.'+(u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname));
  if(!(path===root||path.startsWith(root+sep))){res.writeHead(403).end();return;}
  try{const file=await readFile(path);res.setHeader('content-type',mime[extname(path)]||'application/octet-stream');res.writeHead(200).end(file);}
  catch{res.writeHead(404).end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port+'/apps/ne-zhmi/';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(condition,label,limit=13000){
  const started=Date.now();
  while(Date.now()-started<limit){if(await condition())return;await pause(40);}
  throw new Error('Timed out: '+label);
}
const players=[{id:'H',name:'Первый оператор'}, {id:'G',name:'Второй оператор'}];
const peers=new Map();
let room=null;
const code='aabbccdd-0000-0000-0000-000000000000';
const send=(ws,type,payload={})=>ws.send(JSON.stringify({wireVersion:1,type,...payload}));
function broadcastEvents(events){
  for(const e of events||[]){
    for(const [id,peer] of peers){
      if(e.to&&id!==e.to)continue;
      send(peer,'game_event',{roomId:code,event:e});
    }
  }
}
function wireSocket(socket){
  let me=null;
  socket.onMessage(raw=>{
    const req=JSON.parse(String(raw));
    if(req.type==='auth'){
      me=players.find((p,i)=>req.token==='TOKEN'+i);
      if(!me)return send(socket,'error',{code:'invalid_token'});
      peers.set(me.id,socket);send(socket,'authenticated',{player:me});return;
    }
    if(!me)return;
    if(req.type==='create_room'){
      if(room)return send(socket,'error',{code:'already_in_room'});
      room=module.createRoom({player:me});
      send(socket,'room_joined',{roomId:code,gameId:'ne-zhmi',state:room.state,players:room.state.players});return;
    }
    if(req.type==='join_room'){
      if(!room||![code,code.slice(0,8)].includes(String(req.roomId||'').toLowerCase()))return send(socket,'error',{code:'room_not_found'});
      if(!room.state.players.some(p=>p.id===me.id)){
        const next=[...room.state.players,me];
        const answer=module.onJoin({state:room.state,players:next});
        room.state=answer.state;
        send(socket,'room_joined',{roomId:code,gameId:'ne-zhmi',state:room.state,players:next});
        broadcastEvents(answer.events);
      }else send(socket,'room_joined',{roomId:code,gameId:'ne-zhmi',state:room.state,players:room.state.players});
      return;
    }
    if(req.type==='game_message'&&room){
      const answer=module.onMessage({state:room.state,player:me,payload:req.payload});
      room.state=answer.state;
      broadcastEvents(answer.events);
    }
    if(req.type==='leave_room'&&room){
      const remaining=room.state.players.filter(p=>p.id!==me.id);
      const answer=module.onLeave({state:room.state,players:remaining});
      room.state=answer.state;peers.delete(me.id);
      broadcastEvents(answer.events);
    }
  });
}

let browser=null;
const output=process.env.PW_QA_OUTPUT_DIR||'/tmp';
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const contexts=[],pages=[];
 for(let i=0;i<2;i++){
  const ctx=await browser.newContext({viewport:{width:i?390:1366,height:i?844:768},serviceWorkers:'block'});
  contexts.push(ctx);const page=await ctx.newPage();pages.push(page);
  await page.route('**/pocketnet/session',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'TOKEN'+i})}));
  await page.routeWebSocket('**/pocketnet/ws',ws=>wireSocket(ws));
  await page.goto(url);await page.waitForSelector('#mode-party');
 }
 const [host,guest]=pages;
 await host.locator('#create-online').click();
 await poll(()=>host.locator('#online-code').isVisible(),'host lobby');
 await host.locator('#online-mode').selectOption('party');
 await poll(()=>room.state.session.mode==='party','party server configuration');
 await guest.locator('#join-online').click();
 await guest.locator('#online-code-input').fill('AABBCCDD');
 await guest.locator('#online-join').click();
 await poll(()=>room.state.players.length===2,'guest joined');
 const startFits=await host.locator('#online-start').evaluate(button=>{
   const panel=document.getElementById('online-lobby');
   const a=button.getBoundingClientRect(),b=panel.getBoundingClientRect();
   return a.bottom<=b.bottom-2&&a.top>=b.top+1;
 });
 if(!startFits)throw Error('Host Start is below visible lobby viewport');
 if(!(await guest.locator('#online-mode').isDisabled()))throw Error('Guest must not alter room mode');
 await host.screenshot({path:output+'/series-online-lobby.png'});
 await host.locator('#online-start').click();
 await poll(()=>room.state.phase==='play','party stage 1 started');
 const seeds=[];
 function forceServerFinish(){
   if(room.state.phase!=='play')throw Error('No live round to finish');
   const level=room.state.robot.level,se=level.seed,now=Date.now();
   seeds.push(se);
   room.state.robot.x=level.goal+.03;
   room.state.robot.y=6.5-testModule.ROBOT.halfHeight;
   room.state.robot.ground=true;
   room.state.signals=Object.fromEntries(room.state.roles.map(id=>[id,now]));
   room.state.lastClock=now-90;
   const answer=module.onMessage({state:room.state,player:players[0],payload:{type:'pulse'}});
   room.state=answer.state;broadcastEvents(answer.events);
 }
 for(let i=0;i<3;i++){
   forceServerFinish();
   await poll(()=>room.state.phase==='won','finished stage '+(i+1));
   await poll(()=>host.locator('#online-series-stamps .done').count().then(c=>c===i+1),'host score '+(i+1));
   await poll(()=>guest.locator('#online-series-stamps .done').count().then(c=>c===i+1),'guest score '+(i+1));
   await host.screenshot({path:output+'/series-host-stage-'+(i+1)+'.png'});
   if(i<2){
     await host.locator('#online-again').click();
     await poll(()=>room.state.phase==='play'&&room.state.session.entries.length===i+1,'party next stage');
     await poll(()=>guest.locator('#online-out').isVisible(),'guest stage '+(i+2));
   }
 }
 if(new Set(seeds).size!==3)throw Error('Repeated route in party');
 if(!room.state.session.finished||room.state.session.entries.length!==3)throw Error('No complete party summary');
 await poll(()=>host.locator('#online-series-total').textContent().then(t=>t.includes('СЕРИЯ ЗАВЕРШЕНА')),'shared complete ticket');
 await guest.screenshot({path:output+'/series-guest-complete.png'});
 await host.locator('#online-again').click();
 await poll(()=>room.state.phase==='play'&&room.state.session.entries.length===0,'new series resets correctly');
 const localCtx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 contexts.push(localCtx);const local=await localCtx.newPage();await local.goto(url);
 await local.locator('#mode-lab').click();
 await poll(()=>local.locator('#lab-seed').isVisible(),'lab controls');
 await local.locator('#lab-seed').fill('2027');
 await local.locator('#lab-length').selectOption('6');
 await local.locator('#start').click();
 await poll(()=>local.locator('#notice').textContent().then(t=>t.includes('2027')),'seeded lab');
 await poll(()=>local.locator('#scene').evaluate(c=>c.getContext('2d').getImageData(24,24,1,1).data[3]>0),'lab stage drawn');
 await local.screenshot({path:output+'/lab-mobile-seed-2027.png'});

 // Each distinct crew size and lab section count owns its own record,
 // rather than comparing a four-module track to a six-module one.
 // Install before the next document executes; the outgoing page has a
 // pagehide persistence handler that would otherwise overwrite seeded data.
 await local.addInitScript(()=>{
   const key='pocket-works:ne-zhmi:preferences';
   localStorage.setItem(key,JSON.stringify({records:{
     '2027:6:2':120,'2027:4:2':31,'2027':5
   }}));
 });
 await local.reload();
 await local.locator('#mode-lab').click();
 await local.locator('#lab-seed').fill('2027');
 await local.locator('#lab-length').selectOption('6');
 await local.locator('#start').click();
 await poll(()=>local.locator('#record').textContent().then(t=>t.includes('02:00')),'six-section record');
 await local.locator('#pause').click();
 await local.locator('#leave-pause').click();
 await local.locator('#mode-lab').click();
 await local.locator('#lab-seed').fill('2027');
 await local.locator('#lab-length').selectOption('4');
 await local.locator('#start').click();
 await poll(()=>local.locator('#record').textContent().then(t=>t.includes('00:31')),'four-section record not confused');
 await local.locator('#pause').click();
 await poll(()=>local.locator('#pause-panel').isVisible(),'lab pause');
 await local.locator('#restart-pause').click();
 await poll(()=>local.locator('#notice').textContent().then(t=>t.includes('2027')),'repeat seeded experiment');
 console.log('PASS: host-only party, 3 server-confirmed stages, cumulative score both clients, next series, seeded six-section local lab and replay');
 for(const context of contexts)await context.close();
}finally{await browser?.close();await new Promise(done=>server.close(done));}
