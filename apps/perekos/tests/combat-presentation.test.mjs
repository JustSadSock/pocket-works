import test from 'node:test';
import assert from 'node:assert/strict';
import {CombatPresentation} from '../combat-presentation.mjs';

const state=(round=1,serial=0,fx=[])=>({round,serial,ticks:1,fx});

test('confirmed combat events produce visible bounded rings, fragments, scars and impact words',()=>{
 const fx=new CombatPresentation();
 const s=state(1,4,[
  {id:1,k:'shoot',x:120,y:180},
  {id:2,k:'hit',x:175,y:255},
  {id:3,k:'impact_stone',x:195,y:315},
  {id:4,k:'react_crack',x:190,y:330}
 ]);
 const original=JSON.stringify(s);
 fx.ingest(s);
 assert.ok(fx.particles.length>=50);
 assert.ok(fx.scars.length>=2);
 assert.ok(fx.words.some(w=>w.label==='ПРОБОЙ'));
 assert.ok(fx.shake>0);
 assert.deepEqual(JSON.stringify(s),original,'visuals may not change server simulation');
});
test('the same authoritative event cannot double-spawn per render',()=>{
 const p=new CombatPresentation(),s=state(1,2,[{id:1,k:'hit',x:240,y:260},{id:2,k:'react_slag',x:245,y:270}]);
 p.ingest(s);const n=p.particles.length,w=p.words.length;p.ingest(s);
 assert.equal(p.particles.length,n);assert.equal(p.words.length,w);
});
test('pooled visual FX are capped and clean themselves up',()=>{
 const p=new CombatPresentation();const s=state(1,0,[]);
 for(let i=1;i<=65;i++)s.fx.push({id:i,k:i%4===0?'react_steam':'hit',x:160+i%8,y:280+i%14});
 s.serial=65;p.ingest(s);
 assert.ok(p.particles.length<=210);
 assert.ok(p.scars.length<=40);
 for(let i=0;i<40;i++)p.advance(.05);
 assert.equal(p.particles.length,0);assert.equal(p.rings.length,0);assert.equal(p.words.length,0);
 for(let i=0;i<380;i++)p.advance(.05);
 assert.equal(p.scars.length,0);
});
test('new rounds reset old decals, old event sequence and old camera impulses',()=>{
 const p=new CombatPresentation();p.ingest(state(1,4,[{id:4,k:'overload',x:200,y:320}]));
 assert.ok(p.shake>0);
 p.ingest(state(2,5,[]));
 assert.equal(p.scars.length,0);assert.equal(p.particles.length,0);assert.equal(p.shake,0);
 p.ingest(state(2,6,[{id:6,k:'react_steam',x:180,y:280}]));
 assert.equal(p.words.length,1);
});
test('reduced motion never translates the world and generates fewer particles',()=>{
 const s=state(1,1,[{id:1,k:'react_slag',x:180,y:250}]);
 const normal=new CombatPresentation(),reduced=new CombatPresentation();
 normal.ingest(s,false);reduced.ingest(s,true);
 assert.ok(reduced.particles.length<normal.particles.length);
 assert.deepEqual(reduced.offset(true),{x:0,y:0});
 reduced.advance(1/60,true);
 assert.deepEqual(reduced.offset(true),{x:0,y:0});
});

// The dedicated Perekos combat workflow lists this legacy entrypoint explicitly.
// Run the additive visual-readability regressions in that same job.
import './combat-readability.test.mjs';

// The app-specific Perekos workflow runs this entrypoint directly.
import './spell-choreography.test.mjs';


test('only actual HP damage creates hit-stop and damage numbers, without changing simulation',()=>{
 const p=new CombatPresentation();
 const base={round:1,serial:0,ticks:100,phase:'fight',fx:[],actors:[{hp:100,x:110,y:170},{hp:100,x:285,y:380}]};
 p.ingest(base);
 assert.equal(p.damageNumbers.length,0);
 const hurt={...base,ticks:101,actors:[base.actors[0],{...base.actors[1],hp:83.5}]};
 const original=JSON.stringify(hurt);
 p.ingest(hurt);
 assert.equal(p.damageNumbers.length,1);
 assert.equal(p.damageNumbers[0].value,17);
 assert.ok(p.shocks.length===1&&p.hold>0&&p.shake>0);
 assert.equal(JSON.stringify(hurt),original);
 p.ingest(hurt);
 assert.equal(p.damageNumbers.length,1,'same frame cannot double count damage');
 for(let i=0;i<75;i++)p.advance(1/60);
 assert.equal(p.shocks.length,0);
 assert.equal(p.damageNumbers.length,0);
});
test('reduced motion disables impact hit-stop and camera displacement',()=>{
 const p=new CombatPresentation();
 const base={round:2,serial:0,ticks:1,phase:'fight',fx:[],actors:[{hp:100,x:130,y:130},{hp:100,x:285,y:380}]};
 p.ingest(base,true);
 p.ingest({...base,ticks:2,actors:[{...base.actors[0],hp:75},base.actors[1]]},true);
 assert.equal(p.hold,0);
 assert.deepEqual(p.offset(true),{x:0,y:0});
});
