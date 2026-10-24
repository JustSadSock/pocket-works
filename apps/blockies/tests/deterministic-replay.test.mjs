import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as core from '../physics-core.js';

const serverSource=await readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const clientSource=await readFile(new URL('../game.js',import.meta.url),'utf8');
const instrumented='let __clock=1000;export const advanceClock=ms=>{__clock+=ms;};\n'+serverSource.replaceAll('Date.now()','__clock');
const {default:game,advanceClock}=await import('data:text/javascript;base64,'+Buffer.from(instrumented).toString('base64'));
const clone=x=>structuredClone(x);

function browserMirror(snapshot){
 const engine=snapshot.engine,gameState={
  board:clone(engine.board),boardWidth:engine.boardWidth,numPlayers:engine.players.length,
  sharedStats:clone(engine.sharedStats),sharedStatsDirty:false,isGameOver:false,players:[]
 };
 let rngState=engine.rngState;
 function randomFloat(){
  rngState=(rngState+0x6D2B79F5)|0;
  let r=Math.imul(rngState^rngState>>>15,1|rngState);
  r=r+Math.imul(r^r>>>7,61|r)^r;
  return ((r^r>>>14)>>>0)/4294967296;
 }
 const creditStart=clientSource.indexOf('function creditClearedRows(');
 const creditEnd=clientSource.indexOf('function setRandomSeed(',creditStart);
 const creditClearedRows=new Function('gameState',
  clientSource.slice(creditStart,creditEnd)+';return creditClearedRows;')(gameState);
 const start=clientSource.indexOf('class Player {');
 const end=clientSource.indexOf('function laneHasClearance(',start);
 assert.ok(start>0&&end>start);
 const soundManager={move(){},rotate(){},land(){},lineClear(){},drop(){},gameOver(){}};
 const window={uiManager:{isOnlineMode:false,onPieceLocked(){},onLinesCleared(){}}};
 const laneHasClearance=p=>core.isLaneClear(
  p.spawnLaneX,gameState.board,gameState.players,p.id,gameState.numPlayers);
 const spawnLaneX=(i,n,width)=>i*4+Math.floor((width-4*n)*(i+1)/(n+1));
 const checkAllPlayersGameOver=()=>{
  if(gameState.players.every(p=>p.gameOver))gameState.isGameOver=true;
 };
 const deps={...core,gameState,randomFloat,creditClearedRows,soundManager,
  window,networkManager:{},getBoardWidth:()=>gameState.boardWidth,
  spawnLaneX,laneHasClearance,checkAllPlayersGameOver,BOARD_HEIGHT:20};
 const Player=new Function(...Object.keys(deps),
  clientSource.slice(start,end)+';return Player;')(...Object.values(deps));
 gameState.players=engine.players.map((p,i)=>Object.assign(
  new Player(i,p.color,p.keys,p.spawnAnchor),clone(p)));
 return {gameState,randomState:()=>rngState};
}
function startRoom(count){
 const people=Array.from({length:count},(_,i)=>({id:'P'+i,name:'P'+i}));
 const online=people.map(x=>x.id);
 let state=game.createRoom({player:people[0]}).state;
 for(const p of people.slice(1))state=game.onJoin({state,player:p}).state;
 for(const p of people)state=game.onMessage({state,player:p,payload:{type:'ready'},connectedIds:online}).state;
 return {state,people,online};
}
function verify(local,server,step){
 const client=local.gameState,remote=server.engine;
 const props=['currentPiece','nextPiece','position','bag','currentType','nextType',
  'holdType','holdUsed','gameOver','blocked','lockCounter','lockResets',
  'dropCounter','dropInterval','score','lines','level'];
 assert.deepEqual(client.board,remote.board,'board divergence at '+step);
 assert.deepEqual(client.sharedStats,remote.sharedStats,'score divergence at '+step);
 for(let i=0;i<remote.players.length;i++)
  for(const key of props)assert.deepEqual(client.players[i][key],remote.players[i][key],
   'seat '+i+' '+key+' divergence at '+step);
 assert.equal(local.randomState(),remote.rngState,'RNG divergence at '+step);
}
function localAction(p,input){
 switch(input.action){
  case 'move':p.move(input.direction,{broadcast:false});break;
  case 'hold':p.holdPiece({broadcast:false});break;
  default:p[input.action]({broadcast:false});
 }
}
function stepLocal(client,ms){
 for(let offset=0;offset<ms;offset+=50)
  for(const player of client.gameState.players)
   if(!player.gameOver&&!player.offline)player.update(Math.min(50,ms-offset));
}
for(const count of [2,3,4]){
 test(`server and browser replay produce identical board, 7-bag, Hold and scoring for ${count} seats`,()=>{
  const {state:initial,people,online}=startRoom(count);
  let state=initial;
  const client=browserMirror(state);
  verify(client,state,'initial');
  let seq=Array(count).fill(0);
  for(let turn=0;turn<160&&!state.engine.isGameOver;turn++){
   const index=turn%count,seat=state.engine.players[index];
   if(seat.gameOver)continue;
   const kind=turn%9;
   const input=kind===0?{action:'move',direction:1}:kind===1?{action:'rotate'}:
    kind===2?{action:'hold'}:kind===3?{action:'drop'}:
    kind===4?{action:'move',direction:-1}:kind===5?{action:'rotate'}:
    {action:'hardDrop'};
   state.lastTick=Number.MAX_SAFE_INTEGER; // no incidental gravity during command comparison
   state=game.onMessage({state,player:people[index],payload:{type:'input_batch',
    actions:[{...input,seq:++seq[index]}]},connectedIds:online}).state;
   localAction(client.gameState.players[index],input);
   verify(client,state,turn);
  }
 });
}
test('server and local lock timers advance identically on 50-ms simulation slices',()=>{
 const {state:initial,people,online}=startRoom(2);
 let state=initial;const local=browserMirror(state);
 for(const delta of [50,100,150,200,350,500]){
  advanceClock(delta);
  const before=state.lastTick;
  state=game.onMessage({state,player:people[0],payload:{type:'pulse'},connectedIds:online}).state;
  // The server splits elapsed time into slices of at most 50 ms.
  const elapsed=Math.min(1200,Math.max(0,state.lastTick-before));
  stepLocal(local,elapsed);
  verify(local,state,'pulse '+delta);
 }
});
test('two shared lines award the identical team score and owner credit in browser and server',()=>{
 const {state:initial,people,online}=startRoom(3);
 let state=initial;const local=browserMirror(state);
 const serverSeat=state.engine.players[0],localSeat=local.gameState.players[0];
 const x=serverSeat.spawnLaneX;
 for(const board of [state.engine.board,local.gameState.board]){
  for(const y of [18,19])for(let col=0;col<board[0].length;col++)
   board[y][col]=(col===x||col===x+1)?0:2;
 }
 for(const seat of [serverSeat,localSeat]){
  seat.currentPiece=[[1,1],[1,1]];seat.currentType='O';
  seat.position={x,y:16};
 }
 state.lastTick=Number.MAX_SAFE_INTEGER;
 state=game.onMessage({state,player:people[0],
  payload:{type:'input_batch',actions:[{seq:1,action:'hardDrop'}]},connectedIds:online}).state;
 localAction(localSeat,{action:'hardDrop'});
 verify(local,state,'two-line-clear');
 assert.equal(state.engine.sharedStats.lines,2);
 assert.equal(state.engine.sharedStats.score,240);
 assert.equal(state.engine.sharedStats.contributions.reduce((n,c)=>n+c.cellsCleared,0),
  state.engine.boardWidth*2);
});
test('canonical score transitions preserve combos and multi-line bonuses exactly',()=>{
 let stats={score:0,lines:0,level:1,comboChain:0};
 for(const cleared of [1,2,3,0,4,1,0,1]){
  const updated=core.scoreLineClear(stats,cleared);
  assert.ok(updated.score>=stats.score);
  assert.equal(updated.lines,stats.lines+cleared);
  assert.equal(updated.level,Math.floor(updated.lines/10)+1);
  if(cleared===0)assert.equal(updated.comboChain,0);
  else assert.equal(updated.comboChain,stats.comboChain+1);
  stats={...stats,...updated};
 }
});
