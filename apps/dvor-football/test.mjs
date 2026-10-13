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
 for(let i=0;i<21000&&state.phase==='play';i++)advanceGame(state,{},.02);
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

test('shift sprint increases pace, consumes and recovers stamina',()=>{
 const walk=newGame(),run=newGame();
 walk.hold=0;run.hold=0;
 walk.controlled={0:true};run.controlled={0:true};
 for(let i=0;i<35;i++){
  advanceGame(walk,{0:{x:1,y:0,sprint:false}},.02);
  advanceGame(run,{0:{x:1,y:0,sprint:true}},.02);
 }
 assert.ok(run.players[0].x>walk.players[0].x+30,'sprint must move further');
 assert.ok(run.players[0].stamina<.9,'stamina consumed');
 const prev=run.players[0].stamina;
 for(let i=0;i<100;i++)advanceGame(run,{0:{x:0,y:0,sprint:false}},.02);
 assert.ok(run.players[0].stamina>prev,'stamina recovers');
});
test('authoritative sprint validates only a boolean, cannot set pace or stamina directly',()=>{
 const a={id:'A',name:'Alice'},b={id:'B',name:'Bob'};
 let s=game.createRoom({player:a}).state;
 s=game.onJoin({state:s,player:b,players:[a,b]}).state;
 s=game.onMessage({state:s,player:a,payload:{type:'start'}}).state;
 s=game.onMessage({state:s,player:a,payload:{type:'input',x:1,y:0,angle:0,power:1,sprint:true,stamina:999,pace:999}}).state;
 assert.equal(s.inputs[0].sprint,true);
 assert.notEqual(s.match.players[0].stamina,999);
 assert.ok(s.match.players[0].stats.pace<=7);
});
test('topdown coordinates preserve field aspect and mouse aim in letterbox',async()=>{
 const {pitchTransform,toPitch,CAMERA,PLAYER_SCALE}=await import('./visuals.js');
 const {FIELD}=await import('./sim.js');
 const rect={left:10,top:20,width:1600,height:850};
 const transform=pitchTransform(rect);
 const x=rect.left+transform.x+CAMERA.width*.65*transform.scale;
 const y=rect.top+transform.y+CAMERA.height*.39*transform.scale;
 const p=toPitch(rect,x,y);
 assert.ok(Math.abs(p.x-(CAMERA.left+CAMERA.width*.65))<.001);
 assert.ok(Math.abs(p.y-(CAMERA.top+CAMERA.height*.39))<.001);
});

test('miniature overhead scene preserves pitch and reduces avatar footprint',async()=>{
 const {pitchTransform,CAMERA,PLAYER_SCALE,toPitch}=await import('./visuals.js');
 assert.ok(PLAYER_SCALE<=.62 && PLAYER_SCALE>=.5,'players substantially smaller than previous version');
 assert.ok(CAMERA.left<=18&&CAMERA.left+CAMERA.width>=1062,'both physical goal nets visible');
 assert.ok(CAMERA.top<=56&&CAMERA.top+CAMERA.height>=564,'all lines visible');
 const phone={left:0,top:0,width:844,height:390};
 const projected=pitchTransform(phone);
 assert.ok(projected.scale>390/620*1.1,'use more of mobile screen than original layout');
 const mid=toPitch(phone,phone.width/2,phone.height/2);
 assert.ok(Math.abs(mid.x-540)<.001&&Math.abs(mid.y-310)<.001,'center remains world center');
});
test('new contact distance requires an actual visible approach',()=>{
 const s=newGame(),p=s.players[0];s.hold=0;
 s.ball.x=p.x+41;s.ball.y=p.y;
 assert.equal(kickBall(s,p,'shot',0),false,'too distant to kick');
 s.ball.x=p.x+31;
 assert.equal(kickBall(s,p,'shot',0),true,'close enough to touch');
});
