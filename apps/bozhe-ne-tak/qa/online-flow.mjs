
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';

const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const source=await readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const {default:rules}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const sessions=new Map(),sockets=new Map(),rooms=new Map();
let counter=0;
const roomId='01234567-0000-4000-8000-000000000001';
const enqueue=(socket,msg)=>{if(socket)socket.messages.push(msg)};
const broadcast=(room,msg)=>{for(const s of sockets.values())if(s.roomId===room.id)enqueue(s,msg)};
const deliver=(room,events)=>{
 for(const event of events||[])for(const s of sockets.values())
  if(s.roomId===room.id&&(!event.to||s.player?.id===event.to))
   enqueue(s,{type:'game_event',roomId:room.id,event:event.type==='state'
    ?{...event,payload:rules.viewForPlayer({state:room.state,player:s.player,players:room.players})}:event});
};
function handle(socket,msg){
 if(!socket)throw Error('bad_socket');
 if(msg.type==='auth'){
  const player=sessions.get(msg.token);if(!player)return enqueue(socket,{type:'error',code:'invalid_token'});
  socket.player=player;enqueue(socket,{type:'authenticated',player});return;
 }
 const player=socket.player;if(!player)return enqueue(socket,{type:'error',code:'auth_required'});
 if(msg.type==='create_room'){
  const room={id:roomId,players:[player],state:rules.createRoom({player}).state};rooms.set(roomId,room);socket.roomId=roomId;
  enqueue(socket,{type:'room_joined',roomId,gameId:'bozhe-ne-tak',version:'v2',players:room.players,state:rules.viewForPlayer({state:room.state,player,players:room.players})});
  return;
 }
 if(msg.type==='join_room'){
  const room=rooms.get(roomId);
  if(!room)return enqueue(socket,{type:'error',code:'room_not_found'});
  if(!['01234567',roomId].includes(String(msg.roomId).toLowerCase()))return enqueue(socket,{type:'error',code:'room_not_found'});
  if(!room.players.some(p=>p.id===player.id)){
   const members=[...room.players,player];
   try{const r=rules.onJoin({state:structuredClone(room.state),players:members,player});room.state=r.state;room.players=members;deliver(room,r.events)}
   catch(e){enqueue(socket,{type:'error',code:e.message});return}
  }
  socket.roomId=roomId;
  enqueue(socket,{type:'room_joined',roomId,gameId:'bozhe-ne-tak',version:'v2',players:room.players,state:rules.viewForPlayer({state:room.state,player,players:room.players})});
  broadcast(room,{type:'presence',roomId,players:room.players});return;
 }
 const room=rooms.get(socket.roomId);
 if(!room)return enqueue(socket,{type:'error',code:'room_not_found'});
 if(msg.type==='game_message'){
  const r=rules.onMessage({state:structuredClone(room.state),player,players:room.players,payload:msg.payload});
  room.state=r.state;deliver(room,r.events);return;
 }
 if(msg.type==='leave_room'){
  room.players=room.players.filter(p=>p.id!==player.id);
  const r=rules.onLeave({state:structuredClone(room.state),player,players:room.players});
  room.state=r.state;socket.roomId=null;
  deliver(room,r.events);broadcast(room,{type:'presence',roomId,players:room.players});
 }
}
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 const send=(status,json)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(json))};
 if(url.pathname==='/pocketnet/session'&&req.method==='POST'){
  const b=await new Promise(resolve=>{let raw='';req.on('data',x=>raw+=x);req.on('end',()=>resolve(JSON.parse(raw||'{}')))});
  const id='test'+(++counter),token=createHash('sha256').update('bnt-room-'+id).digest('hex');
  sessions.set(token,{id,name:'Гость · '+String(b.name||id)});return send(200,{token});
 }
 if(url.pathname==='/__qa/poll'){const s=sockets.get(url.searchParams.get('sid'));if(!s)return send(200,{messages:[]});
  const msgs=s.messages.splice(0);return send(200,{messages:msgs})}
 if(url.pathname==='/__qa/send'&&req.method==='POST'){
  const b=await new Promise(resolve=>{let raw='';req.on('data',x=>raw+=x);req.on('end',()=>resolve(JSON.parse(raw||'{}')))});
  let s=sockets.get(b.sid);if(!s){s={id:b.sid,player:null,roomId:null,messages:[]};sockets.set(b.sid,s)}
  try{handle(s,b.payload)}catch(e){enqueue(s,{type:'error',code:e.message})}
  return send(200,{ok:true});
 }
 const raw=decodeURIComponent(url.pathname);
 const path=resolve(root,'.'+raw,raw.endsWith('/')?'index.html':'');
 if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return}
 try{const f=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(f)}
 catch{res.writeHead(404);res.end('Not found')}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const port=server.address().port;
