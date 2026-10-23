import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 createMagicLoadout,validateMagicSpell,validateMagicState,permittedRune,
 availableMagicRunes,grantEarnedMagicRune,applyMagicEdit,compileMagic,
 effectiveMagicForm,dealMagicOffers,claimMagicOffer,
 previewLegacyMagic,migrateLegacyMagic,MAGIC_RUNE_INDEX
} from '../magic-v2-rules.mjs';
import {MAGIC_RUNES,MAGIC_TRANSFORMS} from '../magic-v2-data.mjs';

const source=JSON.parse(readFileSync(new URL('../design/magic-v2-catalog.json',import.meta.url),'utf8'));
const newer=(s,type,slot,fields={})=>applyMagicEdit(s,{type,slot,revision:s.revision,...fields});
function collect(s,id){
 const granted=grantEarnedMagicRune(s,id);
 assert.equal(granted.ok,true,granted.error);
 return {state:granted.state,instanceId:granted.state.reserve.find(r=>r.defId===id).instanceId};
}
function equip(s,id,slot,action){
 const got=collect(s,id);
 const done=newer(got.state,'equip',slot,{instanceId:got.instanceId,...(action==null?{}:{action})});
 assert.equal(done.ok,true,done.error);
 return done.state;
}
function passive(s,shape,origin=null,slot=1){
 s=equip(s,'u_reform_base',slot);
 s=equip(s,shape,slot,0);
 if(origin)s=equip(s,origin,slot,0);
 return s;
}
test('runtime catalog is exactly the documented 92 school-only cards and has no cross-school conversions',()=>{
 assert.equal(MAGIC_RUNES.length,92);
 assert.deepEqual(MAGIC_RUNES,source.runes);
 assert.deepEqual(MAGIC_TRANSFORMS,source.transforms);
 for(const school of ['stone','fire','storm']){
  assert.equal(availableMagicRunes(school).length,44);
  for(const r of availableMagicRunes(school))assert.ok(r.school==='common'||r.school===school);
  for(const foreign of ['stone','fire','storm'].filter(s=>s!==school)){
   assert.equal(permittedRune(school,source.runes.find(r=>r.school===foreign).id),false);
  }
 }
 assert.equal(permittedRune('stone','as_storm'),false);
 assert.equal(MAGIC_RUNE_INDEX.get('u_on_cast').rarity,'epic');
 assert.equal(MAGIC_RUNE_INDEX.get('u_on_hit').rarity,'common');
});
test('three distinct starting schools are playable spell grammars with defense/mobility/attack starts',()=>{
 for(const school of ['stone','fire','storm'])for(const starter of ['attack','mobility','defense']){
  const s=createMagicLoadout(school,{seed:29,starter});
  assert.equal(validateMagicState(s).ok,true);
  assert.equal(s.slots.length,3);
  assert.equal(s.slots[0].actions.length,1);
  assert.equal(s.reserve.length,0);
  assert.equal(compileMagic(s).length,1);
  assert.equal(s.slots[1].when,null);
  assert.equal(s.slots[2].actions.length,0);
 }
 assert.throws(()=>createMagicLoadout('ice'),RangeError);
});
test('server-owned grants reject foreign/unknown cards and distinguish separate earned copies',()=>{
 const s=createMagicLoadout('stone');
 for(const id of ['fi_ember','li_spark','as_storm','not_real']){
  const attempt=grantEarnedMagicRune(s,id);
  assert.equal(attempt.ok,false);
  assert.equal(attempt.state,s);
 }
 const extraGuard=collect(s,'u_guard');
 assert.notEqual(extraGuard.instanceId,s.slots[0].actions[0].rune.instanceId);
 const got=collect(s,'st_form_wave');
 assert.equal(got.state.reserve.length,1);
 const second=collect(got.state,'st_form_wave');
 assert.notEqual(got.instanceId,second.instanceId);
 assert.equal(validateMagicState(second.state).ok,true);
});
test('one WHEN, two DO and two HOW is the limit per independent slot',()=>{
 let s=createMagicLoadout('stone');
 s=equip(s,'u_on_hit',1);
 s=equip(s,'st_shards',1);
 s=equip(s,'st_wall',1);
 s=equip(s,'u_size',1,0);
 s=equip(s,'u_duration',1,1);
 assert.equal(validateMagicState(s).ok,true);
 assert.equal(s.slots[1].actions.length,2);
 assert.equal(s.slots[1].actions[0].mods[0].defId,'u_size');
 assert.equal(s.slots[1].actions[1].mods[0].defId,'u_duration');
 assert.equal(compileMagic(s).find(x=>x.slotId===1).actions.length,2);
 for(const [id,index] of [['u_range',0],['st_mass',1],['st_shards',0]]){
  // Granting a spare rune succeeds but equipping into the full spell does not.
  const exists=s.reserve.some(r=>r.defId===id)||[...s.slots[1].actions].some(a=>a.rune.defId===id);
  if(exists)continue;
  const got=collect(s,id);
  const attempted=newer(got.state,'equip',1,{instanceId:got.instanceId,...(id==='st_shards'?{}:{action:index})});
  assert.equal(attempted.ok,false);
  s=got.state;
 }
});
test('extra trigger, missing action attachment and unsuitable modifiers are rejected',()=>{
 let s=createMagicLoadout('fire');
 s=equip(s,'u_on_hit',1);
 let got=collect(s,'u_after_dash');
 assert.equal(newer(got.state,'equip',1,{instanceId:got.instanceId}).ok,false);
 s=got.state;
 got=collect(s,'fi_form_comet');
 assert.equal(newer(got.state,'equip',1,{instanceId:got.instanceId,action:0}).ok,false);
 s=got.state;
 s=equip(s,'u_guard',1);
 assert.equal(newer(s,'equip',1,{instanceId:got.instanceId,action:0}).ok,false);
});
test('removing a DO returns its modifiers to the reserve, without stealing sealed runes',()=>{
 let s=createMagicLoadout('stone');
 s=equip(s,'u_on_hit',1);
 s=equip(s,'st_shards',1);
 s=equip(s,'u_size',1,0);
 const removed=s.slots[1].actions[0].rune.instanceId;
 const r=newer(s,'unequip',1,{instanceId:removed});
 assert.equal(r.ok,true,r.error);
 assert.ok(r.state.reserve.some(x=>x.instanceId===removed));
 assert.ok(r.state.reserve.some(x=>x.defId==='u_size'));
 assert.equal(r.state.slots[1].actions.length,0);
});
test('passive stone form compiles without trigger, creates physical shape+origin, and can be sealed',()=>{
 let s=passive(createMagicLoadout('stone'),'st_form_wave','st_origin_self');
 assert.deepEqual(effectiveMagicForm(s),{
  ok:true,school:'stone',shape:'st_form_wave',origin:'st_origin_self',motion:null,impact:null
 });
 const active=compileMagic(s).find(x=>x.slotId===1);
 assert.equal(active.trigger,null);
 assert.equal(active.actions[0].mods.length,2);
 const sealed=newer(s,'seal',1,{nonce:'stone-form-1'});
 assert.equal(sealed.ok,true,sealed.error);
 assert.equal(sealed.state.sealed.length,1);
 assert.equal(sealed.state.slots[1].actions.length,0);
 assert.equal(compileMagic(sealed.state).filter(x=>x.sealed).length,1);
 assert.equal(effectiveMagicForm(sealed.state).shape,'st_form_wave');
 assert.equal(newer(sealed.state,'unequip',1,{instanceId:s.slots[1].actions[0].rune.instanceId}).ok,false);
 assert.equal(newer(sealed.state,'seal',1).ok,false);
 assert.equal(applyMagicEdit(sealed.state,{type:'seal',slot:1,revision:s.revision}).ok,false);
 assert.equal(sealed.state.nonces.includes('stone-form-1'),true);
});
test('the simulator-facing grammar prevents stale revisions and duplicate action packets',()=>{
 let s=createMagicLoadout('fire');
 s=equip(s,'u_on_hit',1);
 s=equip(s,'fi_ember',1);
 const first=newer(s,'seal',1,{nonce:'seal_once'});
 assert.equal(first.ok,true);
 assert.equal(applyMagicEdit(first.state,{type:'seal',slot:1,revision:first.state.revision,nonce:'seal_once'}).ok,false);
 assert.equal(first.state.sealed.length,1);
 assert.equal(first.state.slots[1].actions.length,0);
 const old=applyMagicEdit(first.state,{type:'equip',slot:1,revision:1,instanceId:77});
 assert.equal(old.ok,false);
 assert.equal(old.state,first.state);
});
test('conflicting sealed transformation cannot be overwritten by a newly equipped form',()=>{
 let s=passive(createMagicLoadout('stone'),'st_form_wave');
 const done=newer(s,'seal',1);
 assert.equal(done.ok,true);
 s=done.state;
 s=equip(s,'u_reform_base',2);
 const got=collect(s,'st_form_colossus');
 const bad=newer(got.state,'equip',2,{instanceId:got.instanceId,action:0});
 assert.equal(bad.ok,false);
 assert.match(bad.error,/Несовместимые/);
 assert.equal(effectiveMagicForm(got.state).shape,'st_form_wave');
});
test('forbidden physical pair and conflicting shapes are rejected before seal',()=>{
 let s=passive(createMagicLoadout('fire'),'fi_form_comet');
 const got=collect(s,'fi_origin_self');
 const fail=newer(got.state,'equip',1,{instanceId:got.instanceId,action:0});
 assert.equal(fail.ok,false);
 const storm=passive(createMagicLoadout('storm'),'li_form_sphere','li_motion_orbit');
 assert.equal(effectiveMagicForm(storm).motion,'li_motion_orbit');
});
test('incomplete commands never equip empty passive spells or seal incomplete chains',()=>{
 let s=createMagicLoadout('storm');
 s=equip(s,'u_reform_base',1);
 assert.equal(newer(s,'seal',1).ok,false);
 const got=collect(s,'li_form_ray');
 assert.equal(newer(got.state,'equip',1,{instanceId:got.instanceId,action:1}).ok,false);
 s=newer(got.state,'equip',1,{instanceId:got.instanceId,action:0}).state;
 assert.equal(newer(s,'seal',1).ok,true);
});
test('minute draft is seed-repeatable, constrained to own school and claims server-issued offers',()=>{
 const original=createMagicLoadout('fire',{seed:123});
 for(const minute of [1,4,7]){
  const a=dealMagicOffers(original,minute),b=dealMagicOffers(original,minute);
  assert.equal(a.ok,true,a.error);
  assert.deepEqual(a.state.offers,b.state.offers);
  assert.ok(a.state.offers.length>=1);
  assert.ok(a.state.offers.every(id=>permittedRune('fire',id)));
  assert.equal(new Set(a.state.offers).size,a.state.offers.length);
  assert.equal(claimMagicOffer(a.state,'st_throw',a.state.revision).ok,false);
  assert.equal(claimMagicOffer(a.state,a.state.offers[0],a.state.revision-1).ok,false);
  const claimed=claimMagicOffer(a.state,a.state.offers[0],a.state.revision);
  assert.equal(claimed.ok,true);
  assert.equal(claimed.state.offers.length,0);
  assert.equal(claimed.state.reserve.length,1);
  assert.equal(validateMagicState(claimed.state).ok,true);
 }
 assert.equal(dealMagicOffers(original,10).ok,false);
});
test('legacy migration is explicit, preserves original source and reports unsupported relics',()=>{
 const old={mageId:'slate',archetype:'distorter',runes:['on_hurt','armor','on_hit','ball','as_storm','as_fire','bounce'],x:90};
 const preview=previewLegacyMagic(old);
 assert.equal(preview.supported,true);
 assert.equal(preview.school,'stone');
 assert.ok(preview.mapped.some(x=>x.to==='st_throw'));
 assert.ok(preview.unmapped.includes('as_storm'));
 assert.ok(preview.unmapped.includes('as_fire'));
 assert.equal(migrateLegacyMagic(old).state,null);
 const done=migrateLegacyMagic(old,{confirmed:true});
 assert.equal(done.ok,true);
 assert.equal(validateMagicState(done.state).ok,true);
 assert.equal(done.state.school,'stone');
 assert.deepEqual(old.runes,['on_hurt','armor','on_hit','ball','as_storm','as_fire','bounce']);
 assert.equal(done.state.slots[0].when.defId,'u_on_hurt');
 assert.ok(done.state.reserve.some(x=>x.defId==='st_throw'));
});

