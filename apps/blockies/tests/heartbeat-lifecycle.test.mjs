import test from 'node:test';
import assert from 'node:assert/strict';
import {NetworkManager} from '../network.js';

function clockHarness(){
 const real={interval:globalThis.setInterval,clear:globalThis.clearInterval,
  performance:globalThis.performance,document:globalThis.document};
 let now=0,tick=null;const sent=[];
 globalThis.setInterval=fn=>{tick=fn;return 123;};
 globalThis.clearInterval=()=>{};
 globalThis.performance={now:()=>now};
 globalThis.document={hidden:false,getElementById:()=>null};
 const manager=new NetworkManager();
 manager.connected=true;manager.started=true;
 manager.socket.id='a';manager.hostId='a';
 manager.lastStateAt=0;
 manager.send=(payload)=>{sent.push({at:now,payload});return true};
 manager.startClock();
 return {manager,sent,at(value){now=value;tick();},close(){
  manager.stopClock();
  globalThis.setInterval=real.interval;
  globalThis.clearInterval=real.clear;
  globalThis.performance=real.performance;
  globalThis.document=real.document;
 }};
}
test('host clock is responsive while playing but slows to 1600 ms during pause',()=>{
 const c=clockHarness();
 try{
  c.at(300);c.at(600);c.at(900);
  assert.equal(c.sent.length,3);
  c.manager.paused=true;
  c.at(1200);c.at(1500);c.at(2400);
  assert.equal(c.sent.length,3,'pause must not retain the high-frequency game clock');
  c.at(2600);
  assert.equal(c.sent.length,4);
  c.manager.paused=false;
  c.at(2900);
  assert.equal(c.sent.length,5,'resuming should restore normal heartbeat');
 }finally{c.close();}
});
test('paused followers do not flood the room while receiving host updates',()=>{
 const c=clockHarness();
 try{
  c.manager.hostId='b';c.manager.paused=true;
  c.manager.lastStateAt=2000;
  c.at(3500);c.at(4100);
  assert.equal(c.sent.length,0);
  c.at(4500);
  assert.equal(c.sent.length,1,'fallback heartbeat when no authoritative update arrives');
  c.manager.lastStateAt=4600;
  c.at(6200);
  assert.equal(c.sent.length,1);
 }finally{c.close();}
});
test('paused state follows snapshots and clears on returning to lobby',()=>{
 const manager=new NetworkManager();
 const actual={document:globalThis.document,performance:globalThis.performance};
 globalThis.document={getElementById:()=>null,querySelector:()=>null};
 globalThis.performance={now:()=>500};
 try{
  manager.socket.id='a';manager.code='ABCD1234';
  const state={started:true,paused:true,round:1,hostId:'a',inputBatchVersion:1,
   rulesVersion:3,players:[{id:'a',name:'A'},{id:'b',name:'B'}],engine:{players:[],board:[]}};
  manager.startClock=()=>{};manager.stopClock=()=>{};
  manager.apply(state);
  assert.equal(manager.paused,true);
  manager.apply({...state,paused:false});
  assert.equal(manager.paused,false);
  manager.apply({...state,started:false,engine:null});
  assert.equal(manager.paused,false);
  manager.resetRoom();
  assert.equal(manager.paused,false);
 }finally{
  globalThis.document=actual.document;
  globalThis.performance=actual.performance;
 }
});
