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
const players=Array.from({length:6},(_,i)=>({id:'P'+i,name:'Оператор '+(i+1)}));
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
      // Six-player QA always uses the actual ability-gated generated course.
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
const shots=process.env.PW_QA_OUTPUT_DIR||'/tmp';
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const pages=[],contexts=[];
 for(let i=0;i<6;i++){
   const ctx=await browser.newContext({viewport:{width:i===0?1366:390,height:i===0?768:844},serviceWorkers:'block'});
   contexts.push(ctx);
   const page=await ctx.newPage();pages.push(page);
   await page.route('**/pocketnet/session',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'TOKEN'+i})}));
   await page.routeWebSocket('**/pocketnet/ws',ws=>wireSocket(ws));
   await page.goto(url);await page.waitForSelector('#create-online');
   await page.locator('#player-name').fill(players[i].name);
 }
 await pages[0].locator('#create-online').click();
 await poll(()=>pages[0].locator('#online-code').isVisible(),'six crew host lobby');
 for(let i=1;i<6;i++){
   await pages[i].locator('#join-online').click();
   await pages[i].locator('#online-code-input').fill('AABBCCDD');
   await pages[i].locator('#online-join').click();
   await poll(()=>room?.state?.players?.length===i+1,'seat '+(i+1));
 }
 await poll(()=>pages[0].locator('#online-count').textContent().then(x=>x.includes('6/6')),'six places');
 if(room.state.roles.length!==6)throw Error('Not all six roles allocated');
 await pages[0].screenshot({path:shots+'/crew-six-lobby.png'});
 await pages[5].screenshot({path:shots+'/crew-six-mobile-lobby.png'});
 await pages[0].locator('#online-start').click();
 await poll(()=>pages.every(p=>true)&&room.state.phase==='play','match started');
 for(let i=0;i<6;i++){
   const ability=['jump','reverse','magnet','brake','push','float'][i];
   await poll(()=>pages[i].locator('#'+ability).isEnabled(),'role '+ability);
   for(let j=0;j<6;j++)if(i!==j){
     const foreign=['jump','reverse','magnet','brake','push','float'][j];
     if(!(await pages[i].locator('#'+foreign).isDisabled()))throw Error('Cross-role action available '+i+':'+foreign);
   }
 }
 await pages[2].keyboard.down('m');
 await poll(()=>room.state.robot.held.magnet,'magnet server-on');
 await pages[2].keyboard.up('m');
 await poll(()=>!room.state.robot.held.magnet,'magnet server-off');
 await pages[3].keyboard.down('b');
 await poll(()=>room.state.robot.held.brake,'brake server-on');
 await pages[3].keyboard.up('b');
 await poll(()=>!room.state.robot.held.brake,'brake server-off');
 await pages[4].keyboard.press('e');
 await poll(()=>room.state.robot.pushes===1,'push impulse');
 await pages[5].keyboard.down('f');
 await poll(()=>room.state.robot.held.float,'float server-on');
 await pages[5].keyboard.up('f');
 await poll(()=>!room.state.robot.held.float,'float server-off');
 await pages[0].screenshot({path:shots+'/crew-six-desktop-playing.png'});
 await pages[2].screenshot({path:shots+'/crew-six-mobile-magnet.png'});
 const level=room.state.robot.level;
 if(level.playerCount!==6)throw Error('Game server did not generate six-person ability set');
 const kinds=new Set(level.sections.map(section=>section.kind));
 for(const kind of ['mag-rail','timing-press','cargo-switch','float-gap'])
   if(!kinds.has(kind))throw Error('Missing physical task for operator: '+kind);
 for(let k=1;k<level.sections.length;k++){
   const hard=new Set(['gap','double-gap','step','islands','mag-rail','float-gap']);
   if(hard.has(level.sections[k-1].kind)&&hard.has(level.sections[k].kind))
     throw Error('Two hard jumps were placed consecutively');
 }
 // Interruption: all six operators must remain associated with their roles.
 await pages[5].reload();
 await poll(()=>pages[5].locator('#float').isEnabled(),'float role after reconnect');
 await poll(()=>!room.state.hold,'room resumed after one of six reconnects');
 await pages[5].screenshot({path:shots+'/crew-six-float-reconnected.png'});
 // Local shared-device mode must expose all controls, not dead visual stubs.
 const localCtx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 contexts.push(localCtx);
 const local=await localCtx.newPage();await local.goto(url);
 await local.locator('#operator-count').selectOption('6');
 await local.locator('#start').click();
 await poll(()=>local.locator('#float').isEnabled(),'local float available');
 // Regression: the first browser compositor frame must have actual drawn pixels,
 // not merely the CSS background while the workshop scene is unpainted.
 await poll(()=>local.locator('#scene').evaluate(c=>{
   const context=c.getContext('2d');
   return c.width>30&&c.height>30&&context.getImageData(25,25,1,1).data[3]>0;
 }),'local canvas painted without deferred frame');
 const enabled=await Promise.all(['jump','reverse','magnet','brake','push','float'].map(id=>local.locator('#'+id).isEnabled()));
 if(!enabled.every(Boolean))throw Error('Local operator station hidden or disabled');
 await local.screenshot({path:shots+'/crew-six-local-phone.png'});
 await local.locator('#pause').click();
 await poll(()=>local.locator('#pause-panel').isVisible(),'local pause');
 console.log('PASS: six players, unique role buttons, hold/release, impulse, procedural course, reconnect, mobile local controls');
 for(const ctx of contexts)await ctx.close();
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
