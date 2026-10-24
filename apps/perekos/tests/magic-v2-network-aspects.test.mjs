import test from 'node:test';
import assert from 'node:assert/strict';
import module,{RULESET_VERSION} from '../server/module.ts';
import {grantEarnedMagicRune,effectiveMagicForm} from '../magic-v2-rules.mjs';
const owner={id:'owner'},enemy={id:'enemy'},players=[owner,enemy];
const send=(s,p,type,rest={})=>module.onMessage({state:s,player:p,players,payload:{type,...rest}});
const makeRoom=school=>{
 const s=module.createRoom({player:owner}).state;
 module.onJoin({state:s,player:enemy,players});
 send(s,owner,'mode',{gameMode:'magic-v2'});
 send(s,owner,'magic-school',{school});send(s,owner,'start',{gameMode:'magic-v2'});
 return s;
};
const fit=(s,ids)=>{
 for(const [id,index] of ids){
  const old=s.match.magicLoadouts[0],grant=grantEarnedMagicRune(old,id);
  assert.equal(grant.ok,true,grant.error);
  s.match.magicLoadouts[0]=grant.state;
  const b=s.match.magicLoadouts[0],item=b.reserve.at(-1);
  send(s,owner,'magic-edit',{command:{type:'equip',slot:1,instanceId:item.instanceId,
   revision:b.revision,nonce:'v18-'+id,...(index===undefined?{}:{action:index})}});
  assert.ok(s.match.magicLoadouts[0].revision>b.revision,'authoritative edit '+id);
 }
 send(s,owner,'magic-ready');send(s,enemy,'magic-ready');
 assert.equal(s.phase,'fight');
};
test('v18 server evaluates motion plus a shape while keeping private builds hidden',()=>{
 const real=Date.now;let now=12_000_000;Date.now=()=>now;
 try{
  assert.equal(RULESET_VERSION,20);
  const s=makeRoom('storm');
  fit(s,[['u_reform_base'],['li_form_sphere',0],['li_motion_orbit',0]]);
  assert.equal(effectiveMagicForm(s.match.magicLoadouts[0]).motion,'li_motion_orbit');
  for(let i=0;i<5;i++){
   now+=100;
   for(const [p,attack] of [[owner,true],[enemy,false]]){
    send(s,p,'input',{seq:i,round:s.match.round,control:{
     x:0,y:0,attack,shield:false,dash:false,aim:{x:320,y:484}}});
   }
  }
  assert.ok(s.match.shots.some(q=>q.v2Sphere&&q.v2Orbit),'server simulates orbital sphere');
  const own=module.viewForPlayer({state:s,player:owner,players});
  const other=module.viewForPlayer({state:s,player:enemy,players});
  assert.equal(own.rulesVersion,20);assert.equal(other.rulesVersion,20);
  assert.equal(own.match.magicLoadouts[1],null);
  assert.equal(other.match.magicLoadouts[0],null);
  assert.ok(other.match.shots.some(q=>q.v2Sphere&&q.v2Orbit));
 }finally{Date.now=real}
});
test('v18 server accepts two different contact aspects only in their own schools',()=>{
 assert.equal(RULESET_VERSION,20);
 for(const [school,shape,impact] of [
  ['stone','st_form_colossus','st_impact_rubble'],
  ['fire','fi_form_comet','fi_impact_wildfire']
 ]){
  const s=makeRoom(school);
  fit(s,[['u_reform_base'],[shape,0],[impact,0]]);
  const base=effectiveMagicForm(s.match.magicLoadouts[0]);
  assert.equal(base.shape,shape);assert.equal(base.impact,impact);
  assert.equal(module.viewForPlayer({state:s,player:enemy,players}).match.magicLoadouts[0],null);
 }
});
