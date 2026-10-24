import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const {default:game}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function start(n){
 const people=Array.from({length:n},(_,i)=>({id:'p'+i,name:'P'+i}));
 const connected=people.map(p=>p.id);
 let state=game.createRoom({player:people[0]}).state;
 for(const p of people.slice(1))state=game.onJoin({state,player:p}).state;
 for(const p of people)state=game.onMessage({state,player:p,payload:{type:'ready'},connectedIds:connected}).state;
 return {state,people,connected};
}
for(const n of [2,3,4]){
 test(`ownership accounting on ${n}-player shared board`,()=>{
  const {people,connected}=start(n);
  let {state}=start(n);
  const width=state.engine.boardWidth;
  const finisher=state.engine.players[0],startX=finisher.spawnLaneX;
  const filled=Array.from({length:width},(_,x)=>x>=startX&&x<startX+4?0:(x%n)+1);
  state.engine.board[19]=filled;
  finisher.currentPiece=[[1,1,1,1]];
  finisher.currentType='I';
  finisher.position={x:startX,y:17};
  state=game.onMessage({state,player:people[0],
   payload:{type:'input_batch',actions:[{seq:1,action:'hardDrop'}]},connectedIds:connected}).state;
  assert.equal(state.engine.sharedStats.lines,1);
  assert.equal(state.engine.sharedStats.score,100);
  const contributions=state.engine.sharedStats.contributions;
  assert.equal(contributions.length,n);
  assert.equal(contributions.reduce((sum,c)=>sum+c.cellsCleared,0),width);
  assert.deepEqual(contributions.map(c=>c.linesHelped),Array(n).fill(1));
  assert.deepEqual(contributions.map(c=>c.finishes),[1,...Array(n-1).fill(0)]);
  assert.deepEqual(contributions.map(c=>c.returns),Array(n).fill(0));
  assert.deepEqual(state.engine.board[19],Array(width).fill(0));
 });
}
test('manual safety reentry increments comeback count without charging team score',()=>{
 const {people,connected}=start(2);
 let {state}=start(2);
 const p=state.engine.players[0],x=p.spawnLaneX;
 p.currentPiece=[[1,1,1,1]];p.currentType='I';p.position={x,y:0};
 for(let col=x;col<x+4;col++)state.engine.board[4][col]=1;
 state=game.onMessage({state,player:people[0],
  payload:{type:'input_batch',actions:[{seq:1,action:'hardDrop'}]},connectedIds:connected}).state;
 assert.equal(state.engine.players[0].blocked,true);
 const beforeScore=state.engine.sharedStats.score;
 state=game.onMessage({state,player:people[0],payload:{type:'resume'},connectedIds:connected}).state;
 assert.equal(state.engine.sharedStats.contributions[0].returns,0,'unsafe gate cannot be forced');
 for(let y=0;y<5;y++)for(let col=x;col<x+4;col++)state.engine.board[y][col]=0;
 state=game.onMessage({state,player:people[0],payload:{type:'resume'},connectedIds:connected}).state;
 assert.equal(state.engine.players[0].blocked,false);
 assert.equal(state.engine.sharedStats.contributions[0].returns,1);
 assert.equal(state.engine.sharedStats.score,beforeScore,'return is not purchased with points');
});
test('no contribution inflation from pulses, duplicate sequences, or empty line clears',()=>{
 const {people,connected}=start(2);
 let {state}=start(2);
 const player=state.engine.players[0];
 state=game.onMessage({state,player:people[0],payload:{type:'input_batch',actions:[{seq:1,action:'rotate'}]},connectedIds:connected}).state;
 state=game.onMessage({state,player:people[0],payload:{type:'input_batch',actions:[{seq:1,action:'rotate'}]},connectedIds:connected}).state;
 state=game.onMessage({state,player:people[1],payload:{type:'pulse'},connectedIds:connected}).state;
 assert.ok(state.engine.sharedStats.contributions.every(c=>c.cellsCleared===0&&c.linesHelped===0&&c.finishes===0));
});
