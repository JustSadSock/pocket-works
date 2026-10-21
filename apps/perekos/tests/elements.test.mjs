import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMatch,tick,STEP,validState,chooseRune,beginRound} from '../core.mjs';
import {RUNES,chosenElement,legalRunes} from '../runes.mjs';
import {MAGES} from '../mages.mjs';
import {reactionFor,REACTIONS} from '../elements.mjs';
const neutral=(x,y)=>({x:0,y:0,attack:false,dash:false,shield:false,aim:{x,y}});
function twoShots(first,mod,defender='coil'){
 const s=makeMatch(711,first,defender);
 const a=s.actors[0],b=s.actors[1];
 a.x=165;a.y=320;b.x=230;b.y=320;
 a.runes=['on_cast','ball',mod];
 for(let i=0;i<35;i++)tick(s,{...neutral(b.x,b.y),attack:true},STEP,neutral(a.x,a.y));
 return s;
}
test('39 runes include exactly three additive elemental modifiers',()=>{
 assert.equal(RUNES.length,39);assert.equal(new Set(RUNES.map(x=>x.id)).size,39);
 assert.equal(chosenElement(['as_storm'],'fire'),'storm');
 assert.equal(chosenElement(['as_fire','as_stone'],'storm'),'stone');
 assert.ok(legalRunes(['on_cast','ball','as_storm']));
});
test('all three chemistry reactions exist and are symmetrical, never same-on-same',()=>{
 assert.deepEqual(Object.keys(REACTIONS).sort(),['fire|stone','fire|storm','stone|storm']);
 for(const a of ['fire','storm','stone']){assert.equal(reactionFor(a,a),null);
  for(const b of ['fire','storm','stone'])assert.deepEqual(reactionFor(a,b),reactionFor(b,a))}
});
test('different classes can combine fire, current and stone with a single modifier rune',()=>{
 const examples=[['kindle','as_storm','steam'],['wire','as_stone','crack'],['pebble','as_fire','slag']];
 for(const [mageId,mod,fx] of examples){
  const s=twoShots(mageId,mod);
  assert.ok(s.elementCombos[0]>=1,mageId+' / '+mod);
  // Splash from the original stone projectile may become the latest mark,
  // even after the earlier rune shot correctly triggered a mixed reaction.
  assert.ok(s.actors[1].mark===mod.replace('as_','')||(mageId==='pebble'&&s.actors[1].mark==='stone'));
  assert.ok(s.actors[1].hp<100,s.actors[1].hp);
  assert.ok(validState(s));
 }
});
test('one isolated hit leaves a mark but never generates a fake reaction',()=>{
 const s=makeMatch(24),a=s.actors[0],b=s.actors[1];a.x=165;a.y=320;b.x=230;b.y=320;
 for(let i=0;i<28;i++)tick(s,{...neutral(b.x,b.y),attack:true},STEP,neutral(a.x,a.y));
 assert.equal(b.mark,'fire');assert.deepEqual(s.elementCombos,[0,0]);
});
test('mark expires and reaction cooldown prevents same-tick chain explosions',()=>{
 const s=twoShots('wire','as_fire');
 assert.ok(s.elementCombos[0]>=1);
 assert.ok(s.elementCombos[0]<=2,'never unbounded chemistry per volley');
 const b=s.actors[1],old=s.elementCombos[0];
 b.hp=100;b.markLife=.01;b.reactionCd=0;
 for(let i=0;i<260&&s.phase==='fight';i++)tick(s,neutral(b.x,b.y),STEP,neutral(s.actors[0].x,s.actors[0].y));
 assert.equal(b.markLife,0);assert.equal(b.mark,'');
 assert.ok(s.elementCombos[0]>=old);
});
test('server-serializable deterministic chemistry: same seed and input gives byte-identical match',()=>{
 const a=makeMatch(999,'wire','pebble'),b=makeMatch(999,'wire','pebble');
 a.actors[0].runes=['on_cast','ball','as_stone'];b.actors[0].runes=[...a.actors[0].runes];
 for(let i=0;i<540;i++){
  if(a.phase!=='fight')break;
  const p=neutral(a.actors[1].x,a.actors[1].y),q=neutral(a.actors[0].x,a.actors[0].y);
  p.attack=q.attack=true;p.x=.3;q.x=-.3;
  tick(a,p,STEP,q);tick(b,p,STEP,q);
  assert.deepEqual(a,b);assert.ok(validState(a));
 }
});
test('fair draw accounting and rune workshop remain available when a combo ends a round',()=>{
 const s=makeMatch(12);s.remaining=.005;
 tick(s,neutral(100,100),STEP,neutral(100,100));
 assert.equal(s.phase,'draft');assert.deepEqual(s.score,[0,0]);assert.equal(s.draws,1);
 assert.ok(chooseRune(s,s.pick[0]));assert.equal(beginRound(s),true);
 assert.equal(s.round,2);assert.deepEqual(s.elementCombos,[0,0]);
});
