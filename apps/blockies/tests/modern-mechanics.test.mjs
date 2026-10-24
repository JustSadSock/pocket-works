import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validateSoloSnapshot} from '../solo-save.js';
import {projectOwnPiece} from '../input-prediction.js';
const source=await fs.readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const {default:game}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const a={id:'a',name:'A'},b={id:'b',name:'B'};
function start(){
 let state=game.createRoom({player:a}).state;
 state=game.onJoin({state,player:b}).state;
 for(const player of [a,b])state=game.onMessage({state,player,payload:{type:'ready'},connectedIds:['a','b']}).state;
 return state;
}
function action(state,input,who=a){return game.onMessage({state,player:who,payload:{type:'input_batch',
 actions:[{seq:state.engine.players[who===a?0:1].lastInputSeq+1,...input}]},connectedIds:['a','b']}).state;}
test('every seven consecutive pieces include each tetromino exactly once',()=>{
 let state=start(),types=[];
 for(let i=0;i<21;i++){
  const player=state.engine.players[0];
  types.push(player.currentType);
  state.engine.board=state.engine.board.map(row=>row.map(()=>0));
  // Keep the second player from blocking the test seat.
  state.engine.players[1].gameOver=true;
  state.engine.players[1].currentPiece=null;
  state=action(state,{action:'hardDrop'});
  assert.equal(state.engine.isGameOver,false,'the shared round must remain active');
 }
 for(let i=0;i<3;i++)assert.deepEqual([...new Set(types.slice(i*7,(i+1)*7))].sort(),
  ['I','J','L','O','S','T','Z'],'repeated shape appeared before the bag was exhausted');
});
test('Hold is limited to once per placed figure, and swapping does not consume the queue',()=>{
 let state=start(),p=state.engine.players[0],first=p.currentType,upcoming=p.nextType;
 state=action(state,{action:'hold'});p=state.engine.players[0];
 assert.equal(p.holdType,first);
 assert.equal(p.currentType,upcoming);
 assert.equal(p.holdUsed,true);
 const bag=p.bag.slice(),next=p.nextType;
 state=action(state,{action:'hold'});p=state.engine.players[0];
 assert.equal(p.currentType,upcoming,'double Hold must not swap');
 assert.deepEqual(p.bag,bag);
 state=action(state,{action:'hardDrop'});
 state.engine.board=state.engine.board.map(row=>row.map(()=>0));
 state=action(state,{action:'hold'});p=state.engine.players[0];
 assert.equal(p.currentType,first,'saved piece can return after a placement');
 assert.equal(p.holdType,next===first?first:p.holdType,'hold slot stays valid');
 assert.equal(p.nextType,state.engine.players[0].nextType);
});
test('a landed piece gets 450 ms of adjustment time before becoming locked',()=>{
 let state=start(),p=state.engine.players[0];
 state.engine.board=state.engine.board.map(row=>row.map(()=>0));
 p.currentPiece=[[1,1],[1,1]];p.currentType='O';p.position={x:p.spawnLaneX,y:18};
 p.lockCounter=0;p.lockResets=0;p.dropCounter=0;p.dropInterval=1000;
 state.lastTick=Date.now()-200;
 state=game.onMessage({state,player:b,payload:{type:'pulse'},connectedIds:['a','b']}).state;
 p=state.engine.players[0];
 assert.ok(p.lockCounter>=150&&p.lockCounter<450);
 assert.equal(state.engine.board.flat().some(Boolean),false,'touching floor is not instant merge');
 state.lastTick=Date.now()-320;
 state=game.onMessage({state,player:b,payload:{type:'pulse'},connectedIds:['a','b']}).state;
 assert.ok(state.engine.board.flat().some(Boolean),'piece locks after grace period');
});
test('grounded move resets the lock countdown and caps resets to eight',()=>{
 let state=start(),p=state.engine.players[0];
 state.engine.board=state.engine.board.map(row=>row.map(()=>0));
 p.currentPiece=[[1,1],[1,1]];p.currentType='O';p.position={x:p.spawnLaneX,y:18};
 p.lockCounter=250;
 state=action(state,{action:'move',direction:1});
 p=state.engine.players[0];assert.equal(p.lockCounter,0);assert.equal(p.lockResets,1);
 p.lockCounter=200;p.lockResets=8;
 state=action(state,{action:'move',direction:-1});
 assert.equal(state.engine.players[0].lockCounter,200,'reset limit prevents infinite stalling');
});
test('rotation kicks away from an obstructing well wall and prediction agrees',()=>{
 let state=start(),p=state.engine.players[0];
 state.engine.board=state.engine.board.map(row=>row.map(()=>0));
 state.engine.players[1].gameOver=true;state.engine.players[1].currentPiece=null;
 p.currentPiece=[[1],[1],[1],[1]];p.currentType='I';p.position={x:state.engine.boardWidth-1,y:8};
 const projected=projectOwnPiece(p,state.engine.board,state.engine.players,[{action:'rotate',seq:1}]);
 state=action(state,{action:'rotate'});
 assert.equal(state.engine.players[0].position.x,state.engine.boardWidth-2);
 assert.deepEqual(projected.position,state.engine.players[0].position);
 assert.deepEqual(projected.currentPiece,state.engine.players[0].currentPiece);
});
test('new solo snapshots retain bag, hold and lock state, but old saves remain valid',()=>{
 const base={version:2,updatedAt:Date.now(),randomSeed:7,rngState:9,
  board:Array.from({length:20},()=>Array(10).fill(0)),
  sharedStats:{score:100,lines:1,level:1,comboChain:0,lastClearDetail:null},
  player:{currentPiece:[[1,1],[1,1]],nextPiece:[[1,1,1,1]],position:{x:4,y:2},
   dropCounter:110,dropInterval:900,spawnAnchor:5,color:'#ff1493',
   bag:['S','Z','J','L'],currentType:'O',nextType:'I',holdType:'T',
   holdUsed:true,lockCounter:250,lockResets:3}};
 const modern=validateSoloSnapshot(base);
 assert.ok(modern);assert.deepEqual(modern.player.bag,['S','Z','J','L']);
 assert.equal(modern.player.holdType,'T');
 assert.equal(validateSoloSnapshot({...base,player:{...base.player,bag:['O','O']}}),null);
 const previous=structuredClone(base);previous.version=1;
 for(const field of ['bag','currentType','nextType','holdType','holdUsed','lockCounter','lockResets'])
  delete previous.player[field];
 assert.equal(validateSoloSnapshot(previous)?.version,1);
});