test('malformed network state fails validation instead of crashing the spell server',()=>{
 const valid=createMagicLoadout('fire');
 for(const mutated of [
  {...valid,slots:[null,valid.slots[1],valid.slots[2]]},
  {...valid,slots:[{id:0,when:null,actions:[null]},valid.slots[1],valid.slots[2]]},
  {...valid,slots:[{id:0,when:null,actions:[{rune:null,mods:[]}]},valid.slots[1],valid.slots[2]]},
  {...valid,slots:[{id:0,when:null,actions:[{rune:{defId:'u_guard',instanceId:123},mods:null}]},valid.slots[1],valid.slots[2]]}
 ]){
  assert.doesNotThrow(()=>validateMagicState(mutated));
  assert.equal(validateMagicState(mutated).ok,false);
  assert.equal(applyMagicEdit(mutated,{type:'seal',slot:0,revision:valid.revision}).ok,false);
 }
});
test('sealing a common rune frees that definition for future offers without duping its instance',()=>{
 let s=createMagicLoadout('stone');
 s=equip(s,'u_on_hit',1);s=equip(s,'st_shards',1);
 const sealed=newer(s,'seal',1);
 assert.equal(sealed.ok,true);
 const offered=dealMagicOffers(sealed.state,7);
 assert.equal(offered.ok,true);
 assert.ok(offered.state.offers.every(x=>permittedRune('stone',x)));
 assert.equal(validateMagicState(offered.state).ok,true);
});
