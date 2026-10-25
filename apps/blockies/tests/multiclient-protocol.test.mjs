import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {NetworkManager} from '../network.js';
const serverSource=await readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const {default:game}=await import('data:text/javascript;base64,'+
 Buffer.from(serverSource).toString('base64'));

const people=Array.from({length:3},(_,i)=>({id:'wire'+i,name:'Wire '+i}));
function system(size=2){
 const savedDocument=globalThis.document;
 globalThis.document={hidden:false,querySelector:()=>null,getElementById:()=>null};
 const online=new Set(people.slice(0,size).map(p=>p.id));
 let state=game.createRoom({player:people[0]}).state;
 for(const member of people.slice(1,size))state=game.onJoin({state,player:member}).state;
 const clients=people.slice(0,size).map(person=>{
  const net=new NetworkManager();
  net.socket.id=person.id;
  net.code='ABCD1234';
  net.connected=true;
  net.startClock=()=>{};
  net.stopClock=()=>{};
  net.net={sendGame(payload){
   if(!online.has(person.id))throw Error('disconnected socket sent a command');
   state=game.onMessage({state,player:person,payload,connectedIds:[...online]}).state;
   deliver();
  }};
  return net;
 });
 function deliver(){
  for(let i=0;i<clients.length;i++)
   if(online.has(people[i].id))clients[i].apply(
    game.viewForPlayer({state,player:people[i]}));
 }
 deliver();
 return {
  clients,online,deliver,
  get state(){return state;},
  leave(index){online.delete(people[index].id);clients[index].connected=false;},
  reconnect(index){
   online.add(people[index].id);clients[index].connected=true;
   deliver();
  },
  pulse(index){
   state=game.onMessage({state,player:people[index],payload:{type:'pulse'},connectedIds:[...online]}).state;
   deliver();
  },
  cleanup(){
   for(const client of clients)client.clearQueuedInputs();
   globalThis.document=savedDocument;
  }
 };
}

test('two independent clients receive their own acknowledgements and no foreign input sequences',()=>{
 const sys=system(2);
 try{
  const [a,b]=sys.clients;
  a.toggleReady();b.toggleReady();
  assert.equal(sys.state.started,true);
  assert.equal(a.started,true);
  assert.equal(b.started,true);
  assert.equal(a.inputBatchVersion,1);
  a.sendPlayerInput({action:'move',direction:1});
  a.sendPlayerInput({action:'rotate'});
  assert.equal(a.pendingInputs.length,2);
  a.flushInputs();
  assert.equal(sys.state.engine.players[0].lastInputSeq,2);
  assert.equal(a.pendingInputs.length,0);
  assert.equal(b.inputSeq,0);
  assert.equal(b.currentRoom.engine.players[0].lastInputSeq,undefined);
  assert.equal(a.currentRoom.engine.players[0].lastInputSeq,2);
  b.sendPlayerInput({action:'hardDrop'});
  assert.equal(sys.state.engine.players[1].lastInputSeq,1);
  assert.equal(b.pendingInputs.length,0);
  assert.equal(a.currentRoom.engine.players[1].lastInputSeq,undefined);
 }finally{sys.cleanup();}
});
test('host disappearance transfers leadership; follower can pause and resume without stale traffic',()=>{
 const sys=system(3);
 try{
  const [a,b,c]=sys.clients;
  a.toggleReady();b.toggleReady();c.toggleReady();
  assert.equal(sys.state.started,true);
  sys.leave(0);
  sys.pulse(1);
  assert.equal(sys.state.hostId,'wire1');
  assert.equal(b.hostId,'wire1');
  b.togglePause();
  assert.equal(sys.state.paused,true);
  assert.equal(b.paused,true);
  assert.equal(c.paused,true);
  b.togglePause();
  assert.equal(sys.state.paused,false);
  assert.equal(sys.state.engine.players[0].offline,true);
  sys.reconnect(0);
  sys.pulse(1);
  assert.equal(sys.state.hostId,'wire1','old host must not steal control after reconnection');
  assert.equal(sys.state.engine.players[0].offline,false);
 }finally{sys.cleanup();}
});
test('rematch with only one connected person returns to lobby; quorum can start again',()=>{
 const sys=system(2);
 try{
  const [a,b]=sys.clients;
  a.toggleReady();b.toggleReady();
  assert.equal(sys.state.started,true);
  sys.leave(0);
  sys.pulse(1);
  assert.equal(sys.state.hostId,'wire1');
  sys.state.engine.isGameOver=true;sys.state.phase='finished';
  sys.deliver();
  assert.equal(b.finished,true);
  b.requestRematch();
  assert.equal(sys.state.started,false);
  assert.equal(sys.state.engine,null);
  assert.equal(b.started,false);
  b.toggleReady();
  assert.equal(sys.state.started,false);
  sys.reconnect(0);
  a.toggleReady();
  assert.equal(sys.state.started,true);
  assert.equal(sys.state.round,2);
  assert.equal(a.started,true);
  assert.equal(b.started,true);
 }finally{sys.cleanup();}
});

