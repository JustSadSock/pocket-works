import test from 'node:test';
import assert from 'node:assert/strict';
import {appendHallFixtures} from '../rogue-detail.mjs';

const create=(x,z,seed=19,epoch=0,walls=[[1,0]])=>{
 const out=[];
 appendHallFixtures(out,{x,z,px:x*1.27,pz:z*1.27,seed,epoch,tile:1.27,walls});
 return out
};
test('hall fixture geometry is repeatable, bounded and uses the WebGL vertex ABI',()=>{
 for(let z=-10;z<=10;z++)for(let x=-10;x<=10;x++){
  const a=create(x,z,251),b=create(x,z,251);
  assert.deepEqual(a,b);
  assert.equal(a.length%10,0);
  assert.ok(a.length<16000,'a single corridor tile may not create huge meshes');
  assert.ok(a.every(Number.isFinite));
  for(let i=0;i<a.length;i+=10){
   assert.ok(a[i+1]>=-.001&&a[i+1]<=2.65,'wall fixtures cannot occupy another floor');
   assert.ok(a[i+9]>=1&&a[i+9]<=11,'valid atlas slot');
  }
 }
});
test('sparse Soviet corridor geometry varies by sector and never invents a wall surface',()=>{
 const counts=new Set(),noWall=[];
 for(let z=0;z<30;z++)for(let x=0;x<30;x++){
  counts.add(create(x,z,14).length);
  appendHallFixtures(noWall,{x,z,px:x*1.27,pz:z*1.27,seed:14,walls:[],tile:1.27});
 }
 assert.ok(counts.has(0),'some hallway tiles must remain clean');
 assert.ok([...counts].some(n=>n>0),'other hallway tiles must have details');
 assert.ok(counts.size>=3,'must contain several different silhouettes');
 assert.ok(noWall.every(Number.isFinite),'standalone ceiling lamps remain valid without a wall')
});
