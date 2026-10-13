import test from 'node:test';
import assert from 'node:assert/strict';
import { starter, sanitize } from './state.js';
import { sceneY } from './scene-position.js';

test('every starter room item has a finite render height including unpositioned floor furniture',()=>{
 const room=starter();
 assert.ok(room.items.some(x=>x.type==='sofa'&&x.y===undefined),'regression reproduced: sofa has no y in starter');
 for(const item of room.items){
  assert.equal(Number.isFinite(sceneY(item)),true,item.type);
  assert.equal(sceneY(item),item.y??0,item.type);
 }
});
test('newly placed large furniture without a y property stays visible at zero height',()=>{
 for(const type of ['sofa','bed','chair','rug','plant','coffee','floorlamp']){
  assert.equal(sceneY({id:'new',type,x:1,z:2}),0,type);
 }
 assert.equal(sceneY({y:undefined}),0);
 assert.equal(sceneY({y:NaN}),0);
 assert.equal(sceneY({y:.72}),.72);
 const repaired=sanitize({items:[{id:'chair',type:'chair',x:0,z:0}]});
 assert.equal(sceneY(repaired.items[0]),0);
});
