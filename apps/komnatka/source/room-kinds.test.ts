import {describe,it,expect} from 'vitest';
import {ROOM_KINDS,roomKind,MATERIALS,itemMaterial,recommendedFor} from './room-kinds.js';
import {sanitize,emptyRoom} from './state.js';
import {CATALOG,byType} from './models.js';
describe('v1.2 real room purpose and material data',()=>{
 it('keeps five distinct purposes separate from floor shape',()=>{
  expect(ROOM_KINDS.map(k=>k.id)).toEqual(['living','bedroom','kitchen','nursery','study']);
  expect(roomKind('unknown')).toBe('living');
  for(const kind of ROOM_KINDS){
   expect(kind.recommended.length).toBeGreaterThan(4);
   expect(kind.recommended.every(id=>Boolean(byType[id]))).toBe(true);
  }
  const r=emptyRoom('nook','kitchen');
  expect([r.layout,r.purpose]).toEqual(['nook','kitchen']);
  expect(r.items).toEqual([]);
 });
 it('persists genuine material variants and migrates old saves',()=>{
  expect(MATERIALS).toHaveLength(7);
  const legacy=sanitize({layout:'classic',items:[{id:'old',type:'chair',x:0,z:0,rot:0}]});
  expect(legacy.purpose).toBe('living');
  expect(legacy.items[0].material).toBe('linen');
  const saved=sanitize({purpose:'study',layout:'narrow',items:[{id:'oak',type:'desk',x:0,z:0,rot:0,material:'walnut'}]});
  expect(saved.purpose).toBe('study');
  expect(saved.items[0].material).toBe('walnut');
  expect(itemMaterial('invalid')).toBe('linen');
 });
 it('adds individual models for each room purpose',()=>{
  expect(CATALOG.length).toBeGreaterThanOrEqual(42);
  expect(recommendedFor('kitchen','stove')).toBe(true);
  expect(recommendedFor('study','deskorganizer')).toBe(true);
  expect(recommendedFor('nursery','crib')).toBe(true);
 });
});
