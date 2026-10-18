import test from 'node:test';
import assert from 'node:assert/strict';
import {RogueWorld,generateSector} from '../rogue-world.mjs';
import {rogueStaticMesh} from '../rogue-scene.mjs';
import {VISUAL_SEEDS,VISUAL_SCENES,visualBookmark,visualCoverage} from '../visual-baseline.mjs';

test('fixed art-reference scenes point to walkable geometry across deterministic seeds',()=>{
 for(const seed of VISUAL_SEEDS){
  const world=new RogueWorld(seed);
  for(const name of VISUAL_SCENES){
   const shot=visualBookmark(world,name);
   assert.ok(shot,`missing ${name} seed ${seed}`);
   assert.ok(world.canStand(shot.x,shot.z),`camera placed in furniture for ${name}/${seed}`);
   assert.ok(Number.isFinite(shot.yaw)&&Number.isFinite(shot.pitch));
  }
 }
});
test('art additions preserve existing generated layouts and deterministic prop identities',()=>{
 for(let seed=1;seed<=120;seed++){
  const baseline=generateSector(seed,0,0);
  const world=new RogueWorld(seed);
  const coverage=visualCoverage(world,null);
  assert.ok(coverage.propTypes.length>=10);
  assert.equal(world.canStand(9.5,9.5),true);
  for(const drop of baseline.drops)assert.ok(world.canStand(drop.x,drop.z));
  assert.deepEqual([...generateSector(seed,0,0).tiles],[...baseline.tiles]);
  assert.deepEqual(generateSector(seed,0,0).props,baseline.props)
 }
});
test('new detail pass increases actual 3D geometry with a bounded vertex format',()=>{
 for(const seed of VISUAL_SEEDS){
  const w=new RogueWorld(seed);
  const scene=rogueStaticMesh(w,{x:9.5,z:9.5});
  assert.equal(scene.length%10,0);
  assert.ok(scene.length>420000,`detail unexpectedly missing seed ${seed}`);
  assert.ok(scene.length<1000000,`scene LOD too heavy seed ${seed}`);
  assert.ok(scene.every(Number.isFinite));
 }
});
test('room-family and material coverage remains visible across reference seeds',()=>{
 for(const seed of VISUAL_SEEDS){
  const coverage=visualCoverage(new RogueWorld(seed),null);
  for(const type of ['living','kitchen','bedroom','bathroom','closet','nursery'])
   assert.ok(coverage.roomTypes.includes(type),`missing ${type}`);
  for(const prop of ['sofa','wallunit','fridge','table','bed','bath','sink'])
   assert.ok(coverage.propTypes.includes(prop),`missing ${prop}`)
 }
});
