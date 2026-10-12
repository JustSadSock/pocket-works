import { describe, expect, it } from 'vitest';
import { inspectRoom, newRoom } from './core';

describe('miniature room',()=>{
 it('starts with a valid furnished interior',()=>{
  const result=inspectRoom(newRoom());
  expect(result.itemCount).toBeGreaterThan(6);
  expect(result.uniqueIds).toBe(true);
  expect(result.placementValid).toBe(true);
 });
 it('ignores invalid import entries',()=>{
  const result=inspectRoom({items:[{id:'oops',type:'not-a-real-object'}]});
  expect(result.itemCount).toBe(0);
 });
});
