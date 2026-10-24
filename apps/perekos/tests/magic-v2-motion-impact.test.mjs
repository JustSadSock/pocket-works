import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMagicV2Practice,tick,STEP,validState,MAGIC_V2_PRACTICE_RUNES} from '../core.mjs';
import {applyMagicEdit,grantEarnedMagicRune,effectiveMagicForm,validateMagicState} from '../magic-v2-rules.mjs';

const aim={x:180,y:484};
const idle={x:0,y:0,attack:false,shield:false,dash:false,aim};
const advance=(s,c=idle)=>tick(s,c,STEP,idle);
function enchant(s,ids){
 let book=s.magicLoadouts[0];
 for(const [id,slot] of ids){
  const grant=grantEarnedMagicRune(book,id);assert.equal(grant.ok,true,grant.error);
  book=grant.state;
  const instance=book.reserve.at(-1);
  const edit=applyMagicEdit(book,{type:'equip',slot:1,instanceId:instance.instanceId,
   revision:book.revision,...(slot===undefined?{}:{action:slot})});
  assert.equal(edit.ok,true,edit.error);book=edit.state;
 }
 assert.equal(validateMagicState(book).ok,true);
 s.magicLoadouts[0]=book;s.phase='fight';return s;
}
const passive=(school,seed,...ids)=>enchant(makeMagicV2Practice(school,seed),
 [['u_reform_base'],...ids.map(id=>[id,0])]);
test('rubble is a physical capped hazard created by a real stone contact, then expires',()=>{
 const s=passive('stone',1811,'st_form_colossus','st_impact_rubble');
 assert.ok(MAGIC_V2_PRACTICE_RUNES.includes('st_impact_rubble'));
 assert.equal(effectiveMagicForm(s.magicLoadouts[0]).impact,'st_impact_rubble');
 s.actors[1].x=210;s.actors[1].y=484;
 advance(s,{...idle,attack:true});
 assert.ok(s.lobs.some(q=>q.v2Monolith&&q.v2Impact==='st_impact_rubble'));
 assert.equal(s.mines.filter(m=>m.v2Rubble).length,0,'no hidden early damage');
 for(let i=0;i<46;i++)advance(s);
 assert.ok(s.mines.some(m=>m.v2Rubble&&m.arm>=0&&m.r<=32));
 assert.ok(s.mines.filter(m=>m.v2Rubble).length<=3);
 for(let i=0;i<115;i++)advance(s);
 assert.equal(s.mines.filter(m=>m.v2Rubble).length,0);
 assert.equal(validState(s),true);
});
test('wildfire leaves bounded, line-of-sight checked burning petals after a comet',()=>{
 const s=passive('fire',1821,'fi_form_comet','fi_impact_wildfire');
 assert.equal(effectiveMagicForm(s.magicLoadouts[0]).impact,'fi_impact_wildfire');
 advance(s,{...idle,attack:true});
 assert.ok(s.lobs[0].v2Comet&&s.lobs[0].v2Impact==='fi_impact_wildfire');
 for(let i=0;i<40;i++)advance(s);
 const petals=s.mines.filter(m=>m.v2Wildfire);
 assert.ok(petals.length>=1&&petals.length<=3);
 assert.ok(petals.every(m=>m.r<=24&&m.arm>=0&&m.life<=1.65));
 for(let i=0;i<106;i++)advance(s);
 assert.equal(s.mines.filter(m=>m.v2Wildfire).length,0);
 assert.equal(validState(s),true);
});
test('orbit motion changes the actual storm projectile trajectory, also combined with sphere',()=>{
 for(const [seed,shape] of [[1831,null],[1832,'li_form_sphere']]){
  const s=passive('storm',seed,...(shape?[shape]:[]),'li_motion_orbit');
  const form=effectiveMagicForm(s.magicLoadouts[0]);
  assert.equal(form.motion,'li_motion_orbit');
  advance(s,{...idle,attack:true});
  const q=s.shots.find(x=>x.v2Orbit);
  assert.ok(q,'real shot must be orbital');
  assert.equal(!!q.v2Sphere,!!shape);
  const before=q.orbitAngle;
  for(let i=0;i<13;i++)advance(s);
  assert.ok(q.orbitAngle>before+.5,'orbit changes angle in fixed steps');
  assert.ok(Math.hypot(q.x-s.actors[0].x,q.y-s.actors[0].y)<55,
   'orbital motion is grounded in actor location');
  assert.equal(validState(s),true);
 }
});
test('chain impact needs a visible owned pylon and is throttled and capped',()=>{
 const make=(seed,hasNode)=>{
  const s=passive('storm',seed,'li_form_ray','li_impact_chain');
  s.actors[1].x=188;s.actors[1].y=484;
  if(hasNode)s.barriers.push({owner:0,x:164,y:530,r:12,life:4,
    hp:25,v2Pylon:true,nodeId:913});
  return s;
 };
 const linked=make(1841,true),solo=make(1842,false);
 for(const s of [linked,solo])advance(s,{...idle,attack:true});
 assert.ok(linked.beams.some(b=>b.v2Chain));
 assert.equal(solo.beams.filter(b=>b.v2Chain).length,0);
 assert.ok(linked.actors[1].hp<solo.actors[1].hp);
 assert.ok(linked.beams.filter(b=>b.v2Chain).length<=2);
 assert.ok(linked.actors[0].runeTimers['v2:chain-contact']>linked.ticks);
 assert.equal(validState(linked),true);
});
test('new contact and motion aspects remain typed, school-bound, and limited to two HOW',()=>{
 for(const id of ['st_impact_rubble','fi_impact_wildfire','li_impact_chain','li_motion_orbit'])
  assert.ok(MAGIC_V2_PRACTICE_RUNES.includes(id),id);
 const stone=makeMagicV2Practice('stone').magicLoadouts[0];
 const fire=makeMagicV2Practice('fire').magicLoadouts[0];
 assert.equal(grantEarnedMagicRune(stone,'fi_impact_wildfire').ok,false);
 assert.equal(grantEarnedMagicRune(fire,'li_motion_orbit').ok,false);
 const s=passive('stone',1851,'st_form_wave','st_impact_rubble');
 const granted=grantEarnedMagicRune(s.magicLoadouts[0],'st_origin_below');
 assert.equal(granted.ok,true);
 const b=granted.state,item=b.reserve.at(-1);
 const rejected=applyMagicEdit(b,{type:'equip',slot:1,instanceId:item.instanceId,
  revision:b.revision,action:0});
 assert.equal(rejected.ok,false,'must not permit three HOW in any passive book');
 assert.equal(validState(s),true);
});
