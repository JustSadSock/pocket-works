import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const {default:game}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const players=Array.from({length:3},(_,i)=>({id:String(i),name:'Player '+i}));
function lobby(n=2){
 let state=game.createRoom({player:players[0]}).state;
 for(let i=1;i<n;i++)state=game.onJoin({state,player:players[i]}).state;
 return state;
}
function message(state,who,payload,connectedIds=players.slice(0,state.players.length).map(p=>p.id)){
 return game.onMessage({state,player:players[who],payload,connectedIds}).state;
}
function start(n=2){
 let state=lobby(n);
 for(let i=0;i<n;i++)state=message(state,i,{type:'ready'});
 assert.equal(state.started,true);
 return state;
}
test('offline ready flags cannot launch a one-person game, even when previously ready',()=>{
 let state=lobby();
 state=message(state,1,{type:'ready'},['0','1']);
 assert.equal(state.players[1].ready,true);
 state=message(state,0,{type:'ready'},['0']);
 assert.equal(state.started,false);
 assert.equal(state.players[1].ready,false);
 state=message(state,1,{type:'ready'},['0','1']);
 assert.equal(state.started,true);
});
test('a third offline seat starts suspended only when two other players are connected',()=>{
 let state=lobby(3);
 state=message(state,0,{type:'ready'},['0','1']);
 state=message(state,1,{type:'ready'},['0','1']);
 assert.equal(state.started,true);
 assert.equal(state.engine.players[2].offline,true);
 assert.equal(state.engine.players[2].blocked,true);
 assert.equal(state.engine.players[2].canResume,false);
 state=message(state,2,{type:'pulse'},['0','1','2']);
 assert.equal(state.engine.players[2].offline,false);
 assert.equal(state.engine.players[2].canResume,true);
 state=message(state,2,{type:'resume'},['0','1','2']);
 assert.equal(state.engine.players[2].gameOver,false);
});
test('disconnected piece is parked without falling and resumes at its old coordinates if clear',()=>{
 let state=start(2);
 const original=structuredClone(state.engine.players[1].position);
 state=message(state,0,{type:'pulse'},['0']);
 assert.equal(state.engine.players[1].offline,true);
 const y=state.engine.players[1].position.y;
 state.lastTick=Date.now()-600;
 state=message(state,0,{type:'pulse'},['0']);
 assert.equal(state.engine.players[1].position.y,y);
 assert.equal(state.engine.players[1].gameOver,false);
 state=message(state,1,{type:'pulse'},['0','1']);
 assert.equal(state.engine.players[1].offline,false);
 assert.equal(state.engine.players[1].gameOver,false);
 assert.deepEqual(state.engine.players[1].position,original);
});
test('a changed board parks a returning piece safely, preserving its shape and queue for manual reentry',()=>{
 let state=start(2),p=state.engine.players[1];
 const original=p.currentType,next=p.nextType,queue=structuredClone(p.bag);
 p.holdUsed=true;
 state=message(state,0,{type:'pulse'},['0']);
 p=state.engine.players[1];
 let xx=null,yy=null;
 for(let y=0;y<p.currentPiece.length;y++)for(let x=0;x<p.currentPiece[y].length;x++)
  if(p.currentPiece[y][x]&&xx===null){xx=p.position.x+x;yy=p.position.y+y;}
 assert.ok(xx!==null);
 state.engine.board[yy][xx]=1;
 state=message(state,1,{type:'pulse'},['0','1']);
 p=state.engine.players[1];
 assert.equal(p.offline,false);
 assert.equal(p.blocked,true);
 assert.equal(p.gameOver,true);
 assert.equal(p.currentPiece,null);
 assert.equal(p.reentryType,original);
 assert.equal(p.canResume,false);
 state=message(state,1,{type:'resume'});
 assert.equal(state.engine.players[1].blocked,true);
 state.engine.board[yy][xx]=0;
 state=message(state,1,{type:'pulse'});
 assert.equal(state.engine.players[1].canResume,true);
 state=message(state,1,{type:'resume'});
 p=state.engine.players[1];
 assert.equal(p.gameOver,false);
 assert.equal(p.currentType,original);
 assert.equal(p.nextType,next);
 assert.deepEqual(p.bag,queue);
 assert.equal(p.holdUsed,true,'reconnection must not refund Hold for the interrupted piece');
 assert.equal(p.reentryType,null);
});
test('legacy commands share the same rate bucket as ordered input batches',()=>{
 let state=start(2);
 for(let i=0;i<48;i++)state=message(state,0,{type:'input',input:{action:'rotate'}});
 assert.throws(()=>message(state,0,{type:'input',input:{action:'rotate'}}),/частые/);
 assert.throws(()=>message(state,0,{type:'input_batch',actions:[{seq:1,action:'rotate'}]}),/частые/);
});
test('host rematch with only one connected person returns to lobby and invalidates readiness',()=>{
 let state=start(2);
 state.engine.isGameOver=true;state.phase='finished';
 state=message(state,0,{type:'rematch'},['0']);
 assert.equal(state.started,false);
 assert.equal(state.phase,'lobby');
 assert.ok(state.players.every(p=>!p.ready));
});
test('host rematch with two connected and one absent creates a safe suspended spectator',()=>{
 let state=start(3);
 state.engine.isGameOver=true;state.phase='finished';
 state=message(state,0,{type:'rematch'},['0','1']);
 assert.equal(state.started,true);
 assert.equal(state.engine.players[2].offline,true);
 assert.equal(state.engine.players[2].gameOver,true);
 assert.equal(state.engine.players[0].gameOver,false);
 assert.equal(state.engine.players[1].gameOver,false);
});
