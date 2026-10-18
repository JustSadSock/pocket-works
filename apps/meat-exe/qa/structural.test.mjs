import test from 'node:test';
import assert from 'node:assert/strict';
import {STRUCTURAL_CHAMBERS,structuralChamber,structuralLandmarkSafe} from '../structuralArt.js';
import {setSeed,generateOrgan,getTissueNodes} from '../organGen.js';
import {stageSeed} from '../biomes.js';
test('nine physical chamber signatures are repeatable and visually distinct',()=>{
 const types=new Set();
 for(let seed=0;seed<500;seed++){
  for(const biome of Object.keys(STRUCTURAL_CHAMBERS)){
   const origin=structuralChamber(0,0,seed,biome);
   assert.equal(origin.type,STRUCTURAL_CHAMBERS[biome][0]);
   for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){
    const a=structuralChamber(x,z,seed,biome);
    assert.deepEqual(a,structuralChamber(x,z,seed,biome));
    assert.ok(a.ribs>=2&&a.ribs<=4&&a.filaments>=3&&a.filaments<=6);
    types.add(a.type);
   }
  }
 }
 assert.equal(types.size,9);
 assert.equal(structuralChamber(0,0,20,'gastric'),null);
});
test('suspended features cannot intersect the eye-height hitscan lane',()=>{
 assert.ok(structuralLandmarkSafe(2.02,.65,.88));
 assert.ok(!structuralLandmarkSafe(1.4,.7,.88));
 assert.ok(!structuralLandmarkSafe(2.10,.8,1.1));
 assert.ok(!structuralLandmarkSafe(NaN,.5,.7));
});
test('structural generation leaves portal connectivity and tissue gates untouched',()=>{
 for(let seed=0;seed<500;seed++){
  for(const wave of [1,3,4]){
   setSeed(stageSeed(seed*71+413,wave));
   const before=generateOrgan(0,0),gates=getTissueNodes(0,0);
   const biome=wave===1?'vascular':wave===3?'marrow':'neural';
   for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)structuralChamber(x,z,seed,biome);
   assert.deepEqual(generateOrgan(0,0),before);
   assert.deepEqual(getTissueNodes(0,0),gates);
  }
 }
});
