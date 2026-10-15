import { describe, expect, it } from 'vitest';
import { catalogGestureIntent } from './catalog-gesture.js';
import { findSurfaceTarget } from './support-target.js';

describe('catalog gesture directions',()=>{
 it('drags inward from a desktop right dock, not sideways scrolling',()=>{
  expect(catalogGestureIntent(-28,2,false)).toBe('drag');
  expect(catalogGestureIntent(-90,-14,false)).toBe('drag');
  expect(catalogGestureIntent(0,40,false)).toBe('scroll');
 });
 it('drags upward from a mobile bottom dock but preserves carousel swipes',()=>{
  expect(catalogGestureIntent(2,-18,true)).toBe('drag');
  expect(catalogGestureIntent(18,2,true)).toBe('scroll');
  expect(catalogGestureIntent(-17,-1,true)).toBe('scroll');
  expect(catalogGestureIntent(3,3,true)).toBe('wait');
 });
});

describe('surface ray picking',()=>{
 const support={id:'table',x:0,z:0,top:.72,size:[1.58,1.08] as [number,number]};
 it('places décor at the visible top, not the projected floor point',()=>{
  const ray={origin:{x:.4,y:10,z:-.3},direction:{x:0,y:-1,z:0}};
  expect(findSurfaceTarget(ray,[support])).toEqual(expect.objectContaining({x:.4,z:-.3,y:.72,support:'table'}));
 });
 it('chooses the first actual top-plane intersection along a slanted ray',()=>{
  const lower={...support,id:'low',top:.52};
  const upper={...support,id:'high',top:1.02};
  const ray={origin:{x:.1,y:9,z:.1},direction:{x:.02,y:-1,z:.01}};
  expect(findSurfaceTarget(ray,[lower,upper])?.support).toBe('high');
 });
 it('ignores own surface, impossible rays and anything outside furniture',()=>{
  const ray={origin:{x:.4,y:10,z:-.3},direction:{x:0,y:-1,z:0}};
  expect(findSurfaceTarget(ray,[support],'table')).toBeNull();
  expect(findSurfaceTarget({origin:ray.origin,direction:{x:1,y:0,z:0}},[support])).toBeNull();
  expect(findSurfaceTarget({origin:{x:3,y:9,z:3},direction:{x:0,y:-1,z:0}},[support])).toBeNull();
 });
});
