import test from 'node:test';
import assert from 'node:assert/strict';
import {ENEMY_KINDS,ENEMY_TELLS,initialEnemyIntent,advanceEnemyIntent,interruptIntent,
  enemyTerrainReaction,chooseEnemyKind,maxActiveAttackers,telegraphSeverity} from '../ecology.js';
import {validateRun} from '../stability.js';
const mk=(type)=>({type,x:0,z:0,hp:72,maxHp:72,...initialEnemyIntent(type,1),attack:0});
const ctx=(x=0,z=4,visible=true)=>({x:0,z:0,visible,playerX:x,playerZ:z});
test('every role has a positive telegraph, cooldown and distinct visual color',()=>{
 assert.equal(ENEMY_KINDS.length,6);
 assert.equal(new Set(ENEMY_KINDS.map(type=>ENEMY_TELLS[type].color)).size,5);
 for(const type of ENEMY_KINDS){assert.ok(ENEMY_TELLS[type].windup>=.3);assert.ok(ENEMY_TELLS[type].cooldown>=1.3);}
});
test('spitter commits only after warning and a wall cancels the actual shot',()=>{
 const e=mk('spitter');
 assert.equal(advanceEnemyIntent(e,.01,ctx()).action,'warn');
 assert.equal(e.windupKind,'spit');assert.ok(e.windup>.6);
 assert.equal(advanceEnemyIntent(e,.35,ctx()).action,'warn');
 assert.equal(advanceEnemyIntent(e,.40,ctx()).action,'shoot');
 assert.equal(e.windupKind,'');assert.ok(e.attack>2);
 const block=mk('spitter');
 advanceEnemyIntent(block,.01,ctx());
 assert.equal(advanceEnemyIntent(block,.8,ctx(0,4,false)).action,'miss');
});
test('brute charge is aimed and locked, not homing after telegraph',()=>{
 const e=mk('brute');
 assert.equal(advanceEnemyIntent(e,.01,ctx(4,0)).action,'warn');
 assert.equal(e.windupKind,'charge');assert.equal(e.intentX,4);
 const ev=advanceEnemyIntent(e,.8,ctx(0,-4,true));
 assert.equal(ev.action,'charge');assert.ok(e.lungeX>.99);assert.ok(Math.abs(e.lungeZ)<.01);
 assert.ok(e.lunge>.30);assert.equal(e.chargeHit,undefined);
});
test('shotgun interruption stops a telegraphed brute and gives a counterplay window',()=>{
 const e=mk('brute');advanceEnemyIntent(e,.01,ctx(3,0));
 assert.equal(interruptIntent(e,6,1),false);
 assert.equal(interruptIntent(e,14,1),true);
 assert.equal(e.windup,0);assert.ok(e.stagger>=.35);assert.ok(e.attack>=1);
 assert.equal(advanceEnemyIntent(e,.2,ctx(3,0)).action,'approach');
});
test('leech siphon can be interrupted by bolter and cannot drain behind walls',()=>{
 const e=mk('leech');assert.equal(advanceEnemyIntent(e,.01,ctx(0,3)).kind,'drain');
 assert.equal(advanceEnemyIntent(e,.85,ctx(0,3,false)).action,'miss');
 const e2=mk('leech');advanceEnemyIntent(e2,.01,ctx(0,3));
 assert.equal(interruptIntent(e2,26,0),true);
 assert.equal(telegraphSeverity(e2),0);
});
test('crawler melee must be in range at release, otherwise misses',()=>{
 const e=mk('crawler');advanceEnemyIntent(e,.01,ctx(0,.85));
 assert.equal(advanceEnemyIntent(e,.45,ctx(0,2)).action,'miss');
 assert.ok(e.attack>1);
});
test('biomes affect enemy survival and pacing, including acid-resistant spitters',()=>{
 assert.equal(enemyTerrainReaction('spitter','acid').damage,0);
 assert.equal(enemyTerrainReaction('crawler','acid').damage,6);
 assert.ok(enemyTerrainReaction('crawler','marrow').speed<enemyTerrainReaction('brute','marrow').speed);
 assert.ok(enemyTerrainReaction('brute','charge').stagger>.35);
 assert.equal(enemyTerrainReaction('heart','charge').damage,0);
 assert.equal(chooseEnemyKind(5,.1),'heart');
 assert.equal(chooseEnemyKind(2,.30),'leech');
 assert.ok(maxActiveAttackers([])>=3);
 assert.ok(maxActiveAttackers(Array.from({length:20}))<=5);
});
test('the added leech type survives saved-session migration without trusting attack internals',()=>{
 const run={v:4,seed:413,x:3,z:3,hp:100,maxHp:100,wave:3,
  enemies:[{type:'leech',x:5,z:3,hp:55,windup:999,attack:-999}],ruptured:[]};
 const safe=validateRun(run);
 assert.equal(safe.v,5);assert.equal(safe.enemies.length,1);
 assert.deepEqual(safe.enemies[0],{type:'leech',x:5,z:3,hp:55});
});
