// DVOR isolated physics and PocketNet smoke tests. Run node --test apps/dvor-football/test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {newGame,advanceGame,kickBall,safeProfile} from './sim.js';
const source=await readFile(new URL('./server/module.ts',import.meta.url),'utf8');
const server=await import('data:text/javascript,'+encodeURIComponent(source));
const game=server.default;

test('four field players per team and five-minute full match',()=>{
 const state=newGame();assert.equal(state.players.length,8);
 assert.deepEqual(state.players.map(p=>p.side),[0,0,0,0,1,1,1,1]);
 assert.equal(state.remain,300);
 state.controlled={};
 for(let i=0;i<15500;i++)advanceGame(state,{},.02);
 assert.equal(state.phase,'done');assert.equal(state.remain,0);
});
test('separate physical ball receives acceleration',()=>{
 const s=newGame();s.hold=0;
 const p=s.players[0];s.ball.x=p.x+23;s.ball.y=p.y;
 assert.equal(kickBall(s,p,'shot',0,1),true);
 assert.ok(s.ball.vx>400,'shot should carry velocity');
 const before=s.ball.x;advanceGame(s,{},.04);
 assert.ok(s.ball.x>before,'ball moves independently');
});
test('player editor stats have limits',()=>{
 const p=safeProfile({name:'Sample',stats:{pace:999,shot:999,control:999,pass:999}});
 assert.equal(Object.values(p.stats).reduce((a,b)=>a+b,0),20);
 assert.ok(Object.values(p.stats).every(v=>v>=3&&v<=7));
 assert.equal(p.name,'Sample');
});
test('PocketNet requires opposing teams, team switch, host-only restart',()=>{
 const a={id:'A',name:'Alice'},b={id:'B',name:'Bob'};
 let s=game.createRoom({player:a}).state;
 s=game.onJoin({state:s,player:b,players:[a,b]}).state;
 assert.equal(s.members.length,2);assert.equal(s.members[1].side,1);
 assert.equal(game.onMessage({state:s,player:b,payload:{type:'start'}}).state.phase,'lobby');
 s=game.onMessage({state:s,player:a,payload:{type:'start'}}).state;
 assert.equal(s.phase,'play');assert.equal(s.match.players.length,8);
 const after=game.onMessage({state:s,player:b,payload:{type:'tactic',value:1}}).state;
 assert.equal(after.match.tactics[1],1);
 const finished={...after,phase:'done',match:{...after.match,phase:'done'}};
 const again=game.onMessage({state:finished,player:a,payload:{type:'start'}}).state;
 assert.equal(again.phase,'play');assert.equal(again.match.remain,300);
});
test('unauthenticated score payload cannot set result',()=>{
 const a={id:'A',name:'Alice'},b={id:'B',name:'Bob'};
 let s=game.createRoom({player:a}).state;
 s=game.onJoin({state:s,player:b,players:[a,b]}).state;
 s=game.onMessage({state:s,player:a,payload:{type:'start'}}).state;
 const next=game.onMessage({state:s,player:b,payload:{type:'score',score:[999,0]}}).state;
 assert.deepEqual(next.match.score,[0,0]);
});
