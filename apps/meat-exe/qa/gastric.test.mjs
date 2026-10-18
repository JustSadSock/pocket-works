import test from 'node:test';
import assert from 'node:assert/strict';
import {GASTRIC_CHAMBERS,gastricChamber,gastricLandmarkSafe} from '../gastricArt.js';
import {setSeed,generateOrgan,getTissueNodes} from '../organGen.js';
test('three gastric chamber styles are deterministic and not recolours',()=>{
 assert.deepEqual(GASTRIC_CHAMBERS,['pylorus','cistern','rugae']);
 const kinds=new Set();
 for(let seed=0;seed<500;seed++){
  assert.equal(gastricChamber(0,0,seed).type,'pylorus','first gastric room has landmark');
  for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){
   const a=gastricChamber(x,z,seed),b=gastricChamber(x,z,seed);
   assert.deepEqual(a,b);
   kinds.add(a.type);assert.ok(a.arches>=1&&a.arches<=3);
   assert.ok(a.folds>0&&a.hang>0);
  }
 }
 assert.equal(kinds.size,3);
});
test('large chamber landmarks remain above movement and shot lanes',()=>{
 for(const type of GASTRIC_CHAMBERS){
  assert.ok(gastricLandmarkSafe(type,2.15,.9));
  assert.ok(!gastricLandmarkSafe(type,1.3,.9));
  assert.ok(!gastricLandmarkSafe(type,2.2,1.8));
 }
});
test('stomach structural art leaves generator cells and gates unchanged',()=>{
 for(let seed=0;seed<500;seed++){
  setSeed(seed*73+413);
  const before=generateOrgan(0,0),tissues=getTissueNodes(0,0);
  for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)gastricChamber(x,z,seed);
  assert.deepEqual(generateOrgan(0,0),before);
  assert.deepEqual(getTissueNodes(0,0),tissues);
 }
});
