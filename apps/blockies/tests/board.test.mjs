import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {default:game}=await import('data:text/javascript;base64,'+Buffer.from(await fs.readFile(new URL('../server/module.ts',import.meta.url),'utf8')).toString('base64'));
const a={id:'a',name:'A'},b={id:'b',name:'B'};
function start(players=[a]){let state=game.createRoom({player:players[0]}).state;for(const player of players.slice(1))state=game.onJoin({state,player}).state;for(const player of players)state=game.onMessage({state,player,payload:{type:'ready'}}).state;return state;}
test('serialized shared board clears a complete line and awards team score',()=>{let state=start();const width=state.engine.boardWidth;state.engine.board=Array.from({length:20},()=>Array(width).fill(0));state.engine.board[19]=Array.from({length:width},(_,i)=>i<4?0:1);const p=state.engine.players[0];p.currentPiece=[[1,1,1,1]];p.position={x:0,y:0};state=game.onMessage({state:JSON.parse(JSON.stringify(state)),player:a,payload:{type:'input',input:{action:'hardDrop'}}}).state;assert.equal(state.engine.sharedStats.lines,1);assert.ok(state.engine.sharedStats.score>0);assert.ok(state.engine.board.every(row=>row.every(v=>v===0)));});
test('two players share locked cells; foreign input cannot mutate the well',()=>{let state=start([a,b]);state=game.onMessage({state,player:a,payload:{type:'input',input:{action:'hardDrop'}}}).state;assert.equal(state.engine.board.flat().filter(Boolean).length,4);assert.throws(()=>game.onMessage({state,player:{id:'intruder'},payload:{type:'input',input:{action:'hardDrop'}}}));assert.deepEqual(game.onJoin({state,player:b}).state.engine,state.engine);});
test('blocked spawn reaches game over rather than continuing to accept pieces',()=>{let state=start();state.engine.board=state.engine.board.map((row,y)=>row.map((_,x)=>y<4&&x<row.length-1?1:0));state=game.onMessage({state,player:a,payload:{type:'input',input:{action:'hardDrop'}}}).state;assert.equal(state.engine.isGameOver,true);});



test('leaving during a match preserves board, score and surviving players',()=>{
 let state=start([a,b]);
 state=game.onMessage({state,player:a,payload:{type:'input',input:{action:'hardDrop'}}}).state;
 const board=structuredClone(state.engine.board),score=state.engine.sharedStats.score;
 state=game.onLeave({state,player:a}).state;
 assert.equal(state.started,true);
 assert.equal(state.hostId,'b');
 assert.deepEqual(state.engine.board,board);
 assert.equal(state.engine.sharedStats.score,score);
 assert.equal(state.players[0].left,true);
 assert.equal(state.engine.players[0].gameOver,true);
 assert.equal(state.engine.players[0].currentPiece,null);
 assert.equal(state.players[1].left,false);
 assert.doesNotThrow(()=>game.onMessage({state,player:b,payload:{type:'input',input:{action:'move',direction:1}}}));
 assert.throws(()=>game.onMessage({state,player:a,payload:{type:'input',input:{action:'hardDrop'}}}),/Игрок не в комнате/);
});
test('pause is host-only, protects state and resumes without a time jump',()=>{
 let state=start([a,b]);
 assert.throws(()=>game.onMessage({state,player:b,payload:{type:'pause'}}),/ведущему/);
 state=game.onMessage({state,player:a,payload:{type:'pause'}}).state;
 assert.equal(state.paused,true);
 const engine=structuredClone(state.engine);
 state.lastTick=Date.now()-9000;
 state=game.onMessage({state,player:b,payload:{type:'pulse'}}).state;
 assert.deepEqual(state.engine,engine);
 assert.throws(()=>game.onMessage({state,player:b,payload:{type:'input',input:{action:'hardDrop'}}}),/приостановлена/);
 state=game.onMessage({state,player:a,payload:{type:'pause'}}).state;
 assert.equal(state.paused,false);
 assert.ok(Date.now()-state.lastTick<1000);
});
test('only host can rematch a finished round; new round removes departed players',()=>{
 let state=start([a,b]);
 state=game.onLeave({state,player:a}).state;
 state.engine.isGameOver=true;
 state.phase='finished';
 assert.throws(()=>game.onMessage({state,player:a,payload:{type:'rematch'}}),/не в комнате/);
 const oldRound=state.round;
 state=game.onMessage({state,player:b,payload:{type:'rematch'}}).state;
 assert.equal(state.round,oldRound+1);
 assert.equal(state.started,true);
 assert.equal(state.players.length,1);
 assert.equal(state.players[0].id,'b');
 assert.equal(state.engine.players.length,1);
 assert.equal(state.engine.isGameOver,false);
 assert.equal(state.phase,'playing');
});
test('reconnect preserves the room and cannot introduce a fifth player',()=>{
 let state=start([a,b]);
 const oldRound=state.round;
 state=game.onJoin({state,player:a}).state;
 assert.equal(state.round,oldRound);
 assert.equal(state.players.length,2);
 assert.throws(()=>game.onJoin({state,player:{id:'c',name:'C'}}),/уже началась/);
});


