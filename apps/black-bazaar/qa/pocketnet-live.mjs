// Real PocketNet integration: three authenticated WebSocket clients against
// Wrangler's SQLite Durable Object and the immutable Bazaar v20 rules.
import assert from 'node:assert/strict';
import WebSocket from '../../../pocket-server/node_modules/ws/index.js';

const base=process.env.POCKETNET_TEST_URL||'http://127.0.0.1:8787';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const stateEvent=(phase,match=()=>true)=>m=>m.event?.type==='state'&&m.event.payload?.phase===phase&&match(m.event.payload);
const stateOf=event=>event.event.payload;
async function health(){
 for(let n=0;n<100;n++){
  try{
   const r=await fetch(base+'/pocketnet/health');
   if(r.ok){const v=await r.json();if(v.ok)return v;}
  }catch{}
  await delay(300);
 }
 throw Error('Wrangler PocketNet did not start');
}
async function session(name){
 const r=await fetch(base+'/pocketnet/session',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({name})});
 assert.equal(r.status,200,'session must be created');
 const v=await r.json();assert.equal(v.token.length,64);return v.token;
}
async function open(token){
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/pocketnet/ws',{origin:base});
 const queue=[],waiters=[];
 ws.on('message',raw=>{
  let packet;try{packet=JSON.parse(String(raw))}catch{return;}
  const waiter=waiters.find(w=>w.type===packet.type&&w.match(packet));
  if(waiter){waiters.splice(waiters.indexOf(waiter),1);clearTimeout(waiter.timer);waiter.resolve(packet);}
  else queue.push(packet);
 });
 await Promise.race([
  new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)}),
  delay(12000).then(()=>{throw Error('WebSocket open timeout')})
 ]);
 const c={
  ws,queue,
  send(type,data={}){assert.equal(ws.readyState,WebSocket.OPEN);ws.send(JSON.stringify({wireVersion:1,type,...data}));},
  next(type,match=()=>true,timeout=12000){
   const index=queue.findIndex(p=>p.type===type&&match(p));
   if(index>=0)return Promise.resolve(queue.splice(index,1)[0]);
   return new Promise((resolve,reject)=>{
    const entry={type,match,resolve,reject};
    entry.timer=setTimeout(()=>{
     const i=waiters.indexOf(entry);if(i!==-1)waiters.splice(i,1);
     reject(Error('Timeout '+type+' / '+JSON.stringify(queue.slice(-4)).slice(0,2200)));
    },timeout);
    waiters.push(entry);
   });
  },
  async close(){
   if(ws.readyState===WebSocket.CLOSED)return;
   ws.close();
   await Promise.race([new Promise(resolve=>ws.once('close',resolve)),delay(1500)]);
   if(ws.readyState!==WebSocket.CLOSED)ws.terminate();
  }
 };
 c.send('auth',{token});
 const authenticated=await c.next('authenticated');
 c.id=authenticated.player.id;
 return c;
}
function verifyPrivate(state,selfId){
 assert.equal(state.you.id,selfId);
 assert.ok(state.you.quota?.gold>0);
 assert.ok(state.you.items?.length>=0);
 assert.ok(state.players.every(p=>!('quota' in p)&&!('positiveTarget' in p)&&!('negativeTarget' in p)));
 assert.ok(!('contestants' in state),'authoritative contestant secrets are never sent');
}
async function sync(client,minRevision=0){
 client.send('game_message',{payload:{type:'sync'}});
 return stateOf(await client.next('game_event',stateEvent('play',s=>s.revision>=minRevision)));
}
const clients=[],healthStatus=await health();
assert.ok(healthStatus.modules.includes('black-bazaar'),'the actual Worker must publish Bazaar');
const tokens=await Promise.all(['Bazaar One','Bazaar Two','Bazaar Three','Bazaar Outsider'].map(session));
let roomId='';
try{
 const seats=await Promise.all(tokens.slice(0,3).map(async token=>{
  const c=await open(token);clients.push(c);return c;
 }));
 const [host,second,third]=seats,byId=new Map(seats.map(c=>[c.id,c]));
 host.send('create_room',{gameId:'black-bazaar'});
 const initial=await host.next('room_joined');
 roomId=initial.roomId;
 assert.equal(initial.version,'v20','new rooms must use immutable v20');
 assert.equal(initial.state.phase,'lobby');
 second.send('join_room',{roomId:roomId.slice(0,8).toUpperCase()});
 assert.equal((await second.next('room_joined')).state.players.length,2);
 third.send('join_room',{roomId});
 assert.equal((await third.next('room_joined')).state.players.length,3);

 // Verify server-authoritative cosmetic choice before the round, including duplicate portraits.
 host.send('game_message',{payload:{type:'select_avatar',avatarId:'old_man'}});
 await host.next('game_event',stateEvent('lobby',v=>v.players.find(p=>p.id===host.id)?.avatarId==='old_man'));
 second.send('game_message',{payload:{type:'select_avatar',avatarId:'flower'}});
 await second.next('game_event',stateEvent('lobby',v=>v.players.find(p=>p.id===second.id)?.avatarId==='flower'));
 third.send('game_message',{payload:{type:'select_avatar',avatarId:'flower'}});
 const duplicated=stateOf(await third.next('game_event',stateEvent('lobby',v=>v.players.filter(p=>p.avatarId==='flower').length===2)));
 assert.equal(duplicated.players.filter(p=>p.avatarId==='flower').length,2);
 third.send('game_message',{payload:{type:'select_avatar',avatarId:'../../invalid'}});
 assert.match(String((await third.next('game_event',m=>m.event?.type==='notice')).event.payload),/Недопустимый аватар/);
 host.send('game_message',{payload:{type:'start'}});
 const start=await Promise.all(seats.map(c=>c.next('game_event',stateEvent('play'))));
 for(let n=0;n<3;n++)verifyPrivate(stateOf(start[n]),seats[n].id);
 const firstStart=stateOf(start[0]);
 // A time probe is read-only and authenticated. No room-wide state event is needed.
 const pingStamp=Date.now();
 host.send('game_message',{payload:{type:'time_ping',stamp:pingStamp}});
 const ping=await host.next('game_event',m=>m.event?.type==='time_pong'&&m.event.payload?.stamp===pingStamp);
 assert.equal(ping.event.to,host.id);
 assert.ok(Math.abs(ping.event.payload.serverNow-Date.now())<3000,'probe uses server clock');
 host.send('game_message',{payload:{type:'sync'}});
 const refreshed=stateOf(await host.next('game_event',stateEvent('play',view=>view.revision===firstStart.revision)));
 assert.equal(refreshed.revision,firstStart.revision,'read-only sync must not bump revision');
 assert.equal(refreshed.you.id,host.id,'sync is only projected to requesting seat');
 host.send('game_message',{payload:{type:'tick'}});

 assert.ok(firstStart.players.every(p=>p.character===p.name),'verified nicknames replace roles');
 assert.equal(firstStart.players.find(p=>p.id===host.id).avatarId,'old_man');
 assert.equal(firstStart.players.find(p=>p.id===second.id).avatarId,'flower');
 assert.equal(firstStart.players.find(p=>p.id===third.id).avatarId,'flower');
 second.send('game_message',{payload:{type:'select_avatar',avatarId:'mage'}});
 assert.match(String((await second.next('game_event',m=>m.event?.type==='notice')).event.payload),/только до начала/);
 let snap=stateOf(start[0]);
 assert.equal(snap.round,1);
 const seller=byId.get(snap.turnId),buyer=seats.find(c=>c.id!==seller.id);
 assert.ok(seller&&buyer);
 const sellerStart=stateOf(start[seats.indexOf(seller)]);
 const buyerStart=stateOf(start[seats.indexOf(buyer)]);
 const itemId=sellerStart.you.items[0].id;
 const buyerCount=buyerStart.you.items.length;
 const sellerGold=sellerStart.you.resources.gold,buyerGold=buyerStart.you.resources.gold;
 assert.equal(sellerStart.listing,null);
 seller.send('game_message',{payload:{type:'post',itemId,ask:{gold:45,crystals:0,parts:0}}});
 let lotState=stateOf(await seller.next('game_event',stateEvent('play',s=>s.listing?.id===itemId)));
 assert.equal(lotState.listing.seller,seller.id);
 buyer.send('game_message',{payload:{type:'bid',offer:{gold:45,crystals:0,parts:0}}});
 lotState=stateOf(await buyer.next('game_event',stateEvent('play',s=>s.bids?.some(b=>b.buyer===buyer.id))));
 assert.equal(lotState.you.resources.gold,buyerGold,'bids must not debit before seller accepts');
 const bidRevision=lotState.revision;

 // Lose the ACTIVE seller socket after a valid bid. No escrow, item or
 // private state may be lost; the grace period must be persisted by Durable Object.
 await seller.close();
 const presence=stateOf(await buyer.next('game_event',stateEvent('play',s=>s.connectionGraceUntil!=null&&s.revision>bidRevision)));
 assert.ok(presence.connectionGraceUntil>Date.now());
 assert.equal(presence.listing.id,itemId);
 assert.equal(presence.bids.length,1);
 const sellerBack=await open(tokens[seats.indexOf(seller)]);
 clients.push(sellerBack);byId.set(seller.id,sellerBack);
 sellerBack.send('join_room',{roomId});
 const resumed=(await sellerBack.next('room_joined')).state;
 verifyPrivate(resumed,seller.id);
 assert.equal(resumed.you.items.some(i=>i.id===itemId),true);
 assert.equal(resumed.players.find(p=>p.id===seller.id).avatarId,seller.id===host.id?'old_man':'flower');
 assert.equal(resumed.listing.id,itemId);
 assert.equal(resumed.bids.length,1);
 assert.equal(resumed.turnId,seller.id);
 // Reconnection finishes the grace period without duplicating the seat.
 const afterResume=await sync(sellerBack);
 assert.equal(afterResume.players.length,3);
 assert.equal(afterResume.connectionGraceUntil,null);

 const acceptRevision=afterResume.revision;
 sellerBack.send('game_message',{payload:{type:'accept',buyer:buyer.id,bidId:afterResume.bids.find(b=>b.buyer===buyer.id)?.id}});
 const paid=stateOf(await buyer.next('game_event',stateEvent('play',s=>s.revision>acceptRevision&&s.listing===null&&s.you.items.some(i=>i.id===itemId))));
 const sellerPaid=await sync(sellerBack,paid.revision);
 assert.equal(paid.you.items.length,buyerCount+1);
 assert.equal(paid.you.resources.gold,buyerGold-45-(sellerStart.you.negativeTarget===buyer.id?20:0));
 assert.equal(sellerPaid.you.resources.gold,sellerGold+45);
 assert.equal(sellerPaid.you.marketDeals,1);
 assert.equal(sellerPaid.you.items.some(i=>i.id===itemId),false);
 assert.equal(paid.bids.length,0);
 sellerBack.send('game_message',{payload:{type:'accept',buyer:buyer.id,bidId:afterResume.bids.find(b=>b.buyer===buyer.id)?.id}});
 const duplicate=await sellerBack.next('game_event',m=>m.event?.type==='notice');
 assert.ok(duplicate,'stale accept must be rejected');
 const unchanged=await sync(buyer,paid.revision);
 assert.equal(unchanged.you.items.filter(i=>i.id===itemId).length,1);
 assert.equal(unchanged.you.resources.gold,paid.you.resources.gold);

 // A new connection cannot join an already-running match.
 const outsider=await open(tokens[3]);clients.push(outsider);
 outsider.send('join_room',{roomId});
 const rejected=await outsider.next('error');
 assert.equal(rejected.code,'match_in_progress');

 // Nine rounds continue from the authoritative snapshots and survive the
 // disconnect that took place while an auction was outstanding.
 let rounds=0,commands=0,lastRevision=paid.revision;
 for(let n=0;n<48;n++){
  const active=await sync(byId.get(host.id),lastRevision);
  if(active.phase==='done')break;
  const player=byId.get(active.turnId);
  assert.ok(player,'active seat must stay recoverable');
  player.send('game_message',{payload:{type:'end'}});
  const next=await byId.get(host.id).next('game_event',
   m=>m.event?.type==='state'&&m.event.payload?.revision>active.revision);
  const progress=stateOf(next);
  if(progress.phase==='done'){snap=progress;break;}
  lastRevision=progress.revision;
  rounds=Math.max(rounds,progress.round);commands++;
  await delay(65); // Stay below the Worker 30-message/second abuse limit.
 }
 if(snap.phase!=='done'){
  host.send('game_message',{payload:{type:'sync'}});
  const final=await host.next('game_event',m=>m.event?.type==='state');
  snap=stateOf(final);
 }
 assert.equal(snap.phase,'done','all nine rounds completed after reconnection');
 assert.equal(snap.ranking.length,3);
 assert.equal(snap.report.publicSales>=1,true);
 // Host departure is distinct from a lost socket: host handoff must happen
 // immediately and the remaining members must keep playing.
 const nextTokens=await Promise.all(['Bazaar Host Handoff','Bazaar Successor','Bazaar Survivor'].map(session));
 const successors=await Promise.all(nextTokens.map(async token=>{
  const client=await open(token);clients.push(client);return client;
 }));
 const [leavingHost,successor,lastSeat]=successors;
 leavingHost.send('create_room',{gameId:'black-bazaar'});
 const nextRoom=(await leavingHost.next('room_joined')).roomId;
 successor.send('join_room',{roomId:nextRoom});
 await successor.next('room_joined');
 lastSeat.send('join_room',{roomId:nextRoom});
 await lastSeat.next('room_joined');
 leavingHost.send('game_message',{payload:{type:'start'}});
 const secondStart=await Promise.all(successors.map(c=>c.next('game_event',stateEvent('play'))));
 const startedRevision=stateOf(secondStart[1]).revision;
 leavingHost.send('leave_room');
 const handed=stateOf(await successor.next('game_event',stateEvent('play',s=>
  s.revision>startedRevision&&s.host===successor.id&&
  s.players.some(p=>p.id===leavingHost.id&&p.bankrupt))));
 assert.equal(handed.host,successor.id);
 assert.equal(handed.players.filter(p=>!p.bankrupt).length,2);
 assert.ok([successor.id,lastSeat.id].includes(handed.turnId));
 const continuing=[successor,lastSeat].find(c=>c.id===handed.turnId);
 continuing.send('game_message',{payload:{type:'end'}});
 const afterHandoff=stateOf(await successor.next('game_event',stateEvent('play',s=>s.revision>handed.revision)));
 assert.equal(afterHandoff.players.filter(p=>!p.bankrupt).length,2);
 assert.equal(afterHandoff.host,successor.id);
 assert.ok(afterHandoff.turnId!==leavingHost.id,'departed host cannot stall the match');
 // The successor host can remove an active member during play. Unlike a
 // socket drop, this immediately revokes their seat and prevents re-entry.
 const kickRevision=afterHandoff.revision;
 successor.send('game_message',{payload:{type:'kick',targetId:lastSeat.id}});
 const removed=await lastSeat.next('room_kicked');
 assert.equal(removed.roomId,nextRoom);
 assert.equal(removed.reason,'host');
 const kickedState=stateOf(await successor.next('game_event',
  stateEvent('play',state=>state.revision>kickRevision&&
    state.players.some(p=>p.id===lastSeat.id&&p.bankrupt))));
 assert.equal(kickedState.host,successor.id);
 assert.equal(kickedState.players.filter(p=>!p.bankrupt).length,1);
 assert.notEqual(kickedState.turnId,lastSeat.id);
 lastSeat.send('join_room',{roomId:nextRoom});
 assert.equal((await lastSeat.next('error')).code,'room_kicked');
 const kickedReconnect=await open(nextTokens[2]);clients.push(kickedReconnect);
 kickedReconnect.send('join_room',{roomId:nextRoom});
 assert.equal((await kickedReconnect.next('error')).code,'room_kicked');
 const safe=await sync(successor,kickedState.revision);
 assert.equal(safe.players.find(p=>p.id===lastSeat.id).bankrupt,true);

 // Lobby moderation must reject non-host commands, remove the socket and
 // preserve the banned ID even when the excluded guest reauthenticates.
 const lobbyTokens=await Promise.all(['Bazaar Lobby Leader','Bazaar Lobby Guest'].map(session));
 const leader=await open(lobbyTokens[0]),untrusted=await open(lobbyTokens[1]);
 clients.push(leader,untrusted);
 leader.send('create_room',{gameId:'black-bazaar'});
 const lobby=(await leader.next('room_joined')).roomId;
 untrusted.send('join_room',{roomId:lobby});
 await untrusted.next('room_joined');
 untrusted.send('game_message',{payload:{type:'kick',targetId:leader.id}});
 const denied=await untrusted.next('game_event',m=>m.event?.type==='notice');
 assert.match(String(denied.event.payload),/только ведущий/);
 leader.send('game_message',{payload:{type:'kick',targetId:untrusted.id}});
 const lobbyKicked=await untrusted.next('room_kicked');
 assert.equal(lobbyKicked.reason,'host');
 const surviving=(await leader.next('game_event',stateEvent('lobby',v=>v.players.length===1))).event.payload;
 assert.equal(surviving.players[0].id,leader.id);
 untrusted.send('join_room',{roomId:lobby});
 assert.equal((await untrusted.next('error')).code,'room_kicked');

 // Recover an active auction after a simultaneous, room-wide socket blackout.
 const pausedTokens=await Promise.all(['Bazaar Offline Owner','Bazaar Offline Bidder','Bazaar Offline Watcher'].map(session));
 const pausedSockets=await Promise.all(pausedTokens.map(async token=>{const c=await open(token);clients.push(c);return c;}));
 const [owner,bidder,watcher]=pausedSockets;
 owner.send('create_room',{gameId:'black-bazaar'});
 const pausedRoom=(await owner.next('room_joined')).roomId;
 bidder.send('join_room',{roomId:pausedRoom});await bidder.next('room_joined');
 watcher.send('join_room',{roomId:pausedRoom});await watcher.next('room_joined');
 owner.send('game_message',{payload:{type:'start'}});
 const activeViews=await Promise.all(pausedSockets.map(c=>c.next('game_event',stateEvent('play'))));
 const initialView=stateOf(activeViews[0]);
 const turnOwner=pausedSockets.find(c=>c.id===initialView.turnId);
 const turnOwnerView=stateOf(activeViews[pausedSockets.indexOf(turnOwner)]);
 const item=turnOwnerView.you.items[0];
 const nextBidder=pausedSockets.find(c=>c.id!==turnOwner.id&&c.id!==owner.id)||pausedSockets.find(c=>c.id!==turnOwner.id);
 turnOwner.send('game_message',{payload:{type:'post',itemId:item.id,ask:{gold:48}}});
 await nextBidder.next('game_event',stateEvent('play',x=>x.listing?.id===item.id));
 nextBidder.send('game_message',{payload:{type:'bid',offer:{gold:48}}});
 const bidView=stateOf(await nextBidder.next('game_event',stateEvent('play',x=>x.bids.some(b=>b.buyer===nextBidder.id))));
 const initialRemaining=bidView.deadlineAt-Date.now();
 const beforeBalance=bidView.you.resources.gold;
 const beforeItems=bidView.you.items.map(i=>i.id);
 await Promise.all(pausedSockets.map(c=>c.close()));
 await delay(2600);
 const firstReturn=await open(pausedTokens[pausedSockets.indexOf(nextBidder)]);clients.push(firstReturn);
 firstReturn.send('join_room',{roomId:pausedRoom});
 const wakeState=(await firstReturn.next('room_joined')).state;
 assert.equal(wakeState.phase,'play');
 assert.equal(wakeState.host,owner.id,'disconnection does not elect a new host');
 assert.equal(wakeState.turnId,turnOwner.id);
 assert.equal(wakeState.listing.id,item.id);
 assert.ok(wakeState.bids.some(b=>b.buyer===nextBidder.id));
 assert.equal(wakeState.you.resources.gold,beforeBalance);
 assert.deepEqual(wakeState.you.items.map(i=>i.id),beforeItems);
 assert.ok(wakeState.deadlineAt>Date.now());
 assert.ok(wakeState.deadlineAt-Date.now()>initialRemaining-1800,
  'time spent entirely offline cannot consume active turn budget');
 assert.equal(wakeState.offlinePaused,false);
 const hostReturn=await open(pausedTokens[0]);clients.push(hostReturn);
 hostReturn.send('join_room',{roomId:pausedRoom});
 const resumedHost=(await hostReturn.next('room_joined')).state;
 assert.equal(resumedHost.host,owner.id);
 assert.equal(resumedHost.listing.id,item.id);
 assert.equal(resumedHost.round,initialView.round);
 assert.ok(resumedHost.deadlineAt<=wakeState.deadlineAt+250,
  'late host reconnect must not grant a second complete turn');
 console.log('BAZAAR_LIVE_POCKETNET_PASS',JSON.stringify({
  module:initial.version,seats:3,privateViews:true,auction:true,
  activeSellerReconnect:true,deadlineGrace:true,noDuplicateTrade:true,
  rejectedLateJoin:true,hostHandoff:true,lobbyKick:true,liveKick:true,bannedReconnect:true,allOfflineRecovery:true,readonlyClock:true,completedRounds:snap.round||9,turns:commands
 }));
}finally{
 for(const c of clients)try{await c.close()}catch{}
}
