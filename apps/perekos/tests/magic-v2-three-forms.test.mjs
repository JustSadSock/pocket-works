import test from 'node:test';
import assert from 'node:assert/strict';
import module,{RULESET_VERSION} from '../server/module.ts';
import {grantEarnedMagicRune,effectiveMagicForm} from '../magic-v2-rules.mjs';

const p={id:'a'},q={id:'b'},players=[p,q];
const send=(s,player,type,x={})=>module.onMessage({state:s,player,players,payload:{type,...x}});
function room(school){
 const s=module.createRoom({player:p}).state;
 module.onJoin({state:s,player:q,players});
 send(s,p,'mode',{gameMode:'magic-v2'});
 send(s,p,'magic-school',{school});
 send(s,p,'start',{gameMode:'magic-v2'});
 return s;
}
function equip(s,id){
 const prev=s.match.magicLoadouts[0],grant=grantEarnedMagicRune(prev,id);
 assert.equal(grant.ok,true,grant.error);
 s.match.magicLoadouts[0]=grant.state;
 const book=s.match.magicLoadouts[0],inst=book.reserve.at(-1);
 send(s,p,'magic-edit',{command:{type:'equip',slot:1,
  instanceId:inst.instanceId,revision:book.revision,nonce:'n-'+id,
  ...(id==='u_reform_base'?{}:{action:0})}});
 assert.ok(s.match.magicLoadouts[0].revision>book.revision,id+' must equip');
}
test('PocketNet v19 owns, simulates and shares visible state for all three new forms',()=>{
 const old=Date.now;let now=1_000_000;Date.now=()=>now;
 try{
  assert.equal(RULESET_VERSION,19);
  for(const [school,id,origin,objects,marker] of [
   ['stone','st_form_spires','st_origin_below','waves','v2Spire'],
   ['fire','fi_form_whirl','fi_origin_sky','mines','v2Whirl'],
   ['storm','li_form_sphere','li_origin_self','shots','v2Sphere']
  ]){
   const s=room(school);
   for(const rune of ['u_reform_base',id,origin])equip(s,rune);
   assert.equal(effectiveMagicForm(s.match.magicLoadouts[0]).shape,id);
   send(s,p,'magic-ready');send(s,q,'magic-ready');
   assert.equal(s.phase,'fight');
   for(let n=0;n<3;n++){
    now+=100;
    send(s,p,'input',{seq:n,round:s.match.round,
      control:{x:0,y:0,attack:true,shield:false,dash:false,aim:{x:320,y:484}}});
    send(s,q,'input',{seq:n,round:s.match.round,
      control:{x:0,y:0,attack:false,shield:false,dash:false,aim:{x:64,y:484}}});
   }
   assert.ok(s.match[objects].some(obj=>obj[marker]),'real '+school+' form');
   assert.ok(s.match.shots.every(x=>!x.signature),'no hidden legacy attack');
   const visible=module.viewForPlayer({state:s,player:q,players});
   assert.ok(visible.match[objects].some(obj=>obj[marker]),'combat state is public');
   assert.equal(visible.match.magicLoadouts[0],null,'enemy build stays private');
   assert.equal(module.viewForPlayer({state:s,player:p,players}).rulesVersion,19);
  }
 }finally{Date.now=old}
});
