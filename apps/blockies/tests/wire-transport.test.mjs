import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {NetworkManager} from '../network.js';

// Exercise the production PocketNet client and Blockies NetworkManager across
// actual serialized WebSocket messages, rather than calling NetworkManager.apply
// or the game rules directly. Transport is simulated; no remote server required.
const source=await readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const {default:game}=await import('data:text/javascript;base64,'+
  Buffer.from(source).toString('base64'));
const ROOM='abcdef12-aaaa-bbbb-cccc-000000000001';
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function wireHarness(){
 const original={fetch:globalThis.fetch,WebSocket:globalThis.WebSocket,
  document:globalThis.document,location:globalThis.location,
  sessionStorage:globalThis.sessionStorage};
 const storage=new Map(),tokens=new Map(),sockets=new Set();
 const participants=[],commands=[];let serial=0,room=null;
 globalThis.document={
  hidden:false,
  querySelector:()=>null,
  getElementById:()=>null
 };
 globalThis.location={origin:'http://localhost'};
 globalThis.sessionStorage={
  getItem:key=>storage.get(key)??null,
  setItem:(key,value)=>storage.set(key,value),
  removeItem:key=>storage.delete(key),
  clear:()=>storage.clear()
 };
 globalThis.fetch=async url=>{
  assert.match(String(url),/\/pocketnet\/session$/);
  const token='token-'+(++serial),player={id:'wire-'+serial,name:'Wire '+serial};
  tokens.set(token,player);participants.push(player);
  return {ok:true,json:async()=>({token})};
 };
 const present=()=>[...sockets].filter(s=>s.readyState===1&&s.roomId===ROOM)
  .map(s=>s.player.id);
 function send(socket,type,fields={}){
  queueMicrotask(()=>{
   if(socket.readyState!==1)return;
   socket.onmessage?.({data:JSON.stringify({wireVersion:1,type,...fields})});
  });
 }
 function broadcast(){
  if(!room)return;
  for(const socket of sockets){
   if(socket.readyState!==1||socket.roomId!==ROOM)continue;
   send(socket,'game_event',{roomId:ROOM,event:{
    type:'state',payload:game.viewForPlayer({state:room,player:socket.player})
   }});
  }
 }
 class WireSocket{
  static OPEN=1;
  constructor(url){
   assert.equal(url,'ws://localhost/pocketnet/ws');
   this.readyState=0;this.player=null;this.roomId=null;
   sockets.add(this);
   queueMicrotask(()=>{if(this.readyState===0){
    this.readyState=1;this.onopen?.();
   }});
  }
  send(raw){
   assert.equal(this.readyState,1);
   const packet=JSON.parse(raw);
   assert.equal(packet.wireVersion,1);
   switch(packet.type){
    case 'auth':
     this.player=tokens.get(packet.token);
     assert.ok(this.player,'valid session token expected');
     send(this,'authenticated',{player:this.player});
     return;
    case 'create_room':
     assert.equal(packet.gameId,'blockies');
     assert.equal(room,null);
     room=game.createRoom({player:this.player}).state;
     this.roomId=ROOM;
     send(this,'room_joined',{roomId:ROOM,gameId:'blockies',version:'v14',
      state:game.viewForPlayer({state:room,player:this.player})});
     return;
    case 'join_room':
     assert.equal(packet.roomId,ROOM);
     room=game.onJoin({state:room,player:this.player}).state;
     this.roomId=ROOM;
     send(this,'room_joined',{roomId:ROOM,gameId:'blockies',version:'v14',
      state:game.viewForPlayer({state:room,player:this.player})});
     broadcast();
     return;
    case 'game_message':
     commands.push({playerId:this.player?.id,...packet.payload});
     try{
      room=game.onMessage({state:room,player:this.player,payload:packet.payload,
       connectedIds:present()}).state;
      broadcast();
     }catch(error){
      send(this,'error',{code:'invalid_action',message:error.message});
     }
     return;
    case 'leave_room':
     if(this.roomId===ROOM){
      room=game.onLeave({state:room,player:this.player}).state;
      this.roomId=null;broadcast();
     }
     return;
    default:throw Error('Unexpected wire type: '+packet.type);
   }
  }
  close(){
   if(this.readyState===3)return;
   this.readyState=3;
   sockets.delete(this);
   this.onclose?.();
  }
 }
 globalThis.WebSocket=WireSocket;
 return {
  get room(){return room;},
  get sockets(){return sockets;},
  get commands(){return commands;},
  storage,
  restore(){
   for(const socket of [...sockets])socket.close();
   Object.assign(globalThis,original);
  }
 };
}

