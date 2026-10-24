import test from 'node:test';
import assert from 'node:assert/strict';
import module,{RULESET_VERSION} from '../server/module.ts';
import {grantEarnedMagicRune,effectiveMagicForm} from '../magic-v2-rules.mjs';

const host={id:'host'},guest={id:'guest'},players=[host,guest];
const send=(s,player,type,x={})=>module.onMessage({state:s,player,players,payload:{type,...x}});
function makeRoom(school){
 const s=module.createRoom({player:host}).state;
 module.onJoin({state:s,player:guest,players});
 send(s,host,'mode',{gameMode:'magic-v2'});
 send(s,host,'magic-school',{school});send(s,host,'start',{gameMode:'magic-v2'});
 return s;
}
function equip(s,runes){
 for(const [rune,action] of runes){
  const old=s.match.magicLoadouts[0],add=grantEarnedMagicRune(old,rune);
  assert.equal(add.ok,true,add.error);s.match.magicLoadouts[0]=add.state;
  const book=s.match.magicLoadouts[0];
  const instance=book.reserve.at(-1);
  send(s,host,'magic-edit',{command:{type:'equip',slot:1,instanceId:instance.instanceId,
   revision:book.revision,nonce:'live-'+rune,...(action===undefined?{}:{action})}});
  assert.ok(s.match.magicLoadouts[0].revision>book.revision,'server must install '+rune);
 }
 send(s,host,'magic-ready');send(s,guest,'magic-ready');
 assert.equal(s.phase,'fight');
}
function fire(s,seq,aim){
 send(s,host,'input',{seq,round:s.match.round,
  control:{x:0,y:0,attack:true,shield:false,dash:false,aim}});
 send(s,guest,'input',{seq,round:s.match.round,
  control:{x:0,y:0,attack:false,shield:false,dash:false,aim:{x:64,y:484}}});
}
test('PocketNet v18 simulates each heavy form and shares live objects without exposing owned runes',()=>{
 const clock=Date.now;let now=3_000_000;Date.now=()=>now;
 try{
  assert.equal(RULESET_VERSION,18);
  for(const [school,form,origin,marker] of [
   ['stone','st_form_colossus','st_origin_below','v2Monolith'],
   ['fire','fi_form_comet','fi_origin_sky','v2Comet']
  ]){
   const s=makeRoom(school);
   equip(s,[['u_reform_base'],[form,0],[origin,0]]);
   assert.equal(effectiveMagicForm(s.match.magicLoadouts[0]).shape,form);
   for(let i=0;i<3;i++){now+=120;fire(s,i,{x:320,y:484})}
   assert.ok(s.match.lobs.some(obj=>obj[marker]),school+' actual falling object');
   const projection=module.viewForPlayer({state:s,player:guest,players});
   assert.ok(projection.match.lobs.some(obj=>obj[marker]));
   assert.equal(projection.match.magicLoadouts[0],null);
   assert.equal(projection.rulesVersion,18);
  }
 }finally{Date.now=clock}
});
test('PocketNet v18 issues link nodes, creates a bounded wire and preserves private rune books',()=>{
 const clock=Date.now;let now=4_000_000;Date.now=()=>now;
 try{
  const s=makeRoom('storm');
  equip(s,[['u_on_cast'],['li_pylon'],['li_link']]);
  for(let i=0;i<3;i++){now+=120;fire(s,i,{x:320,y:484})}
  assert.ok(s.match.barriers.some(b=>b.v2Pylon),'server owns first node');
  s.match.actors[0].y=550;
  // Real authoritative time and inputs advance the rune cooldown.
  for(let i=3;i<80;i++){
   now+=20;
   const neutral={x:0,y:0,attack:false,shield:false,dash:false,aim:{x:320,y:550}};
   send(s,host,'input',{seq:i,round:s.match.round,control:neutral});
   send(s,guest,'input',{seq:i,round:s.match.round,control:neutral});
  }
  for(let i=80;i<84;i++){now+=120;fire(s,i,{x:320,y:550})}
  assert.equal(s.match.barriers.filter(b=>b.v2Pylon).length,2);
  assert.ok(s.match.mines.some(m=>m.v2Conduit),'wire created only between real nodes');
  assert.equal(module.viewForPlayer({state:s,player:guest,players}).match.magicLoadouts[0],null);
 }finally{Date.now=clock}
});
