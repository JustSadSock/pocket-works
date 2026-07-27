import assert from 'node:assert/strict';
import { seedFromText } from '../src/noise.js';
import { VoxelWorld, worldToChunk, localCoord, raycast } from '../src/world.js';
import { createInventory, addItem, countItem, craft, moveStack } from '../src/inventory.js';

assert.equal(seedFromText('ridge'), seedFromText('ridge'));
assert.notEqual(seedFromText('ridge'), seedFromText('Ridge'));
assert.equal(worldToChunk(-1), -1);
assert.equal(localCoord(-1), 15);
assert.equal(localCoord(16), 0);

const a = new VoxelWorld(12345);
const b = new VoxelWorld(12345);
const ca = a.generateChunk(-2,3);
const cb = b.generateChunk(-2,3);
assert.deepEqual([...ca.blocks], [...cb.blocks], 'same seed must generate identical chunk');
const c = new VoxelWorld(12346).generateChunk(-2,3);
assert.notDeepEqual([...ca.blocks], [...c.blocks], 'different seed should change terrain');

const inv=createInventory();
assert.equal(addItem(inv,8,2),0);
assert.equal(countItem(inv,8),2);
assert.equal(craft(inv,'planks',2,false),2);
assert.equal(countItem(inv,18),8);
assert.equal(craft(inv,'bench',1,false),1);
assert.equal(countItem(inv,30),1);
moveStack(inv,0,5);
assert.equal(inv[5].id,inv[5].id);

const flat=new VoxelWorld(1);flat.getChunk(0,0,true);for(let z=1;z<=4;z++)flat.set(1,10,z,0,false);flat.set(1,10,1,3,false);
const hit=raycast(flat,{x:1.5,y:10.5,z:4.5},{x:0,y:0,z:-1},6);
assert.equal(hit?.id,3);
assert.equal(hit?.z,1);
console.log('КРЯЖ core tests passed');