test('PocketNet wire: independently authenticated clients play, pause, ACK, leave and safely rejoin',async()=>{
 const wire=wireHarness();
 const a=new NetworkManager(),b=new NetworkManager();
 for(const client of [a,b]){
  // The test drives pulses explicitly instead of opening wall-clock intervals.
  client.startClock=()=>{};client.stopClock=()=>{};
 }
 try{
  await a.createRoom();await settle();
  assert.equal(a.roomId,ROOM);
  assert.equal(a.socket.id,'wire-1');
  // Separate browser tabs have independent session storage.
  wire.storage.clear();
  await b.joinRoom(ROOM);await settle();
  assert.equal(b.socket.id,'wire-2');
  assert.equal(wire.room.players.length,2);
  a.toggleReady();await settle();
  b.toggleReady();await settle();
  assert.equal(wire.room.started,true);
  assert.equal(a.started,true);
  assert.equal(b.started,true);

  assert.equal(a.sendPlayerInput({action:'move',direction:1}),true);
  a.flushInputs();await settle();
  assert.equal(wire.room.engine.players[0].lastInputSeq,1);
  assert.equal(a.pendingInputs.length,0);
  assert.equal(wire.commands.find(p=>p.type==='input_batch').round,1,
   'real WebSocket payload must bind the action to round one');
  assert.equal(a.currentRoom.engine.players[0].lastInputSeq,1);
  assert.equal(b.currentRoom.engine.players[0].lastInputSeq,undefined,
   'foreign ACK must not cross the wire');

  a.togglePause();await settle();
  assert.equal(wire.room.paused,true);
  assert.equal(wire.commands.find(p=>p.type==='pause').round,1);
  assert.equal(a.paused,true);
  assert.equal(b.paused,true);
  assert.equal(a.sendPlayerInput({action:'rotate'}),false,
   'paused clients must not enqueue a command the server rejects');
  assert.equal(a.inputQueue.length,0);
  const pausedRevision=a.lastRevision;
  a.net.socket.onmessage({data:JSON.stringify({type:'game_event',roomId:ROOM,
   event:{type:'state',payload:{...a.currentRoom,paused:false,revision:pausedRevision-1}}})});
  assert.equal(a.paused,true,'delayed JSON socket frame cannot roll back pause');
  a.togglePause();await settle();
  assert.equal(a.paused,false);
  assert.equal(a.sendPlayerInput({action:'rotate'}),true,
   'the same session must resume accepting new input');
  a.flushInputs();await settle();
  assert.equal(wire.room.engine.players[0].lastInputSeq,2);
  assert.equal(a.pendingInputs.length,0,'resume ACK reconciles the new command');

  const originalPiece=wire.room.engine.players[0].currentType;
  a.leaveRoom();await settle();
  assert.equal(wire.room.players[0].left,true);
  assert.equal(wire.room.engine.players[0].reentryType,originalPiece);
  assert.equal(b.hostId,'wire-2');
  await a.joinRoom(ROOM);await settle();
  assert.equal(wire.room.players.length,2);
  assert.equal(a.hostId,'wire-2','returning host must not steal leadership');
  assert.equal(wire.room.engine.players[0].blocked,true);
  assert.equal(wire.room.engine.players[0].currentPiece,null);
  b.send({type:'pulse'});await settle();
  assert.equal(a.currentRoom.engine.players[0].canResume,true);
  assert.equal(a.requestLaneResume(),true);
  await settle();
  assert.equal(wire.room.engine.players[0].currentType,originalPiece);
  assert.equal(wire.room.engine.players[0].blocked,false);
 }finally{
  a.disconnect();b.disconnect();wire.restore();
 }
});
