import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMagicV2Practice,tick,STEP,validState,MAGIC_V2_PRACTICE_RUNES} from '../core.mjs';
import {applyMagicEdit,grantEarnedMagicRune,validateMagicState} from '../magic-v2-rules.mjs';
const silent={x:0,y:0,attack:false,shield:false,dash:false,aim:{x:320,y:484}};
function prepare(s,action){
 let b=s.magicLoadouts[0];
 for(const id of ['u_on_cast',action]){
  const granted=grantEarnedMagicRune(b,id);assert.equal(granted.ok,true,granted.error);
  b=granted.state;
  const inst=b.reserve.at(-1);
  const edit=applyMagicEdit(b,{type:'equip',slot:1,instanceId:inst.instanceId,revision:b.revision});
  assert.equal(edit.ok,true,edit.error);b=edit.state;
 }
 assert.equal(validateMagicState(b).ok,true);
 s.magicLoadouts[0]=b;s.phase='fight';
 s.actors[1].x=325;s.actors[1].y=130;
 return s;
}
const advance=(s,controls=silent)=>tick(s,controls,STEP,silent);
test('each new physical rune is a real owned, school-restricted spell, not a placeholder',()=>{
 const expected={stone:'st_spikes',fire:'fi_cindermine',storm:'li_discharge'};
 for(const [school,id] of Object.entries(expected)){
  assert.ok(MAGIC_V2_PRACTICE_RUNES.includes(id));
  const s=prepare(makeMagicV2Practice(school,100),id);
  assert.equal(validState(s),true);
  advance(s,{...silent,attack:true});
  assert.ok(s.reactions>=1,id+' must run in fixed step');
  assert.equal(validState(s),true);
 }
 assert.equal(grantEarnedMagicRune(makeMagicV2Practice('stone').magicLoadouts[0],'li_discharge').ok,false);
});
test('st_spikes lays three sequential, warned ground spikes with finite lifetime',()=>{
 const s=prepare(makeMagicV2Practice('stone',101),'st_spikes');
 advance(s,{...silent,attack:true});
 const spikes=s.waves.filter(w=>w.v2Spikes);
 assert.equal(spikes.length,3,'unobstructed path should carry three spikes');
 assert.ok(spikes.every(w=>w.v2Element==='stone'&&w.damage===6.5&&w.warmup>0));
 assert.ok(spikes[0].x<spikes[1].x&&spikes[1].x<spikes[2].x);
 assert.ok(spikes[0].warmup<spikes[2].warmup);
 for(let i=0;i<100;i++)advance(s);
 assert.equal(s.waves.filter(w=>w.v2Spikes).length,0,'spikes expire');
 assert.equal(validState(s),true);
});
test('st_spikes cannot materialize behind opponent temporary cover',()=>{
 const s=prepare(makeMagicV2Practice('stone',102),'st_spikes');
 s.barriers.push({owner:1,x:95,y:484,r:20,life:4,hp:35});
 advance(s,{...silent,attack:true});
 assert.equal(s.waves.filter(w=>w.v2Spikes).length,0);
 assert.equal(validState(s),true);
});
test('fi_cindermine remains harmless while arming, triggers after contact, then disappears',()=>{
 const s=prepare(makeMagicV2Practice('fire',103),'fi_cindermine');
 advance(s,{...silent,attack:true});
 const mine=s.mines.find(m=>m.v2Trap);
 assert.ok(mine,'a mine is placed');
 assert.ok(mine.arm>.45&&mine.life>3);
 // Only the planted mine is under test, not the independently fired default bolt.
 s.shots.length=0;
 s.actors[1].x=mine.x;s.actors[1].y=mine.y;
 const hp=s.actors[1].hp;
 for(let i=0;i<20;i++)advance(s);
 assert.equal(s.actors[1].hp,hp,'the mine cannot strike before arming completes');
 for(let i=0;i<35;i++)advance(s);
 assert.ok(s.actors[1].hp<hp,'mine deals real damage after countdown');
 assert.equal(s.mines.some(m=>m.v2Trap),false,'single-use mine disappears');
 assert.equal(validState(s),true);
});
test('li_discharge creates three physical short arcs with normalized total damage',()=>{
 const s=prepare(makeMagicV2Practice('storm',104),'li_discharge');
 advance(s,{...silent,attack:true});
 const arcs=s.shots.filter(q=>q.style==='bolt'&&Math.abs(q.damage-17/3)<.01);
 assert.equal(arcs.length,3);
 assert.ok(arcs[0].vy<arcs[1].vy&&arcs[1].vy<arcs[2].vy,'real directional fan');
 assert.ok(Math.abs(arcs.reduce((v,q)=>v+q.damage,0)-17)<.01);
 assert.ok(arcs.every(q=>q.life<.5&&q.element==='storm'));
 for(let i=0;i<45;i++)advance(s);
 assert.equal(s.shots.filter(q=>Math.abs(q.damage-17/3)<.01).length,0);
 assert.equal(validState(s),true);
});
