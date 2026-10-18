import test from 'node:test';
import assert from 'node:assert/strict';
import {BIOMES,biomeForWave,stageSeed,biomeHazard,biomeDamage,biomeSpeedFactor,biomeRuptureHeal,biomeSpawnWeight} from '../biomes.js';
import {generateOrgan,getTissueNodes,setSeed} from '../organGen.js';
import {validateRun} from '../stability.js';
const id=(x,z)=>x+','+z;
function isConnected(cells,excluded=new Set()){
 const open=new Set(cells.map(p=>id(p.x,p.y)).filter(k=>!excluded.has(k)));
 const start=open.values().next().value,queue=start?[start]:[],seen=new Set(queue);
 for(let i=0;i<queue.length;i++){const [x,z]=queue[i].split(',').map(Number);
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const k=id(x+dx,z+dz);
   if(open.has(k)&&!seen.has(k)){seen.add(k);queue.push(k);}}}
 return seen.size===open.size;
}
test('each wave selects exactly one of four unmistakable anatomy palettes',()=>{
 assert.equal(BIOMES.length,4);
 assert.equal(new Set(BIOMES.map(b=>b.id)).size,4);
 assert.equal(new Set(BIOMES.map(b=>b.fog)).size,4);
 assert.equal(new Set(BIOMES.map(b=>b.landmark)).size,4);
 assert.deepEqual([1,2,3,4,5].map(n=>biomeForWave(n).id),['vascular','gastric','marrow','neural','neural']);
 for(const biome of BIOMES){
  assert.ok(biome.name.length>=5&&biome.light>0&&biome.floorLight>0);
 }
});
test('four deterministic stage seeds and gate topology preserve accessibility on 1000 worlds',()=>{
 for(let seed=0;seed<250;seed++)for(let wave=1;wave<=4;wave++){
  const worldSeed=stageSeed(seed*197+101,wave);setSeed(worldSeed);
  const cells=generateOrgan(0,0);
  const gates=getTissueNodes(0,0).map(t=>t.id);
  assert.ok(isConnected(cells),'disconnected open '+seed+' stage '+wave);
  assert.ok(isConnected(cells,new Set(gates)),'softlock '+seed+' stage '+wave);
  assert.equal(stageSeed(seed*197+101,wave),worldSeed);
 }
 assert.equal(new Set([1,2,3,4].map(w=>stageSeed(413,w))).size,4);
});
test('hazards deterministically mark existing floor but never block central starting area',()=>{
 const kinds=new Set(),found={acid:0,marrow:0,charge:0};
 for(let wave=1;wave<=5;wave++){
  for(let x=-16;x<=16;x++)for(let z=-16;z<=16;z++){
   const a=biomeHazard(413,wave,x,z);
   assert.equal(a,biomeHazard(413,wave,x,z));
   if(x>=1&&x<=6&&z>=1&&z<=6&&Math.hypot(x-3.5,z-3.5)<2.5)assert.equal(a,null);
   if(wave===1)assert.equal(a,null);
   if(a){kinds.add(a);found[a]++;}
  }
 }
 assert.deepEqual([...kinds].sort(),['acid','charge','marrow']);
 for(const n of Object.values(found))assert.ok(n>100);
 assert.equal(biomeSpeedFactor('marrow'),.68);
 assert.equal(biomeSpeedFactor('acid'),1);
 assert.equal(biomeDamage('acid'),6);
 assert.equal(biomeDamage('charge'),8);
 assert.equal(biomeDamage('marrow'),0);
 assert.equal(biomeRuptureHeal(1),6);
 assert.equal(biomeRuptureHeal(3),0);
 assert.ok(biomeSpawnWeight(3)>biomeSpawnWeight(2));
});
test('legacy saves migrate without losing ruptures while v4 tags each biome',()=>{
 const legacy={v:3,seed:413,x:4,z:5,wave:3,hp:75,maxHp:100,ruptured:['3,6','3,6','-8,1'],ruptureCount:2};
 const migrated=validateRun(legacy);
 assert.equal(migrated.v,5);
 assert.deepEqual(migrated.ruptured,['3:3,6','3:-8,1']);
 assert.equal(migrated.wave,3);
 assert.deepEqual(validateRun(migrated),migrated);
 const latest=validateRun({...migrated,ruptured:['1:3,6','2:4,7','4:6,6']});
 assert.deepEqual(latest.ruptured,['1:3,6','2:4,7','4:6,6']);
});
