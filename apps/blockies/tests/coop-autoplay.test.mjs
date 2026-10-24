import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Clock and seed are deterministic. Physics is the unmodified production module.
const source=await fs.readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const harness='let __clock=1000; export const setTestClock=v=>{__clock=v};\n'+
 source.replaceAll('Date.now()','__clock');
const {default:game,setTestClock}=await import('data:text/javascript;base64,'+Buffer.from(harness).toString('base64'));
const WIDTHS={2:14,3:18,4:22};
function rng(seed){let s=seed>>>0;return max=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)%max};}
function enter(count){
 const players=Array.from({length:count},(_,i)=>({id:'agent'+i,name:'Agent '+i}));
 const connectedIds=players.map(p=>p.id);
 let state=game.createRoom({player:players[0]}).state;
 for(const player of players.slice(1))state=game.onJoin({state,player}).state;
 for(const player of players)state=game.onMessage({state,player,payload:{type:'ready'},connectedIds}).state;
 return {state,players,connectedIds};
}
function invariants(state,count){
 assert.ok(state.engine);
 const {board,boardWidth,players,sharedStats}=state.engine;
 assert.equal(boardWidth,WIDTHS[count]);
 assert.equal(board.length,20);
 assert.ok(board.every(row=>row.length===boardWidth&&row.every(n=>Number.isInteger(n)&&n>=0&&n<=count)));
 assert.equal(players.length,count);
 assert.ok(sharedStats.score>=0&&sharedStats.lines>=0);
 assert.equal(sharedStats.contributions.length,count);
 assert.equal(sharedStats.contributions.reduce((s,c)=>s+c.cellsCleared,0),sharedStats.lines*boardWidth);
 assert.equal(sharedStats.contributions.reduce((s,c)=>s+c.finishes,0),sharedStats.lines);
 assert.ok(sharedStats.contributions.every(c=>
  Number.isInteger(c.linesHelped)&&c.linesHelped<=sharedStats.lines&&c.linesHelped>=0&&
  Number.isInteger(c.returns)&&c.returns>=0));
 for(const player of players){
  if(!player.currentPiece)continue;
  assert.ok(Number.isInteger(player.position.x)&&Number.isInteger(player.position.y));
  assert.ok(Array.isArray(player.currentPiece)&&player.currentPiece.length<=4);
  assert.ok(player.lockResets<=8&&player.lockResets>=0);
  assert.ok(Array.isArray(player.bag)&&player.bag.length<=7);
 }
 const occupied=new Set();
 for(const player of players){
  if(player.gameOver||!player.currentPiece)continue;
  for(let y=0;y<player.currentPiece.length;y++)
   for(let x=0;x<player.currentPiece[y].length;x++){
    if(!player.currentPiece[y][x])continue;
    const xx=player.position.x+x,yy=player.position.y+y;
    assert.ok(xx>=0&&xx<boardWidth&&yy>=0&&yy<20,'active cell exceeds the well');
    assert.equal(board[yy][xx],0,'active piece intersects a locked tile');
    const key=xx+':'+yy;
    assert.ok(!occupied.has(key),'two falling pieces overlap');
    occupied.add(key);
   }
 }
 if(players.every(p=>p.gameOver))assert.equal(state.engine.isGameOver,true);
}
for(const count of [2,3,4]){
 test(`${count}-player seeded co-op sessions preserve board and contribution invariants`,()=>{
  for(let seed=1;seed<=12;seed++){
   let time=1000+seed*1000,set=setTestClock;set(time);
   const {players,connectedIds,...room}=enter(count);
   let state=room.state;
   const random=rng(seed*31337+count);
   invariants(state,count);
   for(let turn=0;turn<130&&!state.engine.isGameOver;turn++){
    const index=turn%count,player=players[index],seat=state.engine.players[index];
    time+=100+random(140);set(time);
    if(seat.blocked){
      if(seat.canResume){
       state=game.onMessage({state,player,payload:{type:'resume'},connectedIds}).state;
      }else{
       state=game.onMessage({state,player,payload:{type:'pulse'},connectedIds}).state;
      }
    }else if(!seat.gameOver){
      const type=random(5),direction=random(2)?1:-1;
      const input=type===0?{action:'rotate'}:
       type===1?{action:'move',direction}:
       type===2?{action:'hold'}:
       type===3?{action:'drop'}:{action:'hardDrop'};
      state=game.onMessage({state,player,payload:{type:'input_batch',
       actions:[{...input,seq:seat.lastInputSeq+1}]},connectedIds}).state;
    }else state=game.onMessage({state,player,payload:{type:'pulse'},connectedIds}).state;
    invariants(state,count);
    if(state.engine.isGameOver)assert.equal(state.phase,'finished');
   }
  }
 });
}
test('a paused room rejects gameplay changes and resumes without a physics leap',()=>{
 setTestClock(15_000);
 const {state:initial,players,connectedIds}=enter(2);
 let state=game.onMessage({state:initial,player:players[0],payload:{type:'pause'},connectedIds}).state;
 const board=structuredClone(state.engine.board);
 setTestClock(45_000);
 state=game.onMessage({state,player:players[1],payload:{type:'pulse'},connectedIds}).state;
 assert.deepEqual(state.engine.board,board);
 state=game.onMessage({state,player:players[0],payload:{type:'pause'},connectedIds}).state;
 assert.equal(state.paused,false);
 const y=state.engine.players[0].position.y;
 setTestClock(45_050);
 state=game.onMessage({state,player:players[1],payload:{type:'pulse'},connectedIds}).state;
 assert.equal(state.engine.players[0].position.y,y);
});
