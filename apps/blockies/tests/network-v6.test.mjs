import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {NetworkManager} from '../network.js';
import {projectOwnPiece} from '../input-prediction.js';

const source=await fs.readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const {default:game}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const a={id:'a',name:'A'},b={id:'b',name:'B'};
function start(){
 let state=game.createRoom({player:a}).state;
 state=game.onJoin({state,player:b}).state;
 state=game.onMessage({state,player:a,payload:{type:'ready'},connectedIds:['a','b']}).state;
 return game.onMessage({state,player:b,payload:{type:'ready'},connectedIds:['a','b']}).state;
}
function command(state,player,payload){
 return game.onMessage({state,player,payload,connectedIds:['a','b']}).state;
}
test('v6 preserves monotonic input acknowledgement and ignores duplicate/replayed commands',()=>{
 let state=start();
 assert.equal(state.inputBatchVersion,1);
 const startX=state.engine.players[0].position.x;
 state=command(state,a,{type:'input_batch',actions:[
  {seq:1,action:'move',direction:-1},{seq:2,action:'move',direction:-1}
 ]});
 assert.equal(state.engine.players[0].position.x,startX-2);
 assert.equal(state.engine.players[0].lastInputSeq,2);
 state=command(state,a,{type:'input_batch',actions:[{seq:1,action:'move',direction:1}]});
 assert.equal(state.engine.players[0].position.x,startX-2);
 state=command(state,a,{type:'input_batch',actions:[{seq:7,action:'move',direction:1}]});
 assert.equal(state.engine.players[0].lastInputSeq,7,'lost batches may leave harmless sequence gaps');
 assert.equal(state.engine.players[0].position.x,startX-1);
 assert.equal(state.engine.players[1].lastInputSeq,0,'foreign input is not attributed to the other seat');
});
test('server rejects malformed, excessively large and rate-bypassing batches',()=>{
 let state=start();
 const send=actions=>command(state,a,{type:'input_batch',actions});
 assert.throws(()=>send([{seq:1,action:'move',direction:99}]),/Некорректный/);
 assert.throws(()=>send([{seq:1,action:'deleteEverything'}]),/Некорректный/);
 assert.throws(()=>send(Array.from({length:13},(_,i)=>({seq:i+1,action:'rotate'}))),/пакет/);
 assert.throws(()=>send([{seq:3,action:'rotate'},{seq:2,action:'rotate'}]),/порядковый/);
 for(let n=0;n<4;n++)state=command(state,a,{type:'input_batch',actions:Array.from({length:12},(_,i)=>({seq:n*12+i+1,action:'rotate'}))});
 assert.throws(()=>command(state,a,{type:'input_batch',actions:[{seq:49,action:'rotate'}]}),/частые/);
});
test('server time uses short bounded catch-up but freezes when room was completely idle',()=>{
 let state=start();
 state.engine.players[0].dropCounter=0;
 state.lastTick=Date.now()-600;
 state=command(state,b,{type:'pulse'});
 assert.ok(state.engine.players[0].dropCounter>=500,'short delay advances gravity');
 state.engine.players[0].dropCounter=0;
 const y=state.engine.players[0].position.y;
 state.lastTick=Date.now()-6000;
 state=command(state,b,{type:'pulse'});
 assert.equal(state.engine.players[0].position.y,y,'long interruption never fast-forwards');
 assert.equal(state.engine.players[0].dropCounter,0);
});
test('input prediction does not mutate authoritative snapshots and respects locked obstacles',()=>{
 const board=Array.from({length:20},()=>Array(10).fill(0));
 const player={id:0,position:{x:4,y:0},currentPiece:[[1,1],[1,1]],gameOver:false};
 const before=structuredClone(player);
 const predicted=projectOwnPiece(player,board,[player],[
  {seq:1,action:'move',direction:-1},{seq:2,action:'rotate'}
 ]);
 assert.equal(predicted.position.x,3);
 assert.deepEqual(player,before);
 board[0][3]=1;
 const blocked=projectOwnPiece(player,board,[player],[{seq:3,action:'move',direction:-1}]);
 assert.equal(blocked.position.x,4,'obstacle prevents optimistic movement');
 const floor=projectOwnPiece(player,board,[player],[{seq:4,action:'hardDrop'}]);
 assert.equal(floor.position.y,18);
 assert.equal(floor.landed,true);
});
test('client coalesces a rapid gesture and prunes predictions only after server acknowledgement',()=>{
 const net=new NetworkManager(),packets=[];
 net.connected=true;net.started=true;net.inputBatchVersion=1;
 net.socket.id='a';net.net={sendGame:p=>packets.push(p)};
 net.sendPlayerInput({action:'move',direction:1});
 net.sendPlayerInput({action:'move',direction:1});
 net.flushInputs();
 assert.equal(packets.length,1);
 assert.equal(packets[0].type,'input_batch');
 assert.deepEqual(packets[0].actions.map(v=>v.seq),[1,2]);
 assert.equal(net.pendingInputs.length,2);
 net.startClock=()=>{};
 const originalDocument=globalThis.document;
 globalThis.document={querySelector:()=>null};
 try{
  const state={...start(),inputBatchVersion:1};
  state.engine.players[0].lastInputSeq=2;
  net.apply(state,true);
  assert.equal(net.pendingInputs.length,0);
  net.sendPlayerInput({action:'rotate'});
  assert.equal(net.pendingInputs[0].seq,3);
  net.resetRoom();
  assert.equal(net.pendingInputs.length,0);
 }finally{globalThis.document=originalDocument;net.stopClock();}
});