const browser=await chromium.launch({headless:true});
const dir=process.env.PW_QA_OUTPUT_DIR||'';
if(dir)await mkdir(dir,{recursive:true});
const init=()=>{
 let counter=0;
 class TestSocket{
  static OPEN=1;
  constructor(url){this.url=url;this.sid=String(performance.now())+'-'+(++counter)+'-'+Math.random();
   this.readyState=0;this.queue=Promise.resolve();this.polling=false;
   queueMicrotask(()=>{if(this.readyState!==0)return;this.readyState=1;this.onopen?.()});
   this.timer=setInterval(()=>this.poll(),110);
  }
  send(value){this.queue=this.queue.then(()=>fetch('/__qa/send',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({sid:this.sid,payload:JSON.parse(value)})})).catch(e=>{this.onerror?.(e)});}
  async poll(){if(this.readyState!==1||this.polling)return;this.polling=true;
   try{await this.queue;const r=await fetch('/__qa/poll?sid='+encodeURIComponent(this.sid),{cache:'no-store'});const data=await r.json();
    for(const msg of data.messages||[])this.onmessage?.({data:JSON.stringify(msg)});
   }catch(e){this.onerror?.(e)}finally{this.polling=false}}
  close(){if(this.readyState===3)return;clearInterval(this.timer);this.readyState=3;this.onclose?.({})}
 }
 window.WebSocket=TestSocket;
};
const errors=[];
async function openPage(alias){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(alias+': '+e.message));
 await page.addInitScript(init);
 await page.goto('http://127.0.0.1:'+port+'/apps/bozhe-ne-tak/',{waitUntil:'domcontentloaded'});
 await page.locator('.home-stage').waitFor();
 await page.locator('[data-action="online"]').click();
 await page.locator('#bnt-name').fill(alias);
 return {page,context};
}
try{
 const host=await openPage('Настоятель');
 if(dir)await host.page.screenshot({path:join(dir,'online-entry.png')});
 await host.page.locator('[data-net="create"]').click();
 await host.page.locator('.net-code').waitFor({timeout:15000});
 assert.equal((await host.page.locator('.net-code strong').innerText()).trim(),roomId.slice(0,8).toUpperCase());
 const guest=await openPage('Звонарь');
 await guest.page.locator('#bnt-room-code').fill('01234567');
 await guest.page.locator('[data-net="join"]').click();
 await guest.page.locator('.net-members .net-member').first().waitFor();
 await host.page.waitForFunction(()=>document.querySelectorAll('.net-member').length===2);
 assert.equal(await guest.page.locator('.net-member').count(),2);
 if(dir)await host.page.screenshot({path:join(dir,'room-lobby.png')});
 await host.page.locator('[data-net="start"]').click();
 await host.page.locator('.net-play').waitFor();
 await guest.page.locator('.net-play').waitFor();

 // Two players: host owns prophecy + taboo + offerings; guest owns bell and altar height.
 assert.equal(await host.page.locator('[data-role-reveal]').count(),2);
 assert.equal(await guest.page.locator('[data-role-reveal]').count(),0);
 assert.equal(await host.page.locator('[data-role-bell]').count(),0);
 assert.equal(await guest.page.locator('[data-role-bell]').count(),3);
 await host.page.locator('[data-role-reveal="need"]').click();
 await host.page.locator('[data-role-reveal="taboo"]').click();
 await host.page.locator('[data-role-item="goose"]').click();
 await host.page.locator('[data-role-treatment="wash"]').click();
 await guest.page.locator('[data-role-bell="2"]').click();
 await guest.page.locator('[data-role-height="high"]').click();
 await host.page.waitForFunction(()=>document.querySelectorAll('.net-role-person').length===2);
 await host.page.locator('[data-net="lock"]').click();
 await guest.page.locator('[data-net="lock"]').click();
 await host.page.locator('.net-verdict').waitFor();
 await guest.page.locator('.net-verdict').waitFor();
 assert.ok(await host.page.locator('.net-score-list>div').count()>=6);
 assert.equal(rooms.get(roomId).state.match.history.length,1);
 if(dir)await host.page.screenshot({path:join(dir,'two-player-judgment.png')});
 await host.page.locator('[data-net="ack"]').click();
 await guest.page.locator('[data-net="ack"]').click();
 await host.page.locator('.net-council').waitFor();
 await guest.page.locator('.net-council').waitFor();
 await host.page.locator('[data-net-vote]').first().click();
 await guest.page.locator('[data-net-vote]').first().click();
 await host.page.locator('.net-play').waitFor();
 await guest.page.locator('.net-play').waitFor();
 assert.equal(await host.page.evaluate(()=>window.__BNT_QA__().onlinePhase),'play');
 const before=rooms.get(roomId).state.match.round;assert.equal(before,1);
 // Reconnect: same guest session and durable seat after reload; room still has two players.
 await guest.page.reload({waitUntil:'domcontentloaded'});
 await guest.page.locator('[data-action="online"]').click();
 await guest.page.locator('[data-net="resume"]').click();
 await guest.page.locator('.net-play').waitFor({timeout:16000});
 assert.equal(rooms.get(roomId).players.length,2);
 assert.equal(await guest.page.evaluate(()=>window.__BNT_QA__().onlinePhase),'play');
 if(dir)await guest.page.screenshot({path:join(dir,'reconnected-player.png')});
 assert.equal(errors.length,0,errors.join('\n'));
 await host.context.close();await guest.context.close();
 console.log('PocketNet client protocol through real server rules: 2 players, authoritative verdict, vote, reconnect passed.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
