import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMatch,chooseRune,beginRound,reorderRunes,offers,tick,stats,validState,RUNES,W,H,canStand,STEP,startRound} from '../core.mjs';
import {rune,compile,description,legalRunes,MAX_REACTIONS_PER_TICK,MAX_QUEUE} from '../runes.mjs';

test('36 unique plain-language runes, 12 per grammatical category',()=>{
 assert.equal(RUNES.length,36);assert.equal(new Set(RUNES.map(r=>r.id)).size,36);
 for(const type of ['when','do','how'])assert.equal(RUNES.filter(r=>r.type===type).length,12);
 for(const r of RUNES){assert.ok(r.name.length>3&&r.desc.length>10);assert.equal(rune(r.id).name,r.name)}
});
test('new session is a fully deterministic fixed-step game',()=>{
 const a=makeMatch(701),b=makeMatch(701);assert.equal(a.version,2);assert.deepEqual(a.score,[0,0]);
 assert.ok(validState(a));assert.equal(a.remaining,25);
 for(let i=0;i<400;i++){const command={x:i%60<30?1:-1,y:.2,attack:true,shield:i===5,dash:i===55};tick(a,command);tick(b,command)}
 assert.deepEqual(a,b);
});
test('offers exclude owned cards, draft leads to a reorderable five-slot workbench',()=>{
 const s=makeMatch(8);const x=offers(s);assert.equal(x.length,3);assert.equal(new Set(x).size,3);
 assert.ok(x.every(id=>!s.actors[0].runes.includes(id)));
 s.pick=x;s.phase='draft';
 assert.equal(chooseRune(s,'nonsense'),false);
 assert.equal(chooseRune(s,x[0]),true);assert.equal(s.phase,'build');
 assert.equal(s.actors[0].runes.length,3);
 assert.equal(reorderRunes(s,0,2),true);assert.equal(s.actors[0].runes[2],'on_cast');
 assert.equal(beginRound(s),true);assert.equal(s.phase,'fight');assert.equal(s.round,1);
 assert.equal(beginRound(s),false);assert.equal(reorderRunes(s,0,1),false);
});
test('rune order changes whether a real action is wired and modifiers attach to preceding actions',()=>{
 assert.equal(description(['ball','on_cast','double']).lines.length,0);
 const info=description(['on_cast','ball','double','bounce','drain']);
 assert.equal(info.chains.length,1);assert.equal(info.chains[0].actions[0].id,'ball');
 assert.deepEqual(info.chains[0].actions[0].mods,['double','bounce','drain']);
 assert.ok(legalRunes(['on_cast','ball']));assert.equal(legalRunes(['on_cast','on_cast']),false);
});
test('shooting a wired double bolt produces three real bullets with modifiers applied',()=>{
 const s=makeMatch(35);s.actors[0].runes=['on_cast','ball','double','bounce','drain'];
 tick(s,{attack:true,aim:{x:s.actors[1].x,y:s.actors[1].y}});
 assert.equal(s.shots.length,3);const generated=s.shots.filter(q=>q.drain);
 assert.equal(generated.length,2);assert.ok(generated.every(q=>q.bounces===1));
 assert.ok(s.actors[0].heat>0);assert.ok(s.reactions<=MAX_REACTIONS_PER_TICK);
});
test('barrier and mine actions are physical, not decorative',()=>{
 const s=makeMatch(33);s.actors[0].runes=['on_cast','mine'];
 tick(s,{attack:true,aim:{x:200,y:200}});
 assert.equal(s.mines.length,1);
 const t=makeMatch(34);t.actors[0].runes=['on_cast','wall'];
 tick(t,{attack:true,aim:{x:200,y:300}});
 assert.equal(t.barriers.length,1);
 assert.ok(t.barriers[0].life>0);
});
test('shield, dash and overload have real bounded cooldown and heat behavior',()=>{
 const s=makeMatch(1);s.actors[0].heat=99;
 tick(s,{x:1,shield:true,dash:true,attack:true});
 let a=s.actors[0];assert.ok(a.shield>0&&a.dashReady>0);
 // Rising to 100 overloads on the following deterministic tick.
 tick(s,{x:1});assert.ok(a.overloadCd>0);assert.ok(a.heat<100);
 const cd=a.dashReady;tick(s,{x:1,dash:true});assert.ok(a.dashReady<cd);
 for(let i=0;i<600&&s.phase==='fight';i++){tick(s,{x:1,y:1});assert.ok(canStand(a.x,a.y));assert.ok(a.x<=W&&a.y<=H)}
});
test('recursive heal circuits respect event and reaction limits',()=>{
 const s=makeMatch(66);s.actors[0].runes=['on_cast','heal','on_heal','heal','triple'];s.actors[0].hp=15;
 tick(s,{attack:true,aim:{x:300,y:130}});assert.ok(s.actors[0].hp>15);
 assert.ok(s.reactions<=MAX_REACTIONS_PER_TICK);assert.ok(s.eventQueue.length<=MAX_QUEUE);
 for(let i=0;i<300&&s.phase==='fight';i++){tick(s,{attack:true});assert.ok(Number.isFinite(s.actors[0].hp));assert.ok(s.eventQueue.length<=MAX_QUEUE)}
});
test('dense projectile explosions are bounded on every tick',()=>{
 const s=makeMatch(91);s.actors[0].runes=['on_cast','ball','triple','quick','bounce'];
 let max=0;
 for(let i=0;i<1400&&s.phase==='fight';i++){
  tick(s,{x:Math.sin(i/40),y:Math.cos(i/37),attack:true,dash:i%160===0,aim:{x:200,y:300}});
  max=Math.max(max,s.shots.length);assert.ok(s.shots.length<=80);assert.ok(s.echoes.length<=12);
  assert.ok(s.reactions<=MAX_REACTIONS_PER_TICK);assert.ok(validState(s));
 }
 assert.ok(max>2);
});
test('40 fully played seeded games end with a winner and no impossible state',()=>{
 for(let seed=1;seed<=40;seed++){
  const s=makeMatch(seed);let count=0,rounds=0;
  while(s.phase!=='result'&&count++<20000){
   if(s.phase==='draft'){const selected=s.pick[0];assert.ok(selected);const slot=s.actors[0].runes.length>=5?0:null;assert.equal(chooseRune(s,selected,slot),true);continue}
   if(s.phase==='build'){rounds++;assert.equal(beginRound(s),true);continue}
   const p=s.actors[0],b=s.actors[1],dx=b.x-p.x,dy=b.y-p.y,d=Math.hypot(dx,dy)||1;
   tick(s,{x:dx/d*.45-dy/d*.6,y:dy/d*.45+dx/d*.6,attack:true,aim:{x:b.x,y:b.y},shield:count%200===0,dash:count%180===0});
   assert.ok(validState(s),'invalid seed '+seed+' at step '+count);
  }
  assert.equal(s.phase,'result','seed '+seed);assert.equal(Math.max(...s.score),4);
  assert.ok(rounds>=3&&rounds<=6);assert.deepEqual(JSON.parse(JSON.stringify(s)),s);
 }
});
test('corrupt and old saves are rejected without running obsolete combat rules',()=>{
 const v1=makeMatch(10);v1.version=1;assert.equal(validState(v1),false);
 const s=makeMatch(11);s.actors[0].runes=['ball','ball'];assert.equal(validState(s),false);
});
