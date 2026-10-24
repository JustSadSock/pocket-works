import test from 'node:test';
import assert from 'node:assert/strict';
import module,{RULESET_VERSION} from '../server/module.ts';
import {grantEarnedMagicRune} from '../magic-v2-rules.mjs';

const host={id:'host'},guest={id:'guest'},players=[host,guest];
const send=(s,player,type,data={})=>module.onMessage({state:s,player,players,payload:{type,...data}});
function room(school){
 let s=module.createRoom({player:host}).state;
 s=module.onJoin({state:s,player:guest,players}).state;
 send(s,host,'mode',{gameMode:'magic-v2'});
 send(s,host,'magic-school',{school});
 send(s,host,'start',{gameMode:'magic-v2'});
 return s;
}
function install(s,id){
 for(const rune of ['u_on_cast',id]){
  const from=s.match.magicLoadouts[0],added=grantEarnedMagicRune(from,rune);
  assert.equal(added.ok,true,added.error);s.match.magicLoadouts[0]=added.state;
  const b=s.match.magicLoadouts[0],instance=b.reserve.at(-1);
  send(s,host,'magic-edit',{command:{type:'equip',slot:1,instanceId:instance.instanceId,
   revision:b.revision,nonce:'new-'+rune}});
  assert.ok(s.match.magicLoadouts[0].revision>b.revision,rune+' must be equipped');
 }
 send(s,host,'magic-ready');send(s,guest,'magic-ready');
 assert.equal(s.phase,'fight');
}
test('PocketNet v15 executes all three new owned action runes in authoritative 2-seat combat',()=>{
 const before=Date.now;let now=1_000_000;Date.now=()=>now;
 try{
  assert.equal(RULESET_VERSION,15);
  for(const [school,id,collection,marker] of [
   ['stone','st_fault','waves','v2Fault'],
   ['fire','fi_lash','beams','v2Lash'],
   ['storm','li_coil','mines','v2Charge']
  ]){
   const s=room(school);install(s,id);
   const aim={x:320,y:484};
   for(let n=0;n<3;n++){
    now+=100;
    send(s,host,'input',{seq:n,round:s.match.round,control:{x:0,y:0,attack:true,shield:false,dash:false,aim}});
    send(s,guest,'input',{seq:n,round:s.match.round,control:{x:0,y:0,attack:false,shield:false,dash:false,aim}});
   }
   assert.ok(s.match[collection].some(x=>x[marker]),school+' must create physical '+marker);
   const home=module.viewForPlayer({state:s,player:host,players});
   const away=module.viewForPlayer({state:s,player:guest,players});
   assert.equal(home.match.magicLoadouts[1],null,'private book stays hidden');
   assert.equal(away.match.magicLoadouts[0],null,'private book stays hidden');
   assert.ok(home.match[collection].some(x=>x[marker]),'visible physics is projected');
   assert.ok(s.match.magicLoadouts[0].slots[1].actions.some(a=>a.rune.defId===id));
  }
 }finally{Date.now=before}
});
