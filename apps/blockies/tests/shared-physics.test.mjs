import test from 'node:test';
import assert from 'node:assert/strict';
import {
 SHAPES,PIECE_TYPES,LOCK_DELAY_MS,MAX_LOCK_RESETS,SAFE_LANE_ROWS,KICK_OFFSETS,
 checkPieceCollision,findRotationPlacement,isLaneClear,otherPieceOccupies,
 inferShapeType,rotatedClockwise
} from '../physics-core.js';
import {projectOwnPiece} from '../input-prediction.js';
import {readFile} from 'node:fs/promises';

const serverSource=await readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const {default:game}=await import('data:text/javascript;base64,'+Buffer.from(serverSource).toString('base64'));
function start(size){
 const people=Array.from({length:size},(_,i)=>({id:'p'+i,name:'P'+i}));
 let state=game.createRoom({player:people[0]}).state;
 for(const person of people.slice(1))state=game.onJoin({state,player:person}).state;
 for(const person of people)state=game.onMessage({state,player:person,payload:{type:'ready'},connectedIds:people.map(x=>x.id)}).state;
 return {state,people};
}
test('canonical shapes have precisely seven types and an invertible rotation',()=>{
 assert.deepEqual(PIECE_TYPES,['I','O','T','S','Z','J','L']);
 for(const [name,piece] of Object.entries(SHAPES)){
  assert.equal(inferShapeType(piece),name);
  let copy=piece;
  for(let i=0;i<4;i++)copy=rotatedClockwise(copy);
  assert.deepEqual(copy,piece);
 }
 assert.equal(LOCK_DELAY_MS,450);
 assert.equal(MAX_LOCK_RESETS,8);
 assert.equal(SAFE_LANE_ROWS,5);
 assert.equal(KICK_OFFSETS.length,10);
});
test('canonical collision preserves locked versus other active piece semantics',()=>{
 const {state}=start(3),{board,players}=state.engine;
 const p=players[0],width=board[0].length;
 const shape=[[1,1],[1,1]];
 assert.deepEqual(checkPieceCollision(shape,{x:-1,y:5},board,players,0),
  {collides:true,withLocked:true,withActive:false});
 assert.equal(checkPieceCollision(shape,{x:width-1,y:5},board,players,0).withLocked,true);
 board[5][0]=1;
 assert.equal(checkPieceCollision(shape,{x:0,y:5},board,players,0).withLocked,true);
 board[5][0]=0;
 const other=players[1];other.currentPiece=[[1,1]];other.position={x:1,y:5};other.gameOver=false;
 assert.equal(otherPieceOccupies(1,5,players,0),true);
 assert.deepEqual(checkPieceCollision(shape,{x:0,y:5},board,players,0),
  {collides:true,withLocked:false,withActive:true});
 other.offline=true;
 assert.equal(checkPieceCollision(shape,{x:0,y:5},board,players,0).collides,false);
});
test('rotation kick is identical for server and optimistic rendering at the far wall',()=>{
 for(const n of [2,3,4]){
  const {state}=start(n),board=state.engine.board,players=state.engine.players,me=players[0];
  players.slice(1).forEach(p=>{p.currentPiece=null;p.gameOver=true;});
  me.currentPiece=[[1],[1],[1],[1]];me.position={x:board[0].length-1,y:9};
  const authoritative=findRotationPlacement(me.currentPiece,me.position,board,players,0);
  const visual=projectOwnPiece(me,board,players,[{seq:1,action:'rotate'}]);
  assert.deepEqual(visual.currentPiece,authoritative.currentPiece);
  assert.deepEqual(visual.position,authoritative.position);
  assert.equal(visual.position.x,board[0].length-4);
 }
});
test('five-row gate stays safe until a locked or active obstacle encroaches',()=>{
 const {state}=start(2),board=state.engine.board,players=state.engine.players;
 const x=players[0].spawnLaneX;
 assert.equal(isLaneClear(x,board,players,0,2),true);
 board[4][x+1]=2;
 assert.equal(isLaneClear(x,board,players,0,2),false);
 board[4][x+1]=0;
 players[1].currentPiece=[[1]];players[1].position={x:x+1,y:4};players[1].gameOver=false;
 assert.equal(isLaneClear(x,board,players,0,2),false);
 players[1].offline=true;
 assert.equal(isLaneClear(x,board,players,0,2),true);
 assert.equal(isLaneClear(x,board,players,0,1),true);
});
