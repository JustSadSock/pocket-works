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

test('st_fault is a slow, covered, sequential ground rupture with a visible warning',()=>{
 const s=prepare(makeMagicV2Practice('stone',111),'st_fault');
 advance(s,{...silent,attack:true});
 const cracks=s.waves.filter(w=>w.v2Fault);
 assert.equal(cracks.length,3);
 assert.ok(cracks.every(w=>w.v2Element==='stone'&&w.damage===5&&w.warmup>0));
 assert.ok(cracks[0].warmup<cracks[1].warmup&&cracks[1].warmup<cracks[2].warmup);
 assert.ok(cracks[0].x<cracks[1].x&&cracks[1].x<cracks[2].x);
 for(let i=0;i<95;i++)advance(s);
 assert.equal(s.waves.filter(w=>w.v2Fault).length,0);
 const covered=prepare(makeMagicV2Practice('stone',112),'st_fault');
 covered.barriers.push({owner:1,x:103,y:484,r:20,life:4,hp:35});
 advance(covered,{...silent,attack:true});
 assert.equal(covered.waves.filter(w=>w.v2Fault).length,0,'cannot jump enemy cover');
 assert.equal(validState(s)&&validState(covered),true);
});
test('fi_lash is a short actual fire beam that burns only through unobstructed space',()=>{
 const s=prepare(makeMagicV2Practice('fire',121),'fi_lash');
 s.actors[1].x=157;s.actors[1].y=484;
 advance(s,{...silent,attack:true});
 const lash=s.beams.find(b=>b.v2Lash);
 assert.ok(lash&&lash.element==='fire'&&lash.length>90);
 assert.ok(s.actors[1].hp<100&&s.actors[1].burn>0);
 const shielded=prepare(makeMagicV2Practice('fire',122),'fi_lash');
 shielded.actors[0].x=69;shielded.actors[0].y=210;
 shielded.actors[1].x=214;shielded.actors[1].y=210;
 const hp=shielded.actors[1].hp;
 advance(shielded,{...silent,aim:{x:300,y:210},attack:true});
 assert.ok(shielded.beams.find(b=>b.v2Lash).length<45,'solid arena wall clips lash');
 assert.equal(shielded.actors[1].hp,hp,'no hit behind a wall');
 assert.equal(shielded.actors[1].burn,0,'no burn through a wall');
 assert.equal(validState(s)&&validState(shielded),true);
});
test('li_coil arms visibly, discharges once and drains shield before slowing the victim',()=>{
 const s=prepare(makeMagicV2Practice('storm',131),'li_coil');
 advance(s,{...silent,attack:true});
 const charge=s.mines.find(m=>m.v2Charge);
 assert.ok(charge&&charge.element==='storm'&&charge.arm>.45);
 assert.ok(charge.life>=4&&charge.r>=35);
 s.shots.length=0;
 s.actors[1].x=charge.x;s.actors[1].y=charge.y;s.actors[1].shield=12;
 for(let i=0;i<21;i++)advance(s);
 assert.equal(s.actors[1].hp,100,'unarmed charge cannot hit');
 for(let i=0;i<27;i++)advance(s);
 assert.ok(s.actors[1].hp<100,'charge really depletes shield and damages HP');
 assert.ok(s.actors[1].slow>0,'surviving victim is slowed');
 assert.ok(!s.mines.some(m=>m.v2Charge),'charge detonates at most once');
 assert.equal(validState(s),true);
});
