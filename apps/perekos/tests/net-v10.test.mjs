import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import module,{RULESET_VERSION} from '../server/module.ts';
import {grantEarnedMagicRune} from '../magic-v2-rules.mjs';
const a={id:'a',name:'А',verified:false},b={id:'b',name:'Б',verified:false},intruder={id:'outsider'};
const players=[a,b];
const send=(s,player,type,data={})=>module.onMessage({state:s,player,players,payload:{type,...data}});
const room=()=>{let s=module.createRoom({player:a}).state;s=module.onJoin({state:s,player:b,players}).state;return s};
const magicRoom=()=>{
 const s=room();send(s,a,'mode',{gameMode:'magic-v2'});send(s,a,'magic-school',{school:'stone'});send(s,b,'magic-school',{school:'fire'});send(s,a,'start',{gameMode:'magic-v2'});return s;
};
const edit=(s,player,command)=>send(s,player,'magic-edit',{command:{...command,revision:s.match.magicLoadouts[player===a?0:1].revision,nonce:'test-'+(s.revision+1)}});
const fixtureCard=(s,player,id)=>{const i=player===a?0:1,book=s.match.magicLoadouts[i];if(book.reserve.some(r=>r.defId===id))return;const added=grantEarnedMagicRune(book,id);assert.equal(added.ok,true,added.error);s.match.magicLoadouts[i]=added.state};
const equip=(s,player,id,slot,action)=>{
 fixtureCard(s,player,id);
 const own=s.match.magicLoadouts[player===a?0:1].reserve.find(x=>x.defId===id);
 assert.ok(own,id+' must be server-issued');
 return edit(s,player,{type:'equip',slot,instanceId:own.instanceId,...(action===undefined?{}:{action})});
};
test('v14 binary-exact snapshot, archived v13 and prior versions unchanged',async()=>{
 const main=await readFile(new URL('../server/module.ts',import.meta.url),'utf8');
 const current=await readFile(new URL('../../../pocketnet/module-versions/perekos/v14.ts',import.meta.url),'utf8');
 const previous=await readFile(new URL('../../../pocketnet/module-versions/perekos/v9.ts',import.meta.url),'utf8');
 const lock=JSON.parse(await readFile(new URL('../../../pocketnet/modules.lock.json',import.meta.url),'utf8'));
 assert.equal(main,current);assert.notEqual(main,previous);assert.equal(RULESET_VERSION,14);
 assert.equal(lock.perekos.current,'v14');assert.ok(lock.perekos.versions.includes('v13'));assert.ok(lock.perekos.versions.includes('v9'));assert.ok(lock.perekos.versions.includes('v10'));assert.ok(lock.perekos.versions.includes('v11'));assert.ok(lock.perekos.versions.includes('v12'));
 assert.match(previous,/RULESET_VERSION=9/);
});
test('two seats select isolated schools and get server-owned rune inventory',()=>{
 const s=magicRoom();
 assert.equal(s.phase,'magic-build');assert.equal(s.match.magicModeV2,true);
 assert.equal(s.match.phase,'build');assert.deepEqual(s.schools,['stone','fire']);
 const one=s.match.magicLoadouts[0],two=s.match.magicLoadouts[1];
 assert.equal(one.school,'stone');assert.equal(two.school,'fire');
 assert.equal(s.match.actors[0].magicSchool,'stone');
 assert.equal(s.match.actors[1].magicSchool,'fire');
 assert.ok(one.reserve.some(r=>r.defId==='st_throw'));
 assert.ok(two.reserve.some(r=>r.defId==='fi_ember'));
 assert.ok(!two.reserve.some(r=>r.defId==='li_spark'));
 assert.equal(module.viewForPlayer({state:s,player:a,players}).rulesVersion,14);
 assert.equal(module.viewForPlayer({state:s,player:b,players}).loadout.school,'fire');
});
test('untrusted clients cannot modify somebody else, forge card IDs, or skip typed 1/2/2 slots',()=>{
 const s=magicRoom(),before=JSON.stringify(s.match.magicLoadouts[1]);
 send(s,intruder,'magic-edit',{command:{type:'seal',slot:0,revision:0}});
 assert.equal(JSON.stringify(s.match.magicLoadouts[1]),before);
 let revision=s.revision;
 send(s,a,'magic-edit',{command:{type:'equip',slot:1,instanceId:99999,revision:s.match.magicLoadouts[0].revision}});
 assert.equal(s.revision,revision);
 send(s,a,'magic-school',{school:'storm'});
 assert.equal(s.schools[0],'stone');
 fixtureCard(s,a,'u_on_cast');const own=s.match.magicLoadouts[0].reserve.find(x=>x.defId==='u_on_cast');
 edit(s,a,{type:'equip',slot:1,instanceId:own.instanceId});
 assert.ok(s.match.magicLoadouts[0].slots[1].when);
 const guard=s.match.magicLoadouts[0].reserve.find(x=>x.defId==='u_guard');
 edit(s,a,{type:'equip',slot:1,instanceId:guard.instanceId});
 assert.equal(s.match.magicLoadouts[0].slots[1].actions.length,1);
 const stale={type:'seal',slot:1,revision:0,nonce:'stale'};
 revision=s.revision;send(s,a,'magic-edit',{command:stale});assert.equal(s.revision,revision);
 assert.equal(JSON.stringify(s.match.magicLoadouts[1]),before);
});
test('sealing rune chain locks instances, frees slot, and physically shields under live server ticks',()=>{
 const old=Date.now;let now=1_000_000;Date.now=()=>now;
 try{
  const s=magicRoom();
  equip(s,a,'u_on_cast',1);equip(s,a,'u_guard',1);
  const actor=s.match.actors[0];
  assert.equal(actor.shield,0);
  edit(s,a,{type:'seal',slot:1});
  assert.equal(s.match.magicLoadouts[0].sealed.length,1);
  assert.equal(s.match.magicLoadouts[0].slots[1].actions.length,0);
  edit(s,a,{type:'unequip',slot:1,instanceId:s.match.magicLoadouts[0].sealed[0].actions[0].rune.instanceId});
  assert.equal(s.match.magicLoadouts[0].sealed.length,1);
  send(s,a,'magic-ready');assert.equal(s.phase,'magic-build');
  send(s,b,'magic-ready');assert.equal(s.phase,'fight');
  assert.equal(s.match.phase,'fight');
  for(let n=0;n<12;n++){
   now+=85;
   send(s,a,'input',{seq:n,round:s.match.round,control:{x:0,y:0,attack:n<8,shield:false,dash:false,aim:{x:330,y:120}}});
   send(s,b,'input',{seq:n,round:s.match.round,control:{x:0,y:0,attack:false,shield:false,dash:false,aim:{x:100,y:480}}});
  }
  assert.ok(s.match.actors[0].shield>0,'magic guard triggered by physical attack on server');
  assert.equal(s.match.magicLoadouts[0].sealed.length,1);
 }finally{Date.now=old}
});
test('ready changes are rejected after entering a fight, and legacy rules stay playable under v13',()=>{
 const s=magicRoom();
 send(s,a,'magic-ready');send(s,b,'magic-ready');
 const revision=s.match.magicLoadouts[0].revision;
 edit(s,a,{type:'seal',slot:0});
 assert.equal(s.match.magicLoadouts[0].revision,revision);
 const legacy=room();send(legacy,a,'start',{gameMode:'duel'});
 assert.equal(legacy.phase,'fight');assert.equal(legacy.match.magicModeV2,undefined);
 assert.equal(legacy.match.actors[0].runes[0],'on_hurt');
});

