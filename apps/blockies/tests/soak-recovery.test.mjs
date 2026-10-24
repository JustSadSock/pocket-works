import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Production PocketNet module, except for an injected deterministic clock.
const original=await readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const instrumented='let __clock=1000; export const setClock=t=>{__clock=t};\n'+
 original.replaceAll('Date.now()','__clock');
const {default:game,setClock}=await import('data:text/javascript;base64,'+
 Buffer.from(instrumented).toString('base64'));

function nextRandom(seed){
 let x=seed>>>0;
 return bound=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)%bound};
}
function room(n,clock){
 setClock(clock);
 const players=Array.from({length:n},(_,i)=>({id:'agent-'+i,name:'Agent '+i}));
 let state=game.createRoom({player:players[0]}).state;
 for(const p of players.slice(1))state=game.onJoin({state,player:p}).state;
 const connectedIds=players.map(p=>p.id);
 for(const player of players)state=game.onMessage({state,player,
  payload:{type:'ready'},connectedIds}).state;
 return {players,state};
}
function check(state,n){
 if(!state.engine)return;
 const e=state.engine,{board,players}=e,width=10+4*(n-1);
 assert.equal(board.length,20);
 assert.equal(e.boardWidth,width);
 assert.ok(board.every(row=>row.length===width&&row.every(v=>Number.isInteger(v)&&v>=0&&v<=n)));
 assert.equal(players.length,n);
 assert.equal(e.sharedStats.contributions.length,n);
 assert.equal(e.sharedStats.contributions.reduce((sum,p)=>sum+p.cellsCleared,0),e.sharedStats.lines*width);
 assert.equal(e.sharedStats.contributions.reduce((sum,p)=>sum+p.finishes,0),e.sharedStats.lines);
 const active=new Set();
 for(const p of players){
  assert.ok(p.bag.length<=7&&new Set(p.bag).size===p.bag.length);
  assert.ok(p.lockResets<=8&&p.lockResets>=0);
  if(p.gameOver||p.offline||!p.currentPiece)continue;
  for(let row=0;row<p.currentPiece.length;row++)
   for(let col=0;col<p.currentPiece[row].length;col++){
    if(!p.currentPiece[row][col])continue;
    const x=p.position.x+col,y=p.position.y+row;
    assert.ok(x>=0&&x<width&&y>=0&&y<20,'active cell outside the board');
    assert.equal(board[y][x],0,'piece overlaps a locked block');
    const key=x+':'+y;
    assert.ok(!active.has(key),'two live pieces overlap');
    active.add(key);
   }
 }
 if(players.every(p=>p.gameOver))assert.equal(e.isGameOver,true);
}
function move(state,player,payload,connectedIds,clock){
 const before=structuredClone(state);
 setClock(clock);
 const first=game.onMessage({state,player,payload,connectedIds}).state;
 setClock(clock);
 const restored=game.onMessage({state:JSON.parse(JSON.stringify(before)),
  player,payload,connectedIds}).state;
 assert.deepEqual(first,restored,'durable-room restore must replay the same operation');
 if(first.engine){
  const view=game.viewForPlayer({state:first,player});
  assert.equal(view.engine.rngState,undefined);
  assert.equal(view.engine.players.length,first.engine.players.length);
  assert.ok(view.engine.players.every(seat=>seat.bag===undefined));
 }
 return first;
}
for(const n of [2,3,4]){
 test(`${n}-player long-running recovery and deterministic room serialization`,()=>{
  for(let seed=1;seed<=8;seed++){
   let clock=seed*2000,random=nextRandom(seed*199+n);
   let {state,players}=room(n,clock);
   check(state,n);
   for(let step=0;step<360;step++){
    clock+=25+random(400);
    const absent=(step%31>=10&&step%31<=17)?1:-1;
    const connectedIds=players.filter((_,i)=>i!==absent).map(p=>p.id);
    if(state.engine?.isGameOver){
     state=move(state,players[0],{type:'rematch'},connectedIds,clock);
     if(!state.engine){
      const live=players.filter(p=>connectedIds.includes(p.id));
      for(const p of live)state=move(state,p,{type:'ready'},connectedIds,clock);
     }
    }else if(state.started){
     const seatIndex=step%n,idx=seatIndex===absent?0:seatIndex;
     const seat=state.engine.players[idx],player=players[idx];
     let payload={type:'pulse'};
     if(seat.blocked&&!seat.offline&&seat.canResume)payload={type:'resume'};
     else if(!seat.gameOver&&!seat.offline){
      const action=[{action:'rotate'},{action:'move',direction:-1},
       {action:'move',direction:1},{action:'hold'},
       {action:'drop'},{action:'hardDrop'}][random(6)];
      payload={type:'input_batch',actions:[{...action,seq:seat.lastInputSeq+1}]};
     }
     state=move(state,player,payload,connectedIds,clock);
    }else{
     state=move(state,players[0],{type:'sync'},connectedIds,clock);
    }
    check(state,n);
   }
  }
 });
}
