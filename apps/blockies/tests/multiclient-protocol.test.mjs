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
