import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVELS,newMatch,step,command,snapshot,validSnapshot,ropePaths} from './game.js';

const party=()=>[{id:'one',name:'First'},{id:'two',name:'Second'},{id:'three',name:'Third'}];

test('every authored board starts with valid network state',()=>{
 for(let level=0;level<LEVELS.length;level++){
  const game=newMatch(party(),level,false);
  assert.equal(game.phase,'play');
  assert.equal(game.sparks.length,LEVELS[level].sparks.length);
  assert.equal(validSnapshot(snapshot(game)),true);
 }
});

test('rope constrains companions, collision remains finite',()=>{
 const game=newMatch(party(),0,false);
 for(let frame=0;frame<5000;frame++){
  const values={one:{x:Math.sin(frame/43),y:Math.cos(frame/67)},two:{x:Math.cos(frame/59),y:Math.sin(frame/81)},three:{x:Math.sin(frame/113),y:Math.cos(frame/47)}};
  step(game,values,1/60);
  assert.equal(validSnapshot(snapshot(game)),true);
  for(const p of game.players)assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
 }
 assert.ok(ropePaths(game.players,LEVELS[0].stones).length===2);
});

test('tug applies a cooldown rather than stacking boosts',()=>{
 const game=newMatch(party(),0,false),first=game.players[0];
 command(game,'one',{tug:true});
 assert.ok(first.cooldown>0);
 const start=first.cooldown;
 command(game,'one',{tug:true});
 assert.equal(first.cooldown,start);
 step(game,{one:{x:1,y:0}},1/60);
 assert.ok(first.boost>0);
});

test('rope can collect an unlit spark and a complete team can exit',()=>{
 const game=newMatch(party(),0,false);
 const spark=LEVELS[0].sparks[0];
 game.players[0].x=spark.x-70;game.players[0].y=spark.y;
 game.players[1].x=spark.x+70;game.players[1].y=spark.y;
 game.players[2].x=spark.x+170;game.players[2].y=spark.y;
 const events=step(game,{},1/60);
 assert.ok(game.sparks[0],JSON.stringify(events));
 game.sparks.fill(true);
 const gate=LEVELS[0].exit;
 for(const p of game.players){p.x=gate.x;p.y=gate.y+50;p.vx=0;p.vy=0}
 step(game,{},1/60);
 assert.equal(game.phase,'won');
 assert.ok(game.finishedAt>=0);
});

test('invalid snapshots cannot replace trusted state',()=>{
 const good=snapshot(newMatch(party(),0,false));
 assert.equal(validSnapshot({...good,level:100}),false);
 assert.equal(validSnapshot({...good,players:[{id:'x',name:'x',x:Infinity,y:2}]}),false);
 assert.equal(validSnapshot({...good,sparks:['yes']}),false);
});