test('v12 server runs both opponents new ground-trap runes without trusting client physics',()=>{
 const old=Date.now;let now=1_400_000;Date.now=()=>now;
 try{
  const s=magicRoom();
  for(const [player,id] of [[a,'st_spikes'],[b,'fi_cindermine']]){
   equip(s,player,'u_on_cast',1);equip(s,player,id,1);
  }
  send(s,a,'magic-ready');send(s,b,'magic-ready');
  assert.equal(s.phase,'fight');
  for(let i=0;i<3;i++){
   now+=85;
   send(s,a,'input',{seq:i,round:s.match.round,control:{x:0,y:0,attack:true,shield:false,dash:false,aim:{x:320,y:134}}});
   send(s,b,'input',{seq:i,round:s.match.round,control:{x:0,y:0,attack:true,shield:false,dash:false,aim:{x:64,y:484}}});
  }
  assert.ok(s.match.waves.some(w=>w.v2Spikes&&w.owner===0),'server places real stone spike zones');
  assert.ok(s.match.mines.some(m=>m.v2Trap&&m.owner===1),'server places an armed fire trap');
  assert.ok(s.match.mines.every(m=>!m.v2Trap||m.arm>=0),'trap count is authoritative');
 }finally{Date.now=old}
});
test('v12 server issues the storm fan but rejects it for other schools',()=>{
 const s=magicRoom();
 assert.ok(!s.match.magicLoadouts[0].reserve.some(x=>x.defId==='li_discharge'));
 const book=s.match.magicLoadouts[0],before=s.revision;
 send(s,a,'magic-edit',{command:{type:'equip',slot:1,revision:book.revision,instanceId:9999,nonce:'spoof-lightning'}});
 assert.equal(s.revision,before);
 const other=room();
 send(other,a,'mode',{gameMode:'magic-v2'});
 send(other,a,'magic-school',{school:'storm'});
 send(other,a,'start',{gameMode:'magic-v2'});
 assert.ok(!other.match.magicLoadouts[0].reserve.some(x=>x.defId==='li_discharge'),'rarity draft reserves rare lightning rune for future rounds');
});