test('new PocketNet room revisions only advance and are exposed to every client',()=>{
 const sys=system(2);
 try{
  const [a,b]=sys.clients;
  const initial=sys.state.revision;
  assert.ok(Number.isSafeInteger(initial)&&initial>0);
  a.toggleReady();b.toggleReady();
  assert.ok(sys.state.revision>initial);
  assert.equal(a.lastRevision,sys.state.revision);
  assert.equal(b.lastRevision,sys.state.revision);
  const before=sys.state.revision;
  sys.pulse(0);
  assert.equal(sys.state.revision,before+1);
  assert.equal(game.viewForPlayer({state:sys.state,player:people[0]}).revision,sys.state.revision);
  assert.equal(game.viewForPlayer({state:sys.state,player:people[1]}).revision,sys.state.revision);
 }finally{sys.cleanup();}
});

test('delayed duplicate, pause, finish and old-round snapshots never rewind the client',()=>{
 const sys=system(2);
 try{
  const [a,b]=sys.clients;
  let starts=0,snapshots=0,backToLobby=0;
  a.on('gameStart',()=>starts++);
  a.on('snapshot',()=>snapshots++);
  a.on('backToLobby',()=>backToLobby++);
  a.toggleReady();b.toggleReady();
  assert.equal(a.activeRound,1);
  const first=structuredClone(game.viewForPlayer({state:sys.state,player:people[0]}));
  sys.pulse(0);
  const currentRevision=a.lastRevision;
  const updates=snapshots;
  a.apply(first);a.apply({...first,revision:currentRevision});
  assert.equal(a.lastRevision,currentRevision);
  assert.equal(snapshots,updates,'duplicate and out-of-order snapshots must be ignored');
  assert.equal(starts,1);
  a.togglePause();
  assert.equal(a.paused,true);
  const pausedRevision=a.lastRevision;
  a.apply(first);
  assert.equal(a.paused,true,'older running snapshot cannot resume a paused room');
  assert.equal(a.lastRevision,pausedRevision);
  a.togglePause();
  assert.equal(a.paused,false);
  sys.state.engine.isGameOver=true;sys.state.phase='finished';
  sys.pulse(1);
  assert.equal(a.finished,true);
  const finished=structuredClone(game.viewForPlayer({state:sys.state,player:people[0]}));
  a.requestRematch();
  assert.equal(a.activeRound,2);
  assert.equal(a.finished,false);
  assert.equal(starts,2);
  const freshRevision=a.lastRevision;
  a.apply(finished);a.apply(first);
  assert.equal(a.lastRevision,freshRevision);
  assert.equal(a.activeRound,2);
  assert.equal(a.finished,false);
  assert.equal(starts,2,'old snapshots must not trigger duplicate gameStart');
  assert.equal(backToLobby,0);
 }finally{sys.cleanup();}
});

test('server rejects tagged commands from earlier rounds before evaluating their action sequences',()=>{
 let state=game.createRoom({player:people[0]}).state;
 state=game.onJoin({state,player:people[1]}).state;
 for(const player of people.slice(0,2))
  state=game.onMessage({state,player,payload:{type:'ready'},connectedIds:['wire0','wire1']}).state;
 assert.equal(state.round,1);
 const oldInput={type:'input_batch',round:1,actions:[{seq:1,action:'move',direction:1}]};
 state=game.onMessage({state,player:people[0],payload:oldInput,connectedIds:['wire0','wire1']}).state;
 assert.equal(state.engine.players[0].lastInputSeq,1);
 state.engine.isGameOver=true;state.phase='finished';
 state=game.onMessage({state,player:people[0],payload:{type:'rematch',round:1},
  connectedIds:['wire0','wire1']}).state;
 assert.equal(state.round,2);
 assert.equal(state.engine.players[0].lastInputSeq,0);
 const frozen=structuredClone(state);
 for(const payload of [
  oldInput,
  {type:'pause',round:1},
  {type:'resume',round:1},
  {type:'rematch',round:1},
  {type:'input',round:-7,input:{action:'hardDrop'}}
 ]){
  assert.throws(()=>game.onMessage({state,player:people[0],payload,
   connectedIds:['wire0','wire1']}),/другому раунду/);
  assert.deepEqual(state,frozen,'invalid command must not mutate saved authoritative state');
 }
 state=game.onMessage({state,player:people[0],payload:{type:'input_batch',round:2,
  actions:[{seq:1,action:'rotate'}]},connectedIds:['wire0','wire1']}).state;
 assert.equal(state.engine.players[0].lastInputSeq,1,'current round may reuse sequence 1');
});
