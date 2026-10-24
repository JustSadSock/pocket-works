import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SHAPES,planPieceSpawn,canPlayerResume,areAllSeatsEliminated} from '../physics-core.js';
const source=await readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const {default:game}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

function match(n){
 const users=Array.from({length:n},(_,i)=>({id:'player'+i,name:'P'+i}));
 let state=game.createRoom({player:users[0]}).state;
 for(const user of users.slice(1))state=game.onJoin({state,player:user}).state;
 for(const user of users)state=game.onMessage({state,player:user,
  payload:{type:'ready'},connectedIds:users.map(u=>u.id)}).state;
 return {state,users,online:users.map(u=>u.id)};
}

test('every tetromino spawns inside its four-column entrance on 2–4-player boards',()=>{
 for(const n of [2,3,4]){
  const {state}=match(n),{board,players,boardWidth}=state.engine;
  for(const seat of players)for(const [type,shape] of Object.entries(SHAPES)){
   const result=planPieceSpawn(seat,type,board,players,n,boardWidth);
   assert.equal(result.allowed,true,`n=${n} seat=${seat.id} type=${type}`);
   assert.equal(result.position.y,0);
   assert.equal(result.position.x,seat.spawnLaneX+Math.floor((4-shape[0].length)/2));
  }
 }
});

test('solo spawn scans alternate positions when centre is blocked',()=>{
 const board=Array.from({length:20},()=>Array(10).fill(0));
 const seat={id:0,spawnAnchor:5};
 board[0][4]=1;
 const planned=planPieceSpawn(seat,'O',board,[seat],1,10);
 assert.equal(planned.allowed,true);
 assert.notEqual(planned.position.x,4);
 assert.equal(planned.position.y,0);
 board[0].fill(1);
 assert.equal(planPieceSpawn(seat,'O',board,[seat],1,10).allowed,false);
});

test('a blocked co-op entrance does not consume the next shape or unspent Hold',()=>{
 const {state:initial,users,online}=match(2),state=initial,seat=state.engine.players[0],x=seat.spawnLaneX;
 const before={bag:structuredClone(seat.bag),next:seat.nextType,held:seat.holdType};
 // A locked tile four rows below the top makes the lane unsafe.
 state.engine.board[4][x]=2;
 seat.currentPiece=[[1,1,1,1]];seat.currentType='I';seat.position={x,y:0};
 const after=game.onMessage({state,player:users[0],payload:{type:'input_batch',
  actions:[{seq:1,action:'hardDrop'}]},connectedIds:online}).state;
 const p=after.engine.players[0];
 assert.equal(p.blocked,true);
 assert.equal(p.gameOver,true);
 assert.equal(p.currentPiece,null);
 assert.equal(p.nextType,before.next);
 assert.equal(p.holdType,before.held);
 assert.deepEqual(p.bag,before.bag);
 assert.equal(p.canResume,false);
});

test('return condition requires clear rows, an active room and a connected seat',()=>{
 const {state}=match(2),{board,players}=state.engine,p=players[0],x=p.spawnLaneX;
 p.blocked=true;p.gameOver=true;p.currentPiece=null;
 assert.equal(canPlayerResume(p,board,players,2),true);
 board[4][x+2]=1;
 assert.equal(canPlayerResume(p,board,players,2),false);
 board[4][x+2]=0;
 assert.equal(canPlayerResume({...p,offline:true},board,players,2),false);
 assert.equal(canPlayerResume(p,board,players,2,true),false);
 assert.equal(areAllSeatsEliminated([]),false);
 assert.equal(areAllSeatsEliminated(players),false);
 players[1].gameOver=true;
 assert.equal(areAllSeatsEliminated(players),true);
});

test('safe server resume restores blocked seats without spending team score',()=>{
 const {state:initial,users,online}=match(3),state=initial,p=state.engine.players[0],x=p.spawnLaneX;
 p.blocked=true;p.gameOver=true;p.currentPiece=null;
 const score=state.engine.sharedStats.score,queue=p.nextType,bag=structuredClone(p.bag);
 const after=game.onMessage({state,player:users[0],payload:{type:'resume'},connectedIds:online}).state;
 const revived=after.engine.players[0];
 assert.equal(revived.blocked,false);
 assert.equal(revived.gameOver,false);
 assert.equal(revived.currentType,queue);
 assert.deepEqual(revived.bag,bag.slice(0,-1));
 assert.equal(after.engine.sharedStats.score,score);
 assert.equal(revived.position.x,x+Math.floor((4-SHAPES[queue][0].length)/2));
});

test('server and browser both delegate spawn, resume, and elimination to canonical core',async()=>{
 const client=await readFile(new URL('../game.js',import.meta.url),'utf8');
 for(const rule of ['planPieceSpawn','canPlayerResume','areAllSeatsEliminated']){
  assert.match(client,new RegExp('\\b'+rule+'\\('));
  assert.match(source,new RegExp('\\b'+rule+'\\('));
 }
 assert.doesNotMatch(client,/for \(let offset = 0; offset < boardWidth; offset\+\+\)/);
 assert.doesNotMatch(source,/for \(let offset = 0; offset < boardWidth; offset\+\+\)/);
});
