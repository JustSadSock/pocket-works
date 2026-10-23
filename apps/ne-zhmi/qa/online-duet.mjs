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
      // The network E2E uses a known two-jump benchmark for reproducibility;
      // procedural courses are separately validated across seeds.
      if((req.payload?.type==='start'||req.payload?.type==='restart')&&room.state.phase==='play'&&room.state.round<=2){
        room.state.robot=testModule.createGame(testModule.LEVEL);
        for(const event of answer.events||[])if(event.type==='state')event.payload.robot=room.state.robot;
      }
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
const screenshots=process.env.PW_QA_OUTPUT_DIR||'/tmp';
try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const contexts=[],pages=[];
  for(let i=0;i<2;i++){
    const context=await browser.newContext({viewport:{width:i?390:1366,height:i?844:768},serviceWorkers:'block'});
    contexts.push(context);const page=await context.newPage();pages.push(page);
    await page.route('**/pocketnet/session',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'TOKEN'+i})}));
    await page.routeWebSocket('**/pocketnet/ws',ws=>wireSocket(ws));
    await page.goto(url);await page.waitForSelector('#create-online');
    await page.locator('#player-name').fill(players[i].name);
  }
  const [host,guest]=pages;
  await host.locator('#create-online').click();
  await poll(()=>host.locator('#online-code').isVisible(),'host code');
  if(!(await host.locator('#online-code').textContent()).includes('AABBCCDD'))throw Error('Room code missing');
  await host.screenshot({path:screenshots+'/duet-host-lobby.png'});
  await guest.locator('#join-online').click();
  await guest.locator('#online-code-input').fill('AABBCCDD');
  await guest.locator('#online-join').click();
  await poll(()=>host.locator('#online-start').isEnabled(),'second seat');
  await poll(()=>guest.locator('#online-role').textContent().then(s=>s?.includes('разворотом')),'guest role');
  await guest.screenshot({path:screenshots+'/duet-guest-lobby.png'});
  await host.locator('#online-start').click();
  await poll(()=>host.locator('#online-out').isVisible(),'host in game');
  await poll(()=>guest.locator('#online-out').isVisible(),'guest in game');
  if(await host.locator('#jump').isDisabled() || !(await host.locator('#reverse').isDisabled()))throw Error('Host role controls incorrect');
  if(!(await guest.locator('#jump').isDisabled()) || await guest.locator('#reverse').isDisabled())throw Error('Guest role controls incorrect');
  await host.screenshot({path:screenshots+'/duet-host-active.png'});
  await guest.screenshot({path:screenshots+'/duet-guest-active.png'});
  // The guest changes direction twice. Only the host can jump.
  await guest.locator('#reverse').click();
  await poll(()=>room.state.robot.reverses===1,'guest reverse authorized');
  await pause(340);
  await guest.locator('#reverse').click();
  await poll(()=>room.state.robot.reverses===2,'second guest reverse');
  await poll(()=>room.state.robot.x>4.1,'approach first obstacle',13000);
  await host.locator('#jump').click();
  await poll(()=>room.state.robot.jumps>=1,'host jump accepted');
  await poll(()=>room.state.robot.checkpoint>9,'checkpoint',14000);
  // Reopen the guest tab: the session token must recover the same room.
  await guest.reload();
  await poll(()=>guest.locator('#online-out').isVisible(),'guest reconnect after reload',10000);
  await poll(()=>guest.locator('#reverse').isEnabled(),'role persisted');
  await poll(()=>!room.state.hold,'two active operators after reconnect');
  // Start a fresh synchronized round from the host.
  await host.locator('#online-out').click();
  await host.locator('#online-leave-no').click();
  if(room.state.players.length!==2)throw Error('Cancel exit evicted player');
  // Host reload preserves game too.
  await host.reload();
  await poll(()=>host.locator('#online-out').isVisible(),'host reconnect after reload');
  if(!room||room.state.players.length!==2)throw Error('Room membership lost');
  await host.screenshot({path:screenshots+'/duet-host-rejoined.png'});
  await guest.screenshot({path:screenshots+'/duet-guest-rejoined.png'});
  // A fresh round isolates finish from the deliberately interrupted reconnect
  // sequence. Both clients must acknowledge the replacement round.
  await poll(()=>!room.state.hold,'both operators actively pulsing');
  const preRound=room.state.round;
  const restarted=module.onMessage({state:room.state,player:players[0],payload:{type:'restart'}});
  room.state=restarted.state;broadcastEvents(restarted.events);
  await poll(()=>room.state.round===preRound+1,'server restart');
  await poll(()=>host.locator('#jump').isEnabled(),'host input after restart');
  await poll(()=>guest.locator('#reverse').isEnabled(),'guest input after restart');
  await poll(()=>room.state.robot.x>4.1&&room.state.robot.ground,'new round first obstacle');
  await host.locator('#jump').click();
  await poll(()=>room.state.robot.jumps===1,'first jump in replay');
  await poll(()=>room.state.robot.x>11.9&&room.state.robot.ground,'new round final gap',12000);
  await host.locator('#jump').click();
  await poll(()=>room.state.robot.jumps>=2,'second jump',5000).catch(error=>{
    console.error('JUMP DIAGNOSTIC',JSON.stringify({
      phase:room.state.phase,hold:room.state.hold,round:room.state.round,
      x:room.state.robot.x,t:room.state.robot.t,jumps:room.state.robot.jumps,
      signals:room.state.signals,lastClock:room.state.lastClock,now:Date.now()
    }));throw error;
  });
  await poll(()=>room.state.phase==='won','authoritative finish',10000);
  await poll(()=>host.locator('#online-result').isVisible(),'host victory overlay');
  await poll(()=>guest.locator('#online-result').isVisible(),'guest victory overlay');
  await host.screenshot({path:screenshots+'/duet-host-finish.png'});
  await guest.screenshot({path:screenshots+'/duet-guest-finish.png'});
  const round=room.state.round;
  await host.locator('#online-again').click();
  await poll(()=>room.state.phase==='play'&&room.state.round===round+1,'next shared round');
  await poll(()=>guest.locator('#online-out').isVisible(),'guest entered next round');
  if(room.state.robot.level?.sections?.length!==5)throw Error('Next shared course was not generated');
  await poll(async()=>await guest.locator('#scene-label').textContent()===await host.locator('#scene-label').textContent(),'same section/theme caption');
  await host.screenshot({path:screenshots+'/duet-host-generated.png'});
  await guest.screenshot({path:screenshots+'/duet-guest-generated.png'});
  console.log('PASS: create -> join -> role controls -> checkpoint -> reconnect -> finish on both clients -> replay');
  for(const context of contexts)await context.close();
}finally{await browser?.close();await new Promise(done=>server.close(done));}
