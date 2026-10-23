import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMatch,makeMagicV2Practice,MAGIC_V2_PRACTICE_RUNES,tick,stats,validState,STEP} from '../core.mjs';
import {MAGIC_RUNE_INDEX,applyMagicEdit,grantEarnedMagicRune,validateMagicState,compileMagic} from '../magic-v2-rules.mjs';

const neutral={x:0,y:0,attack:false,shield:false,dash:false,aim:{x:300,y:220}};
function put(s,id,slot,action){
 const granted=grantEarnedMagicRune(s.magicLoadouts[0],id);
 assert.equal(granted.ok,true,granted.error);
 const reserve=granted.state.reserve.at(-1);
 const put=applyMagicEdit(granted.state,{
  type:'equip',slot,revision:granted.state.revision,
  instanceId:reserve.instanceId,...(action==null?{}:{action})
 });
 assert.equal(put.ok,true,put.error);
 s.magicLoadouts[0]=put.state;
}
test('v2 real training: three schools share HP and movement but fire different native projectile shapes',()=>{
 const styles={stone:'rock',fire:'orb',storm:'bolt'};
 const schools=['stone','fire','storm'];
 for(const school of schools){
  const s=makeMagicV2Practice(school,2029);
  assert.equal(s.phase,'build');
  assert.equal(s.gameMode,'forge');
  assert.equal(s.magicSchool,school);
  assert.equal(validState(s),true);
  assert.equal(stats(s.actors[0]).max,100);
  assert.equal(stats(s.actors[0]).speed,125);
  assert.equal(stats(s.actors[0]).shield,34);
  assert.equal(s.actors[0].runes.length,0,'legacy compiler must stay inert');
  s.phase='fight';
  tick(s,{...neutral,attack:true,aim:{x:335,y:133}});
  assert.ok(s.shots.length>0,school+' must fire real shots');
  assert.equal(s.shots[0].style,styles[school]);
  assert.equal(s.shots[0].element,school);
  assert.equal(validState(s),true);
  assert.equal(s.elementCombos[0],0,'never invoke cross-school chemistry');
 }
});
test('v2 real training: a cast-triggered defensive rune changes actor shield with heat/cooldown',()=>{
 const s=makeMagicV2Practice('storm');s.phase='fight';
 put(s,'u_on_cast',1);put(s,'u_guard',1);
 let first;
 tick(s,{...neutral,attack:true,aim:{x:200,y:300}});first=s.actors[0].shield;
 assert.ok(first>=14,'shield effect was executed by the live tick');
 assert.ok(s.reactions>=1);
 const before=s.actors[0].shield;
 tick(s,{...neutral,attack:false});
 assert.equal(s.actors[0].shield,before,'no invisible auto-trigger');
 assert.equal(validState(s),true);
});
test('v2 real training: sealed casts remain active after edit slot is freed',()=>{
 const s=makeMagicV2Practice('stone');s.phase='build';
 put(s,'u_on_cast',1);put(s,'u_guard',1);
 const sealed=applyMagicEdit(s.magicLoadouts[0],{type:'seal',slot:1,revision:s.magicLoadouts[0].revision,nonce:'seal-1'});
 assert.equal(sealed.ok,true,sealed.error);
 s.magicLoadouts[0]=sealed.state;
 assert.equal(s.magicLoadouts[0].slots[1].actions.length,0);
 assert.equal(compileMagic(s.magicLoadouts[0]).filter(c=>c.sealed).length,1);
 s.phase='fight';tick(s,{...neutral,attack:true});
 assert.ok(s.actors[0].shield>=14,'sealed action must execute in world simulation');
 assert.equal(validState(s),true);
});
test('v2 real training: impact-triggered school rune uses real collision geometry',()=>{
 const s=makeMagicV2Practice('fire');s.phase='fight';
 // Actual fire starter is WHEN HIT -> secondary ember, not decoration.
 s.actors[0].x=90;s.actors[0].y=470;
 s.actors[1].x=175;s.actors[1].y=470;
 const before=s.actors[1].hp;
 for(let i=0;i<58;i++)tick(s,{...neutral,attack:i===0,aim:{x:175,y:470}},STEP);
 assert.ok(s.actors[1].hp<before,'a real hit must reduce HP');
 assert.ok(s.actors[0].heat>0);
 assert.equal(s.elementCombos[0],0);
 assert.equal(validState(s),true);
});
test('v2 real training: editable rune inventory is intentionally restricted to implemented effects',()=>{
 assert.equal(new Set(MAGIC_V2_PRACTICE_RUNES).size,MAGIC_V2_PRACTICE_RUNES.length);
 for(const id of MAGIC_V2_PRACTICE_RUNES)assert.ok(MAGIC_RUNE_INDEX.has(id),id);
 const old=makeMatch(33);assert.equal(old.magicModeV2,undefined);
 assert.equal(old.version,4);
});
test('v2 saved training loadout survives JSON roundtrip, invalid foreign magic is rejected',()=>{
 const s=makeMagicV2Practice('fire');s.phase='fight';
 put(s,'u_on_cast',1);put(s,'fi_scorch',1);
 const restored=JSON.parse(JSON.stringify(s));
 assert.equal(validState(restored),true);
 assert.equal(validateMagicState(restored.magicLoadouts[0]).ok,true);
 restored.magicLoadouts[0].school='stone';
 assert.equal(validState(restored),false);
});
