import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMagicV2Practice,tick,STEP,validState,MAGIC_V2_PRACTICE_RUNES} from '../core.mjs';
import {applyMagicEdit,grantEarnedMagicRune,effectiveMagicForm,validateMagicState} from '../magic-v2-rules.mjs';

const controls={x:0,y:0,attack:false,shield:false,dash:false,aim:{x:320,y:484}};
const step=(s,c=controls)=>tick(s,c,STEP,controls);
function equip(s,ids){
 let b=s.magicLoadouts[0];
 for(const [id,action] of ids){
  const add=grantEarnedMagicRune(b,id);assert.equal(add.ok,true,add.error);b=add.state;
  const item=b.reserve.at(-1);
  const edit=applyMagicEdit(b,{type:'equip',slot:1,instanceId:item.instanceId,revision:b.revision,
   ...(action===undefined?{}:{action})});
  assert.equal(edit.ok,true,edit.error);b=edit.state;
 }
 assert.equal(validateMagicState(b).ok,true);s.magicLoadouts[0]=b;s.phase='fight';return s;
}
function shape(s,id,origin){
 return equip(s,[['u_reform_base'],[id,0],...(origin?[[origin,0]]:[])]);
}
test('stone monolith lands on server-projected spot, deals real AoE and becomes temporary cover',()=>{
 const s=shape(makeMagicV2Practice('stone',1701),'st_form_colossus','st_origin_below');
 assert.ok(MAGIC_V2_PRACTICE_RUNES.includes('st_form_colossus'));
 s.actors[1].x=229;s.actors[1].y=484;
 step(s,{...controls,attack:true});
 assert.equal(effectiveMagicForm(s.magicLoadouts[0]).shape,'st_form_colossus');
 const lob=s.lobs.find(q=>q.v2Monolith);
 assert.ok(lob&&lob.duration>.65&&lob.apex>75&&lob.radius>30);
 assert.equal(s.barriers.length,0,'falling monument must warn rather than instantly block');
 for(let i=0;i<56;i++)step(s);
 assert.ok(s.actors[1].hp<100,'landing damages exposed opponent');
 const wall=s.barriers.find(b=>b.v2Monolith);
 assert.ok(wall&&wall.hp>=35&&wall.life>2,'landing becomes physical cover');
 assert.equal(validState(s),true);
 for(let i=0;i<240;i++)step(s);
 assert.ok(!s.barriers.some(b=>b.v2Monolith),'cover expires');
});
test('comet has a marked delayed impact, inflicts burn, then leaves finite damaging ground',()=>{
 const s=shape(makeMagicV2Practice('fire',1702),'fi_form_comet','fi_origin_sky');
 assert.ok(MAGIC_V2_PRACTICE_RUNES.includes('fi_form_comet'));
 s.actors[1].x=238;s.actors[1].y=484;
 step(s,{...controls,attack:true});
 const lob=s.lobs.find(q=>q.v2Comet);
 assert.ok(lob&&lob.duration>.75&&lob.apex>100);
 const before=s.actors[1].hp;
 for(let i=0;i<12;i++)step(s);
 assert.equal(s.actors[1].hp,before,'warning has no immediate impact damage');
 for(let i=0;i<43;i++)step(s);
 assert.ok(s.actors[1].hp<before,'impact must hurt exposed opponent');
 assert.ok(s.mines.some(m=>m.v2Crater),'impact spawns authoritative hazard');
 for(let i=0;i<170;i++)step(s);
 assert.ok(!s.mines.some(m=>m.v2Crater),'crater must expire');
 assert.equal(validState(s),true);
});
test('electric network is two destructible nodes with timed LOS-checked crossing damage',()=>{
 const s=equip(makeMagicV2Practice('storm',1703),[['u_on_cast'],['li_pylon'],['li_link']]);
 assert.ok(MAGIC_V2_PRACTICE_RUNES.includes('li_pylon'));
 assert.ok(MAGIC_V2_PRACTICE_RUNES.includes('li_link'));
 step(s,{...controls,attack:true});
 assert.equal(s.barriers.filter(b=>b.v2Pylon).length,1);
 assert.ok(!s.mines.some(m=>m.v2Conduit),'one node alone cannot form a link');
 s.actors[0].y=550;s.actors[0].cast=0;
 step(s,{...controls,aim:{x:300,y:550},attack:true});
 const nodes=s.barriers.filter(b=>b.v2Pylon);
 assert.equal(nodes.length,2);
 const link=s.mines.find(m=>m.v2Conduit);
 assert.ok(link&&link.arm>.19&&link.life>3);
 s.actors[1].x=146;s.actors[1].y=515;s.actors[1].shield=0;
 for(let i=0;i<24;i++)step(s);
 assert.ok(s.actors[1].hp<100,'actual intersection with wire hurts');
 const second=s.mines.find(m=>m.v2Conduit);
 assert.ok(second&&second.conduitCd>=0);
 // Enemy shots damage a real pylon barrier and snap the connected beam.
 s.shots.push({owner:1,x:195,y:484,vx:-360,vy:0,r:4,damage:40,life:1,
  style:'orb',element:'fire',depth:0,bounces:0});
 for(let i=0;i<15;i++)step(s);
 assert.ok(s.barriers.filter(b=>b.v2Pylon).length<2,'enemy projectile destroys node');
 assert.ok(!s.mines.some(m=>m.v2Conduit),'broken node removes live connection');
 assert.equal(validState(s),true);
});
test('unowned shapes and networks cannot be added across elemental schools',()=>{
 const st=makeMagicV2Practice('stone').magicLoadouts[0];
 const fi=makeMagicV2Practice('fire').magicLoadouts[0];
 for(const id of ['li_pylon','li_link','fi_form_comet'])
  assert.equal(grantEarnedMagicRune(st,id).ok,false);
 assert.equal(grantEarnedMagicRune(fi,'st_form_colossus').ok,false);
});
