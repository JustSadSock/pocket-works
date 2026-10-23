// Real Picto clients + v6 and pinned legacy-v5 rules over a local PocketNet wire harness.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import rules from '../server/module.ts';
import legacyRules from '../../../pocketnet/module-versions/picto/v5.ts';

const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript',
 '.ts':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const sockets=new Map(),sessions=new Map();
const roomId='01234567-0000-4000-8000-000000000001';
let room=null,counter=0,activeRules=rules,activeVersion='v6';
const queue=(s,message)=>{if(s)s.messages.push(message)};
function emit(events=[]){
 for(const event of events)for(const socket of sockets.values())
  if(socket.roomId===roomId&&(!event.to||socket.player?.id===event.to))
   queue(socket,{type:'game_event',roomId,event});
}
function onWire(socket,msg){
 if(msg.type==='auth'){
  const p=sessions.get(msg.token);
  if(!p)return queue(socket,{type:'error',code:'invalid_token'});
  socket.player=p;queue(socket,{type:'authenticated',player:p});return;
 }
 const player=socket.player;
 if(!player)return queue(socket,{type:'error',code:'auth_required'});
 if(msg.type==='create_room'){
  room={id:roomId,players:[player],state:activeRules.createRoom({player}).state};
  socket.roomId=roomId;queue(socket,{type:'room_joined',roomId,gameId:'picto',version:activeVersion});
  return;
 }
 if(msg.type==='join_room'){
  if(!room||![roomId,roomId.slice(0,8)].includes(String(msg.roomId).toLowerCase()))
   return queue(socket,{type:'error',code:'room_not_found'});
  socket.roomId=roomId;
  if(!room.players.some(p=>p.id===player.id)){
   const players=[...room.players,player];
   const next=activeRules.onJoin({state:room.state,player,players});
   room.state=next.state;room.players=players;emit(next.events);
  }
  queue(socket,{type:'room_joined',roomId,gameId:'picto',version:activeVersion});
  for(const other of sockets.values())if(other.roomId===roomId)queue(other,{type:'presence',roomId,players:room.players});
  return;
 }
 if(!room||socket.roomId!==roomId)return queue(socket,{type:'error',code:'not_in_room'});
 if(msg.type==='game_message'){
  const result=activeRules.onMessage({state:room.state,player,players:room.players,payload:msg.payload});
  room.state=result.state;emit(result.events);return;
 }
 if(msg.type==='leave_room'){
  room.players=room.players.filter(p=>p.id!==player.id);
  const result=activeRules.onLeave({state:room.state,player,players:room.players});
  room.state=result.state;socket.roomId=null;emit(result.events);
 }
}
const server=createServer(async(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
 if(u.pathname==='/pocket-id/me')return json(401,{error:'guest'});
 if(u.pathname==='/pocketnet/health')return json(200,{ok:true,modules:['picto']});
 if(u.pathname==='/pocketnet/session'&&req.method==='POST'){
  let data='';for await(const part of req)data+=part;
  const name=JSON.parse(data||'{}').name||'Гость';
  const id='player-'+(++counter),token='token-'+id;
  sessions.set(token,{id,name});return json(200,{token});
 }
 if(u.pathname==='/__qa/poll'){
  const socket=sockets.get(u.searchParams.get('sid'));
  return json(200,{messages:socket?.messages.splice(0)||[]});
 }
 if(u.pathname==='/__qa/send'&&req.method==='POST'){
  let data='';for await(const part of req)data+=part;
  const body=JSON.parse(data||'{}');
  let socket=sockets.get(body.sid);
  if(!socket){socket={messages:[],player:null,roomId:null};sockets.set(body.sid,socket);}
  try{onWire(socket,body.payload)}catch(error){queue(socket,{type:'error',code:String(error.message)});}
  return json(200,{ok:true});
 }
 const name=decodeURIComponent(u.pathname);
 const file=resolve(root,'.'+name,name.endsWith('/')?'index.html':'');
 if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
 try{const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);}
 catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const browser=await chromium.launch({headless:true});
const output=process.env.PW_QA_OUTPUT_DIR||'';
if(output)await mkdir(output,{recursive:true});
const initSocket=()=>{
 let counter=0;
 class TestSocket{
  static OPEN=1;
  constructor(){
   this.sid='socket-'+(++counter)+'-'+Math.random();
   window.__pictoQaSocket=this;
   this.readyState=0;this.queue=Promise.resolve();this.polling=false;
   queueMicrotask(()=>{this.readyState=1;this.onopen?.();});
   this.timer=setInterval(()=>this.poll(),85);
  }
  send(data){
   this.queue=this.queue.then(()=>fetch('/__qa/send',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({sid:this.sid,payload:JSON.parse(data)})})).catch(e=>this.onerror?.(e));
  }
  async poll(){
   if(this.readyState!==1||this.polling)return;this.polling=true;
   try{await this.queue;const res=await fetch('/__qa/poll?sid='+this.sid,{cache:'no-store'});
    const data=await res.json();
    for(const message of data.messages||[])this.onmessage?.({data:JSON.stringify(message)});
   }catch(e){this.onerror?.(e);}finally{this.polling=false;}
  }
  close(){clearInterval(this.timer);this.readyState=3;this.onclose?.({});}
 }
 window.WebSocket=TestSocket;
};
const errors=[];
async function open(name,viewport,skew=0){
 const context=await browser.newContext({viewport,isMobile:viewport.width<600,hasTouch:viewport.width<600,serviceWorkers:'block'});
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(name+': '+e.message));
 await page.addInitScript(initSocket);
 if(skew)await page.addInitScript(offset=>{const native=Date.now.bind(Date);Date.now=()=>native()+offset;},skew);
 await page.goto('http://127.0.0.1:'+port+'/apps/picto/',{waitUntil:'domcontentloaded'});
 await page.locator('#playerName').waitFor();
 await page.locator('#playerName').fill(name);
 return {context,page};
}
const shot=async(page,file)=>{if(output)await page.screenshot({path:join(output,file),fullPage:true});};
const qaSend=(page,payload)=>page.evaluate(body=>window.__pictoQaSocket.send(JSON.stringify({wireVersion:1,type:'game_message',payload:body})),payload);
const syncAll=()=>{for(const p of room.players){const r=activeRules.onMessage({state:room.state,player:p,players:room.players,payload:{type:'sync'}});room.state=r.state;emit(r.events);}};
const settle=async(predicate,description)=>{for(let n=0;n<70&&!predicate();n++)await new Promise(resolve=>setTimeout(resolve,50));assert.ok(predicate(),description);};
const clock=async page=>{
 const t=(await page.locator('#timer').innerText()).trim().split(':').map(Number);
 return t[0]*60+t[1];
};
try{
 const host=await open('Автор А',{width:1366,height:768});
 await host.page.locator('[data-action="create"]').click();
 await host.page.locator('.ticket-code').waitFor();
 const guest=await open('Автор Б',{width:390,height:844},15000);
 await guest.page.locator('#roomCode').fill(roomId.slice(0,8));
 await guest.page.locator('[data-action="join"]').click();
 await guest.page.waitForFunction(()=>document.querySelectorAll('.player').length===2);
 await host.page.waitForFunction(()=>document.querySelectorAll('.player').length===2);
 await host.page.locator('[data-action="start"]').click();
 await host.page.locator('[data-action="publish"]').waitFor();
 await guest.page.locator('.wait-box').waitFor();
 assert.equal(room.state.author,room.players[0].id);
 assert.ok(Math.abs(await clock(host.page)-await clock(guest.page))<=2,'15-second device clock skew must be corrected');
 await host.page.locator('[data-glyph="cat"]').click();
 await host.page.locator('.stage .stamp').waitFor();
 const before=await host.page.evaluate(()=>{
  const stage=document.querySelector('#liveStage'),stamp=stage.querySelector('.stamp');
  const s=stage.getBoundingClientRect(),g=stamp.getBoundingClientRect();
  return {ratio:s.width/s.height,x:(g.left+g.width/2-s.left)/s.width,y:(g.top+g.height/2-s.top)/s.height};
 });
 await host.page.setViewportSize({width:1100,height:750});
 const after=await host.page.evaluate(()=>{
  const stage=document.querySelector('#liveStage'),stamp=stage.querySelector('.stamp');
  const s=stage.getBoundingClientRect(),g=stamp.getBoundingClientRect();
  return {ratio:s.width/s.height,x:(g.left+g.width/2-s.left)/s.width,y:(g.top+g.height/2-s.top)/s.height};
 });
 assert.ok(Math.abs(before.ratio-1.5)<.03&&Math.abs(after.ratio-1.5)<.03,'Editor canvas stays 3:2');
 assert.ok(Math.abs(before.x-after.x)<.02&&Math.abs(before.y-after.y)<.02,'Glyph positions survive resize');
 await host.page.locator('[data-frame="1"]').click();
 await host.page.locator('[data-glyph="arrow"]').click();
 await shot(host.page,'first-author-compose.png');
 await host.page.locator('[data-action="publish"]').click();
 await host.page.locator('.guess-card').count().then(n=>assert.equal(n,0));
 await guest.page.locator('.guess-card').waitFor();
 const mobileStoryboard=await guest.page.evaluate(()=>{
  const rect=document.querySelector('.guess-layout .stage-frame').getBoundingClientRect();
  const canvases=[...document.querySelectorAll('.guess-layout .story-panel .stage')].map(el=>el.getBoundingClientRect());
  const guess=document.querySelector('.guess-card').getBoundingClientRect();
  return {frameHeight:rect.height,inside:canvases.every(c=>c.top>=rect.top-1&&c.bottom<=rect.bottom+1),
   noOverlap:rect.bottom<=guess.top+2};
 });
 assert.ok(mobileStoryboard.frameHeight>=130&&mobileStoryboard.inside&&mobileStoryboard.noOverlap,
  'Mobile storyboard must contain both panels without overlapping controls: '+JSON.stringify(mobileStoryboard));
 assert.equal(room.state.phase,'guess');
 assert.equal(room.state.board.length,2);
 await shot(guest.page,'guest-guess-mobile.png');
 await guest.page.locator('[data-guess-slot="0"]').selectOption({index:1});
 await guest.page.locator('[data-action="submit-guess"]').click();
 await host.page.locator('.reveal-head').waitFor();
 await guest.page.locator('.reveal-head').waitFor();
 await host.page.locator('[data-action="next"]').click();
 await guest.page.locator('[data-action="publish"]').waitFor();
 await host.page.locator('.wait-box').waitFor();
 assert.equal(room.state.author,room.players[1].id,'Second round must change author to guest');
 await guest.page.locator('[data-glyph="human"]').click();
 const mobileSubmit=await guest.page.locator('[data-action="publish"]').evaluate(button=>{
  const rect=button.getBoundingClientRect();
  return {top:rect.top,bottom:rect.bottom,viewport:innerHeight};
 });
 assert.ok(mobileSubmit.top>=55&&mobileSubmit.bottom<=mobileSubmit.viewport-6,
  'Mobile publish action must stay visible without scrolling: '+JSON.stringify(mobileSubmit));
 await shot(guest.page,'second-author-one-frame.png');
 await guest.page.locator('[data-action="publish"]').click();
 await host.page.locator('.guess-card').waitFor();
 assert.equal(room.state.phase,'guess','One filled frame must publish successfully');
 assert.equal(room.state.board.length,1);
 assert.equal(room.state.board[0].frame,0);
 await shot(host.page,'host-guess-second-round.png');
 await host.page.locator('[data-guess-slot="0"]').selectOption({index:1});
 await host.page.locator('[data-action="submit-guess"]').click();
 await host.page.locator('.reveal-head').waitFor();
 await guest.page.locator('.reveal-head').waitFor();
 assert.equal(room.state.round,2);
 await shot(guest.page,'guest-second-reveal.png');
 await host.page.locator('[data-action="next"]').click();
 await host.page.locator('.finish').waitFor();
 await guest.page.locator('.finish').waitFor();
 assert.equal(room.state.phase,'results');
 assert.equal(room.state.history.length,2);
 await shot(host.page,'final-gallery-desktop.png');
 // Regression: an expired round must never leave the author editing at 00:00.
 await host.page.locator('[data-action="again"]').click();
 await host.page.locator('[data-action="publish"]').waitFor();
 await host.page.locator('[data-glyph="key"]').click();
 for(let attempt=0;attempt<40&&room.state.board.length!==1;attempt++)await new Promise(resolve=>setTimeout(resolve,50)); // Await the debounced edit.
 assert.equal(room.state.board.length,1,'Server received the draft before its deadline');
 room.state.deadline=Date.now()-1;
 await host.page.locator('[data-action="publish"]').click();
 await host.page.locator('.wait-box').waitFor();
 await guest.page.locator('.guess-card').waitFor();
 assert.equal(room.state.phase,'guess','Author and guest enter guessing after an expired publish');
 await shot(host.page,'v6-after-expired-publish-desktop.png');
 await shot(guest.page,'v6-after-expired-publish-mobile.png');
 await qaSend(host.page,{type:'publish',glyphs:[{id:'key',x:50,y:50,r:0,s:1,frame:0}]});
 await host.page.locator('.wait-box').waitFor();
 assert.equal(room.state.phase,'guess','A duplicate stale publication cannot rewind the server');
 await guest.page.locator('[data-guess-slot="0"]').selectOption({index:1});
 await guest.page.locator('[data-action="submit-guess"]').click();
 await host.page.locator('.reveal-head').waitFor();
 await host.page.locator('[data-action="next"]').click();
 await guest.page.locator('[data-action="publish"]').waitFor();
 // Blank author: on timeout the room reveals immediately, without impossible guessing.
 room.state.deadline=Date.now()-1;
 await qaSend(host.page,{type:'sync'});
 await host.page.locator('.reveal-head').waitFor();
 await guest.page.locator('.reveal-head').waitFor();
 assert.equal(room.state.phase,'reveal','Empty timed-out composition skips guessing');
 assert.equal(room.state.history.at(-1).board.length,0);
 await shot(guest.page,'v6-empty-timeout-mobile.png');
 await host.page.locator('[data-action="next"]').click();
 await host.page.locator('.finish').waitFor();
 await guest.page.locator('.finish').waitFor();
 assert.equal(room.state.history.length,2,'Timeout round is preserved in results');
 console.log('Picto v6 2-player browser matches passed: rotation, late send, replay, stale command, empty timeout.');
 await host.context.close();await guest.context.close();

 // A published room stays pinned to v5. No code in that snapshot can be changed,
 // so both clients must escape the old silent deadline transition on their own.
 sockets.clear();room=null;activeRules=legacyRules;activeVersion='v5';
 const oldHost=await open('Старый автор',{width:1280,height:800});
 await oldHost.page.locator('[data-action="create"]').click();
 await oldHost.page.locator('.ticket-code').waitFor();
 const oldGuest=await open('Старый друг',{width:390,height:844},-9000);
 await oldGuest.page.locator('#roomCode').fill(roomId.slice(0,8));
 await oldGuest.page.locator('[data-action="join"]').click();
 await oldHost.page.waitForFunction(()=>document.querySelectorAll('.player').length===2);
 await oldGuest.page.waitForFunction(()=>document.querySelectorAll('.player').length===2);
 await oldHost.page.locator('[data-action="start"]').click();
 await oldHost.page.locator('[data-action="publish"]').waitFor();
 await oldGuest.page.locator('.wait-box').waitFor();
 await oldHost.page.locator('[data-glyph="key"]').click();
 await settle(()=>room.state.board.length===1,'Legacy server must receive first glyph');
 room.state.deadline=Date.now()+1500;
 syncAll();
 await oldHost.page.locator('.wait-box').waitFor({timeout:11000});
 await oldGuest.page.locator('.guess-card').waitFor({timeout:11000});
 assert.equal(room.state.phase,'guess','Legacy v5 room advances even when prior pulses were clock-only');
 await shot(oldHost.page,'v5-expired-author-recovered-desktop.png');
 await shot(oldGuest.page,'v5-expired-guesser-recovered-mobile.png');
 await oldGuest.page.locator('[data-guess-slot="0"]').selectOption({index:1});
 await oldGuest.page.locator('[data-action="submit-guess"]').click();
 await oldHost.page.locator('.reveal-head').waitFor();
 await oldHost.page.locator('[data-action="next"]').click();
 await oldGuest.page.locator('[data-action="publish"]').waitFor();
 // Reload the CURRENT (non-host) author, then resume with the same token.
 await oldGuest.page.locator('[data-glyph="human"]').click();
 await settle(()=>room.state.board.length===1,'Draft reaches server before reconnection');
 await shot(oldGuest.page,'v5-author-before-reload-mobile.png');
 await oldGuest.page.reload({waitUntil:'domcontentloaded'});
 await oldGuest.page.locator('[data-action="resume"]').waitFor();
 await oldGuest.page.locator('[data-action="resume"]').click();
 await oldGuest.page.locator('[data-action="publish"]').waitFor({timeout:11000});
 await oldGuest.page.locator('.stage .stamp').waitFor();
 assert.equal(room.state.author,room.players[1].id,'Guest still owns the turn after rejoin');
 await shot(oldGuest.page,'v5-author-restored-mobile.png');
 await oldGuest.page.locator('[data-action="publish"]').click();
 await oldHost.page.locator('.guess-card').waitFor();
 assert.equal(room.state.phase,'guess','Reconnected guest can publish to v5');
 await oldHost.page.locator('[data-guess-slot="0"]').selectOption({index:1});
 await oldHost.page.locator('[data-action="submit-guess"]').click();
 await oldGuest.page.locator('.reveal-head').waitFor();
 await oldHost.page.locator('[data-action="next"]').click();
 await oldHost.page.locator('.finish').waitFor();
 await oldGuest.page.locator('.finish').waitFor();
 console.log('Picto pinned-v5 browser match passed: two-ended 00:00 recovery, non-host reload, saved draft and publish.');
 await oldHost.context.close();await oldGuest.context.close();

 // Three distinct clients: concurrent guesses, partial answers, blank timed-out
 // round, three-frame editing, gallery and whole-match restart.
 sockets.clear();room=null;activeRules=rules;activeVersion='v6';
 const leader=await open('Игрок А',{width:1440,height:900});
 await leader.page.locator('[data-action="create"]').click();
 await leader.page.locator('.ticket-code').waitFor();
 const playerB=await open('Игрок Б',{width:390,height:844},16000);
 const playerC=await open('Игрок В',{width:820,height:1180},-12000);
 for(const p of [playerB,playerC]){
  await p.page.locator('#roomCode').fill(roomId.slice(0,8));
  await p.page.locator('[data-action="join"]').click();
 }
 for(const p of [leader,playerB,playerC])await p.page.waitForFunction(()=>document.querySelectorAll('.player').length===3);
 await leader.page.locator('[data-action="start"]').click();
 await leader.page.locator('[data-action="publish"]').waitFor();
 await leader.page.locator('[data-glyph="cat"]').click();
 await leader.page.locator('[data-action="publish"]').click();
 await playerB.page.locator('.guess-card').waitFor();
 await playerC.page.locator('.guess-card').waitFor();
 await playerB.page.locator('[data-guess-slot="0"]').selectOption({index:1});
 await playerB.page.locator('[data-action="submit-guess"]').click();
 await playerB.page.locator('[data-action="submit-guess"]').waitFor({state:'visible'});
 assert.equal(room.state.phase,'guess','First response must not finalize a three-player round');
 await playerC.page.locator('[data-guess-slot="1"]').selectOption({index:1});
 await playerC.page.locator('[data-action="submit-guess"]').click();
 for(const p of [leader,playerB,playerC])await p.page.locator('.reveal-head').waitFor();
 assert.equal(room.state.phase,'reveal');
 await shot(playerC.page,'v6-three-player-reveal-tablet.png');
 await leader.page.locator('[data-action="next"]').click();
 await playerB.page.locator('[data-action="publish"]').waitFor();
 assert.equal(room.state.author,room.players[1].id,'Author must rotate to second player');
 room.state.deadline=Date.now()-1;
 await qaSend(playerC.page,{type:'sync'});
 for(const p of [leader,playerB,playerC])await p.page.locator('.reveal-head').waitFor();
 assert.equal(room.state.history.at(-1).board.length,0,'Blank second author counts as skipped round');
 await leader.page.locator('[data-action="next"]').click();
 await playerC.page.locator('[data-action="publish"]').waitFor();
 assert.equal(room.state.author,room.players[2].id,'Third player gets authorship');
 assert.equal(room.state.frames,3,'Third round has three panels');
 await playerC.page.locator('[data-glyph="gift"]').click();
 await playerC.page.locator('[data-frame="2"]').click();
 await playerC.page.locator('[data-glyph="chest"]').click();
 await shot(playerC.page,'v6-third-author-three-frames-tablet.png');
 await playerC.page.locator('[data-action="publish"]').click();
 for(const p of [leader,playerB])await p.page.locator('.guess-card').waitFor();
 await shot(playerB.page,'v6-three-frame-guess-mobile.png');
 for(const p of [leader,playerB]){
  await p.page.locator('[data-guess-slot="0"]').selectOption({index:1});
  await p.page.locator('[data-action="submit-guess"]').click();
 }
 for(const p of [leader,playerB,playerC])await p.page.locator('.reveal-head').waitFor();
 await playerC.page.locator('[data-action="save-word"]').click();
 await settle(()=>room.state.lexicon.length===1,'Third author can save a discovered expression');
 await leader.page.locator('[data-action="next"]').click();
 for(const p of [leader,playerB,playerC])await p.page.locator('.finish').waitFor();
 assert.equal(room.state.history.length,3,'Three-player gallery keeps all rounds');
 await shot(leader.page,'v6-three-player-results-desktop.png');
 await leader.page.locator('[data-action="again"]').click();
 await leader.page.locator('[data-action="publish"]').waitFor();
 assert.equal(room.state.round,1,'Replay resets round');
 assert.equal(room.state.history.length,0,'Replay clears old results');
 assert.equal(room.state.players.length,3,'Replay keeps three participants');
 console.log('Picto v6 3-player browser match passed: partial answers, all authors, blank round, three frames, lexicon and replay.');
 await leader.context.close();await playerB.context.close();await playerC.context.close();
 assert.deepEqual(errors,[],'No uncaught browser exceptions in any match');
}finally{await browser.close();await new Promise(done=>server.close(done));}
