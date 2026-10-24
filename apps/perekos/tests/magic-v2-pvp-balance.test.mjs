import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMagicV2Practice,tick,STEP,validState} from '../core.mjs';
import {applyMagicEdit,grantEarnedMagicRune,validateMagicState} from '../magic-v2-rules.mjs';
import server,{RULESET_VERSION} from '../server/module.ts';

const idle={x:0,y:0,attack:false,shield:false,dash:false,aim:{x:320,y:484}};
const run=s=>tick(s,idle,STEP,idle);
function ready(s){s.phase='fight';return s}
function equip(book,id,slot,action){
 const g=grantEarnedMagicRune(book,id);assert.equal(g.ok,true,g.error);
 const instance=g.state.reserve.at(-1),command={type:'equip',slot,instanceId:instance.instanceId,
  revision:g.state.revision,...(action===undefined?{}:{action})};
 const result=applyMagicEdit(g.state,command);
 assert.equal(result.ok,true,result.error||id);return result.state;
}
function defenses(s,action){
 let book=s.magicLoadouts[0];
 book=equip(book,'u_on_cast',1);
 book=equip(book,action,1);
 book=equip(book,'u_on_hurt',2);
 book=equip(book,action,2);
 assert.equal(validateMagicState(book).ok,true);
 s.magicLoadouts[0]=book;
 return ready(s);
}
test('overlapping physical hazards share a fixed 12-point secondary damage budget per caster and second',()=>{
 const s=ready(makeMagicV2Practice('fire',19101)),target=s.actors[1],caster=s.actors[0];
 target.x=218;target.y=484;
 for(let i=0;i<8;i++)s.mines.push({
  owner:0,x:target.x,y:target.y,r:26,life:2.3,arm:0,
  damage:4,element:'fire',v2Wildfire:true,afterCd:0
 });
 run(s);
 assert.equal(target.hp,88,'simultaneous fields cannot stack past 12 HP damage');
 assert.equal(caster.v2SecondaryWindow.spent,12);
 for(let i=0;i<48;i++)run(s);
 assert.ok(target.hp>=88,'fire pulses and burns cannot exceed the shared first-window allowance '+JSON.stringify({hp:target.hp,ticks:s.ticks,budget:caster.v2SecondaryWindow,burn:target.burn,spent:caster.v2SecondaryWindow?.spent,phase:s.phase}));
 for(let i=0;i<15;i++)run(s);
 assert.ok(target.hp<88,'new one-second window restores some periodic pressure');
 assert.ok(target.hp>=76,'second window has the same cap');
 assert.equal(validState(s),true);
});
test('primary projectile damage remains available even after secondary allowance is exhausted',()=>{
 const s=ready(makeMagicV2Practice('stone',19102)),caster=s.actors[0],target=s.actors[1];
 target.x=114;target.y=484;
 caster.v2SecondaryWindow={start:0,spent:12};
 tick(s,{...idle,attack:true},STEP,idle);
 for(let i=0;i<13;i++)run(s);
 assert.ok(target.hp<=88,'direct projectile must still inflict its full base damage');
 assert.equal(validState(s),true);
});
test('duplicate on_cast and on_hurt healing has one shared 2.4-second gate',()=>{
 const s=defenses(makeMagicV2Practice('stone',19103),'u_heal');
 s.actors[0].hp=40;
 s.eventQueue.push({kind:'on_cast',owner:0,payload:{},depth:0},
  {kind:'on_hurt',owner:0,payload:{from:1},depth:0});
 run(s);
 assert.equal(s.actors[0].hp,48,'two independently equipped spells cannot double-heal');
 assert.ok(s.actors[0].runeTimers['v2:shared-heal']>s.ticks);
 for(let i=0;i<90;i++)run(s);
 s.eventQueue.push({kind:'on_hurt',owner:0,payload:{from:1},depth:0});
 run(s);
 assert.equal(s.actors[0].hp,48,'second trigger before shared cooldown does nothing');
 for(let i=0;i<62;i++)run(s);
 s.eventQueue.push({kind:'on_hurt',owner:0,payload:{from:1},depth:0});
 run(s);
 assert.equal(s.actors[0].hp,56,'healing is available again after legitimate wait');
 assert.equal(validState(s),true);
});
test('two independently triggered rune guards share 1.65-second cooldown',()=>{
 const s=defenses(makeMagicV2Practice('fire',19104),'u_guard');
 s.eventQueue.push({kind:'on_cast',owner:0,payload:{},depth:0},
  {kind:'on_hurt',owner:0,payload:{from:1},depth:0});
 run(s);
 assert.equal(s.actors[0].shield,14);
 for(let i=0;i<62;i++)run(s);
 s.eventQueue.push({kind:'on_hurt',owner:0,payload:{from:1},depth:0});
 run(s);
 assert.equal(s.actors[0].shield,14);
 for(let i=0;i<50;i++)run(s);
 s.eventQueue.push({kind:'on_hurt',owner:0,payload:{from:1},depth:0});
 run(s);
 assert.equal(s.actors[0].shield,28);
 assert.equal(validState(s),true);
});
test('PocketNet v19 retains byte-equivalent balance rules and private enemy books',()=>{
 assert.equal(RULESET_VERSION,19);
 const a={id:'one'},b={id:'two'},players=[a,b];
 const send=(s,player,type,data={})=>server.onMessage({state:s,player,players,payload:{type,...data}});
 const s=server.createRoom({player:a}).state;
 server.onJoin({state:s,player:b,players});
 send(s,a,'mode',{gameMode:'magic-v2'});send(s,a,'magic-school',{school:'fire'});
 send(s,a,'start',{gameMode:'magic-v2'});
 assert.equal(server.viewForPlayer({state:s,player:b,players}).match.magicLoadouts[0],null);
 assert.equal(server.viewForPlayer({state:s,player:a,players}).rulesVersion,19);
});
