import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMatch,tick,beginRound,chooseRune,validState,STEP} from '../core.mjs';
import module from '../server/module.ts';
test('rupture starts with ten minutes; classic duel remains unchanged',()=>{const a=makeMatch(12,'wire','kindle','rupture'),b=makeMatch(12);assert.equal(a.gameMode,'rupture');assert.equal(a.remaining,600);assert.equal(b.remaining,25);assert.ok(validState(a))});
test('deaths award points without ending rupture, and fighters respawn',()=>{const s=makeMatch(30,'wire','kindle','rupture');s.actors[0].hp=0;tick(s,{},STEP,{x:0,y:0,attack:false});assert.equal(s.phase,'fight');assert.equal(s.score[1],2);assert.ok(s.actors[0].respawn>0);for(let i=0;i<160;i++)tick(s,{},STEP,{x:0,y:0,attack:false});assert.ok(s.actors[0].hp>0);assert.equal(s.score[1],2)});
test('core control scores, contested center does not',()=>{const s=makeMatch(40,'wire','kindle','rupture');s.actors[0].x=200;s.actors[0].y=310;s.actors[1].x=340;s.actors[1].y=130;for(let i=0;i<481;i++)tick(s,{},STEP,{x:0,y:0,attack:false});assert.ok(s.score[0]>=1);const before=s.score[0];s.actors[1].x=201;s.actors[1].y=310;for(let i=0;i<480;i++)tick(s,{},STEP,{x:0,y:0,attack:false});assert.equal(s.score[0],before)});
test('evolution preserves points and allows rune without resetting time',()=>{const s=makeMatch(48,'wire','kindle','rupture');s.remaining=540+STEP/2;s.score[0]=7;tick(s,{},STEP,{x:0,y:0,attack:false});assert.equal(s.phase,'draft');assert.equal(s.round,2);assert.equal(s.score[0],7);assert.ok(chooseRune(s,s.pick[0]));assert.equal(s.phase,'build');const time=s.remaining;assert.ok(beginRound(s));assert.equal(s.phase,'fight');assert.equal(s.remaining,time);assert.equal(s.score[0],7)});
test('final collapse resolves score winner and tie by damage',()=>{const s=makeMatch(58,'wire','kindle','rupture');s.score=[10,7];s.remaining=STEP/2;s.nextEvolution=0;tick(s,{},STEP,{x:0,y:0,attack:false});assert.equal(s.phase,'result');assert.equal(s.champion,0);const b=makeMatch(59,'wire','kindle','rupture');b.score=[3,3];b.actors[1].hit=12;b.remaining=STEP/2;b.nextEvolution=0;tick(b,{},STEP,{x:0,y:0,attack:false});assert.equal(b.champion,1)});
test('host chooses mode; guest cannot change; rupture is default',()=>{const host={id:'a'},guest={id:'b'},s=module.createRoom({player:host}).state;module.onJoin({state:s,player:guest,players:[host,guest]});assert.equal(s.gameMode,'rupture');module.onMessage({state:s,player:guest,payload:{type:'mode',gameMode:'duel'}});assert.equal(s.gameMode,'rupture');module.onMessage({state:s,player:host,payload:{type:'mode',gameMode:'duel'}});assert.equal(s.gameMode,'duel');module.onMessage({state:s,player:host,payload:{type:'start'}});assert.equal(s.match.gameMode,'duel')});

test('all nine evolution steps preserve the ten-minute timeline and lead to final result',()=>{
 const s=makeMatch(219,'kindle','wire','rupture');
 for(let stage=2;stage<=10;stage++){
  s.remaining=s.nextEvolution+STEP/2;
  tick(s,{},STEP,{x:0,y:0,attack:false});
  assert.equal(s.phase,'draft',`stage ${stage} opens rune choice`);
  assert.equal(s.round,stage);
  assert.ok(s.pick.length>0);
  assert.ok(chooseRune(s,s.pick[0],s.actors[0].runes.length>=9?0:null),`stage ${stage} accepts an offered rune`);
  assert.equal(s.phase,'build');
  assert.ok(beginRound(s));
  assert.equal(s.phase,'fight');
  assert.equal(s.round,stage);
  assert.equal(s.actors[0].runes.length,Math.min(9,stage+1));
  assert.ok(validState(s),`stage ${stage} remains restorable`);
 }
 assert.equal(s.nextEvolution,0);
 s.score=[14,9];s.remaining=STEP/2;
 tick(s,{},STEP,{x:0,y:0,attack:false});
 assert.equal(s.phase,'result');
 assert.equal(s.champion,0);
});
test('online rupture is authoritative across timed draft and auto-restarts a stalled player',()=>{
 const host={id:'a'},guest={id:'b'};
 const s=module.createRoom({player:host}).state;
 module.onJoin({state:s,player:guest,players:[host,guest]});
 const send=(who,payload)=>module.onMessage({state:s,player:who,payload});
 send(host,{type:'start'});
 assert.equal(s.gameMode,'rupture');
 assert.equal(s.match.gameMode,'rupture');
 assert.equal(s.match.remaining,600);
 s.match.score[0]=9;s.match.remaining=540+STEP/2;s.at=Date.now()-120;
 send(host,{type:'input',round:1,seq:0,control:{x:0,y:0,aim:{x:200,y:310},attack:false,shield:false,dash:false}});
 assert.equal(s.phase,'draft');
 assert.equal(s.match.round,2);
 assert.equal(s.match.score[0],9);
 assert.ok(s.offers.every(a=>a.length>0));
 const before=s.match.remaining;
 s.draftAt=Date.now()-36_000;
 send(guest,{type:'sync'});
 assert.equal(s.phase,'fight');
 assert.equal(s.match.remaining,before);
 assert.equal(s.match.score[0],9);
 assert.equal(s.match.round,2);
 assert.equal(s.match.actors[0].runes.length,3);
 assert.equal(s.match.actors[1].runes.length,3);
});