import {saveSolo,loadSolo,clearSolo,validateSoloSnapshot,SOLO_KEY} from '../solo-save.js';
function checkpoint(){
 return {version:1,updatedAt:Date.now(),randomSeed:0x12345678,rngState:0x97654321,
  board:Array.from({length:20},()=>Array(10).fill(0)),
  sharedStats:{score:450,lines:2,level:1,comboChain:0,lastClearDetail:null},
  player:{currentPiece:[[0,1,0],[1,1,1]],nextPiece:[[1,1],[1,1]],
   position:{x:4,y:5},dropCounter:320,dropInterval:910,spawnAnchor:5,color:'#00D9FF'}};
}
function memoryStorage(){
 const map=new Map();
 return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),
  removeItem:k=>map.delete(k)};
}
test('a checkpoint preserves exact board, piece positions, color and RNG sequence',()=>{
 const storage=memoryStorage(),input=checkpoint();
 input.board[18][3]=1;
 assert.equal(saveSolo(input,storage),true);
 const loaded=loadSolo(storage);
 assert.deepEqual(loaded.board,input.board);
 assert.deepEqual(loaded.player.currentPiece,input.player.currentPiece);
 assert.deepEqual(loaded.player.nextPiece,input.player.nextPiece);
 assert.deepEqual(loaded.player.position,input.player.position);
 assert.equal(loaded.player.color,'#00D9FF');
 assert.equal(loaded.rngState,input.rngState);
 input.board[18][3]=0;
 assert.equal(loaded.board[18][3],1,'saved data is copied independently');
 clearSolo(storage);
 assert.equal(loadSolo(storage),null);
});
test('corrupt, stale and incompatible checkpoints cannot overwrite the playfield',()=>{
 const storage=memoryStorage();
 const invalid=[{...checkpoint(),board:[[1]]},
   {...checkpoint(),updatedAt:Date.now()-31*24*3600*1000},
   {...checkpoint(),rngState:'bad'},
   {...checkpoint(),player:{...checkpoint().player,position:{x:9,y:19}}},
   {...checkpoint(),board:Array.from({length:20},()=>Array(10).fill(5))}];
 for(const item of invalid){
  assert.equal(validateSoloSnapshot(item),null);
  storage.setItem(SOLO_KEY,JSON.stringify(item));
  assert.equal(loadSolo(storage),null);
  assert.equal(storage.getItem(SOLO_KEY),null);
 }
 storage.setItem(SOLO_KEY,'{');
 assert.equal(loadSolo(storage),null);
});
test('checkpoint gracefully handles storage failures and discards arbitrary fields',()=>{
 const data=checkpoint(),storage={
  getItem(){throw Error('Access denied');},
  setItem(){throw Error('Quota exceeded');},
  removeItem(){throw Error('Access denied');}
 };
 assert.equal(saveSolo(data,storage),false);
 assert.equal(loadSolo(storage),null);
 const valid=validateSoloSnapshot({...data,unexpected:{secret:'ignored'}});
 assert.ok(valid);
 assert.equal(Object.hasOwn(valid,'unexpected'),false);
});


import {NetworkManager} from '../network.js';
test('network round snapshots initialize once and subsequent snapshots refresh the field',()=>{
 const originalDocument=globalThis.document;
 globalThis.document={querySelector:()=>null};
 const net=new NetworkManager();
 net.connected=true;
 net.socket.id='a';
 net.code='TESTCODE';
 let starts=0,snapshots=0,health=0;
 net.on('gameStart',()=>starts++);
 net.on('snapshot',()=>snapshots++);
 net.on('connectionHealth',({status})=>{if(status==='online')health++;});
 const state={started:true,round:1,seed:123,hostId:'a',players:[{id:'a',color:'#FF1493'}],
  paused:false,engine:{isGameOver:false,board:[],players:[]}};
 try {
  net.apply(state,true);
  net.apply(state);
  assert.equal(starts,1);
  assert.equal(snapshots,2);
  assert.ok(net.timer);
  net.stale=true;
  net.apply(state);
  assert.equal(health,1);
  assert.equal(net.stale,false);
  net.apply({...state,round:2});
  assert.equal(starts,2);
  net.apply({...state,round:2,engine:{isGameOver:true}});
  assert.equal(net.timer,null,'game-over should not waste PocketNet pulses');
 }finally{
  net.stopClock();
  globalThis.document=originalDocument;
 }
});
test('network distinguishes disconnection and blocks stale player inputs',()=>{
 const net=new NetworkManager();
 const outgoing=[];
 net.started=true;
 net.connected=true;
 net.net={sendGame:payload=>outgoing.push(payload)};
 net.sendPlayerInput({action:'rotate'});
 net.stale=true;
 net.sendPlayerInput({action:'hardDrop'});
 net.connected=false;
 net.stale=false;
 net.sendPlayerInput({action:'move',direction:1});
 assert.equal(outgoing.length,1);
 assert.deepEqual(outgoing[0],{type:'input',input:{action:'rotate'}});
});
