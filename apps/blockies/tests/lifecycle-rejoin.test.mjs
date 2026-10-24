import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const {default:game}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const people=Array.from({length:4},(_,i)=>({id:'member'+i,name:'Member '+i}));
const live=n=>people.slice(0,n).map(p=>p.id);
function room(n=2){
 let state=game.createRoom({player:people[0]}).state;
 for(const member of people.slice(1,n))state=game.onJoin({state,player:member}).state;
 for(const member of people.slice(0,n))
  state=game.onMessage({state,player:member,payload:{type:'ready'},connectedIds:live(n)}).state;
 assert.equal(state.started,true);
 return state;
}
function event(state,id,type,connectedIds=live(state.players.length)){
 return game.onMessage({state,player:people[id],payload:{type},connectedIds}).state;
}
test('explicitly leaving and rejoining an in-progress game parks then restores the SAME piece',()=>{
 let state=room(3),seat=state.engine.players[1];
 const saved={type:seat.currentType,next:seat.nextType,bag:structuredClone(seat.bag),
  hold:seat.holdType,holdUsed:seat.holdUsed,score:state.engine.sharedStats.score};
 state=game.onLeave({state,player:people[1]}).state;
 seat=state.engine.players[1];
 assert.equal(state.players[1].left,true);
 assert.equal(seat.offline,true);
 assert.equal(seat.blocked,true);
 assert.equal(seat.currentPiece,null);
 assert.equal(seat.reentryType,saved.type);
 assert.equal(seat.nextType,saved.next);
 assert.deepEqual(seat.bag,saved.bag);
 state=game.onJoin({state,player:people[1]}).state;
 assert.equal(state.players.length,3,'seat rejoining must not create a new seat');
 assert.equal(state.players[1].left,false);
 state=event(state,1,'pulse');
 assert.equal(state.engine.players[1].offline,false);
 assert.equal(state.engine.players[1].canResume,true);
 state=event(state,1,'resume');
 seat=state.engine.players[1];
 assert.equal(seat.gameOver,false);
 assert.equal(seat.blocked,false);
 assert.equal(seat.reentryType,null);
 assert.equal(seat.currentType,saved.type);
 assert.equal(seat.nextType,saved.next);
 assert.deepEqual(seat.bag,saved.bag);
 assert.equal(seat.holdType,saved.hold);
 assert.equal(seat.holdUsed,saved.holdUsed);
 assert.equal(state.engine.sharedStats.score,saved.score);
 assert.equal(state.engine.sharedStats.contributions[1].returns,1);
});
test('rejoin cannot bypass blocked five-row entrance',()=>{
 let state=room(2),seat=state.engine.players[0],x=seat.spawnLaneX;
 const current=seat.currentType;
 state=game.onLeave({state,player:people[0]}).state;
 state.engine.board[4][x]=2;
 state=game.onJoin({state,player:people[0]}).state;
 state=event(state,0,'pulse');
 assert.equal(state.engine.players[0].canResume,false);
 state=event(state,0,'resume');
 assert.equal(state.engine.players[0].blocked,true);
 state.engine.board[4][x]=0;
 state=event(state,0,'pulse');
 assert.equal(state.engine.players[0].canResume,true);
 state=event(state,0,'resume');
 assert.equal(state.engine.players[0].currentType,current);
 assert.equal(state.engine.players[0].blocked,false);
});
test('offline host handoff while paused allows the new host to resume',()=>{
 let state=room(3);
 state=event(state,0,'pause');
 assert.equal(state.paused,true);
 const locked=structuredClone(state.engine.board);
 state=event(state,1,'pulse',['member1','member2']);
 assert.equal(state.hostId,'member1');
 assert.equal(state.paused,true);
 assert.deepEqual(state.engine.board,locked);
 assert.throws(()=>event(state,0,'pause',['member1','member2']),/ведущему/);
 state=event(state,1,'pause',['member1','member2']);
 assert.equal(state.paused,false);
 assert.equal(state.hostId,'member1');
 state=event(state,2,'pulse',['member1','member2']);
 assert.equal(state.engine.players[0].offline,true);
});
test('returning host does not steal leadership from the successor',()=>{
 let state=room(3);
 state=event(state,1,'pulse',['member1','member2']);
 assert.equal(state.hostId,'member1');
 state=event(state,0,'pulse',['member0','member1','member2']);
 assert.equal(state.hostId,'member1');
});
test('last participant leaving ends round; same participant cannot unilaterally rematch',()=>{
 let state=room(2);
 state=game.onLeave({state,player:people[0]}).state;
 state=game.onLeave({state,player:people[1]}).state;
 assert.equal(state.started,false);
 assert.equal(state.phase,'lobby');
 assert.equal(state.engine,null);
 state=game.onJoin({state,player:people[0]}).state;
 assert.equal(state.players.filter(p=>!p.left).length,1);
 state=event(state,0,'ready',['member0']);
 assert.equal(state.started,false);
});
test('a match with one remaining connected player cannot restart by host rematch',()=>{
 let state=room(2);
 state.engine.isGameOver=true;state.phase='finished';
 state=event(state,0,'rematch',['member0']);
 assert.equal(state.started,false);
 assert.equal(state.engine,null);
 assert.equal(state.players.every(p=>!p.ready),true);
});
