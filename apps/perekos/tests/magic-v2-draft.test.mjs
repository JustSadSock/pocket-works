import test from 'node:test';
import assert from 'node:assert/strict';
import module,{RULESET_VERSION} from '../server/module.ts';
import {MAGIC_RUNE_INDEX,validateMagicState} from '../magic-v2-rules.mjs';

const host={id:'host'},guest={id:'guest'},players=[host,guest];
const send=(s,player,type,p={})=>module.onMessage({
 state:s,player,players,payload:{type,...p}
});
const room=()=>{
 let s=module.createRoom({player:host}).state;
 s=module.onJoin({state:s,player:guest,players}).state;
 send(s,host,'mode',{gameMode:'magic-v2'});
 send(s,host,'magic-school',{school:'stone'});
 send(s,guest,'magic-school',{school:'fire'});
 send(s,host,'start',{gameMode:'magic-v2'});
 return s;
};
const fakeInput=(s,now)=>{
 send(s,host,'input',{seq:s.seq[0]+1,round:s.match.round,
  control:{x:0,y:0,attack:false,shield:false,dash:false,aim:{x:300,y:300}}});
};
const moveToOffers=(s)=>{
 send(s,host,'magic-ready');send(s,guest,'magic-ready');
 assert.equal(s.phase,'fight');
 s.match.score[0]=1;s.match.phase='draft';
 fakeInput(s);
 assert.equal(s.phase,'magic-offer');
 return s;
};
test('v13 offers are private, match-seeded, independently chosen and never cross-school',()=>{
 const clock=Date.now;let now=2_000_000;Date.now=()=>now;
 try{
  const s=moveToOffers(room()),original=JSON.parse(JSON.stringify(s));
  assert.equal(RULESET_VERSION,13);
  assert.equal(s.magicStage,1);
  assert.deepEqual(s.magicChoices.map(offers=>offers.map(o=>o.rarity)),[
   ['common','uncommon','rare'],['common','uncommon','rare']
  ]);
  assert.equal(s.magicChoices[0][0].runes.length,2);
  const stone=module.viewForPlayer({state:s,player:host,players});
  const fire=module.viewForPlayer({state:s,player:guest,players});
  assert.deepEqual(stone.magicChoices,s.magicChoices[0]);
  assert.deepEqual(fire.magicChoices,s.magicChoices[1]);
  for(const offer of s.magicChoices[0])for(const id of offer.runes)
   assert.ok(['common','stone'].includes(MAGIC_RUNE_INDEX.get(id).school));
  for(const offer of s.magicChoices[1])for(const id of offer.runes)
   assert.ok(['common','fire'].includes(MAGIC_RUNE_INDEX.get(id).school));
  const copy=JSON.parse(JSON.stringify(original));
  // Repeat the same battle seed, completed round and state: offers stay fixed.
  copy.match.phase='draft';copy.phase='fight';
  copy.match.round=1;copy.match.score=[1,0];
  copy.magicChoices=[[],[]];copy.magicPicked=[false,false];
  fakeInput(copy);
  assert.deepEqual(copy.magicChoices,s.magicChoices);
  const pack=s.magicChoices[0][0].runes;
  const before=s.match.magicLoadouts[0].reserve.length;
  send(s,host,'magic-pick',{stage:s.magicStage,index:0});
  assert.equal(s.match.magicLoadouts[0].reserve.length,before+pack.length);
  assert.equal(s.magicPicked[0],true);
  assert.equal(s.phase,'magic-offer','await opponent');
  const priorRevision=s.revision;
  send(s,host,'magic-pick',{stage:s.magicStage,index:1});
  assert.equal(s.revision,priorRevision,'second package cannot be stolen');
  send(s,guest,'magic-pick',{stage:999,index:1});
  assert.equal(s.magicPicked[1],false,'wrong stage rejected');
  send(s,guest,'magic-pick',{stage:s.magicStage,index:1});
  assert.equal(s.phase,'magic-build');
  assert.equal(s.match.phase,'build');
  assert.deepEqual(s.magicChoices,[[],[]]);
  assert.equal(validateMagicState(s.match.magicLoadouts[0]).ok,true);
  assert.equal(validateMagicState(s.match.magicLoadouts[1]).ok,true);
 }finally{Date.now=clock}
});
test('v13 milestone offers a transformation without forcing it on either school',()=>{
 const clock=Date.now;let now=2_200_000;Date.now=()=>now;
 try{
  const s=room();
  send(s,host,'magic-ready');send(s,guest,'magic-ready');
  s.match.score=[2,1];s.match.phase='draft';
  fakeInput(s);
  assert.equal(s.magicStage,3);
  for(const [i,school] of [[0,'stone'],[1,'fire']]){
   const offer=s.magicChoices[i][2];
   assert.equal(offer.rarity,'transformation');
   assert.equal(offer.runes.length,1);
   const rune=MAGIC_RUNE_INDEX.get(offer.runes[0]);
   assert.equal(rune.rarity,'transformation');
   assert.equal(rune.school,school);
  }
  // The two ordinary cards are still a valid alternative.
  send(s,host,'magic-pick',{stage:3,index:0});
  assert.equal(s.magicPicked[0],true);
 }finally{Date.now=clock}
});
test('v13 45-second timeout picks a safe common pack, preserving existing rune seals',()=>{
 const clock=Date.now;let now=2_400_000;Date.now=()=>now;
 try{
  const s=moveToOffers(room());
  const first=s.magicChoices[0][0].runes,second=s.magicChoices[1][0].runes;
  now+=45_100;send(s,host,'sync');
  assert.equal(s.phase,'magic-build');
  for(const [i,runes] of [[0,first],[1,second]])
   for(const id of runes)assert.ok(s.match.magicLoadouts[i].reserve.some(r=>r.defId===id));
  assert.deepEqual(s.magicPicked,[true,true]);
  assert.equal(s.match.magicModeV2,true);
  send(s,host,'magic-pick',{stage:1,index:2});
  assert.equal(s.phase,'magic-build','stale post-deadline click rejected');
 }finally{Date.now=clock}
});
