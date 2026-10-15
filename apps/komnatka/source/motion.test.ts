import { describe, expect, it } from 'vitest';
import { clamp01, easeOut, settleWave, motionProfile, createMotionDirector } from './motion.js';

function fakeRoot(){
 const root={
  position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z}},
  rotation:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z}},
  scaling:{x:1,y:1,z:1,setAll(n){this.x=n;this.y=n;this.z=n}},
  getChildMeshes:()=>[],isDisposed:()=>root.dead===true,
  dispose(){root.dead=true},dead:false
 };
 return root;
}
describe('tactile room motion',()=>{
 it('easing curves stay within their bounds',()=>{
  for(const n of [-1,0,.15,.4,.8,1,2]){
   expect(clamp01(n)).toBeGreaterThanOrEqual(0);
   expect(clamp01(n)).toBeLessThanOrEqual(1);
   expect(easeOut(n)).toBeGreaterThanOrEqual(0);
   expect(easeOut(n)).toBeLessThanOrEqual(1);
  }
  expect(settleWave(0)).toBe(0);
  expect(settleWave(1)).toBeCloseTo(0,5);
 });
 it('soft and heavy items have distinct lift, squash and settling times',()=>{
  expect(motionProfile('bed').lift).toBeLessThan(motionProfile('mug').lift);
  expect(motionProfile('sofa').squash).toBeGreaterThan(motionProfile('coffee').squash);
  expect(motionProfile('plant').settle).toBeGreaterThan(motionProfile('books').settle);
 });
 it('motion never changes the saved room coordinates and settles exactly to base pose',()=>{
  const item={id:'sofa-1',type:'sofa',x:1,y:0,z:-2,rot:0};
  const root=fakeRoot();
  const director=createMotionDirector({getRoot:()=>root,getItem:()=>item});
  director.tick(0);director.appear(item.id);director.tick(90);
  expect(root.position.y).toBeGreaterThan(0);
  expect(item.x).toBe(1);expect(item.z).toBe(-2);
  director.tick(600);
  expect(root.position).toEqual(expect.objectContaining({x:1,y:0,z:-2}));
  expect(root.scaling.x).toBe(1);
  expect(director.hasMotion()).toBe(false);
 });
 it('pickup can be interrupted by rotate or rejected placement without stacking queues',()=>{
  const item={id:'chair',type:'chair',x:0,y:0,z:0,rot:0};
  const root=fakeRoot();
  const director=createMotionDirector({getRoot:()=>root,getItem:()=>item});
  director.tick(0);director.lift(item.id);director.tick(90);
  expect(root.position.y).toBeGreaterThan(0);
  item.rot=1;
  director.rotate(item.id,0);
  director.tick(190);
  expect(root.rotation.y).toBeGreaterThan(0);
  director.refuse(item.id);director.tick(500);
  expect(root.rotation.y).toBeCloseTo(Math.PI/2);
  expect(director.hasMotion()).toBe(false);
 });
 it('removed roots animate without reintroducing old items or changing state',()=>{
  const item={id:'old',type:'stool',x:0,y:0,z:0,rot:0};
  const root=fakeRoot();let available=true;
  const director=createMotionDirector({getRoot:()=>available?root:null,getItem:()=>available?item:null});
  director.tick(0);available=false;
  director.retire(item.id,root);
  director.tick(50);expect(root.dead).toBe(false);
  director.tick(190);expect(root.dead).toBe(true);
  expect(director.hasMotion()).toBe(false);
 });
 it('tabletop decorations follow the parent lift and settle without state changes',()=>{
  const table={id:'table',type:'coffee',x:1,y:0,z:1,rot:0};
  const books={id:'books',type:'books',x:1.2,y:.72,z:1,rot:0,support:'table'};
  const roots=new Map([['table',fakeRoot()],['books',fakeRoot()]]);
  const items=[table,books];
  const director=createMotionDirector({
   getRoot:id=>roots.get(id),getItem:id=>items.find(item=>item.id===id),getItems:()=>items
  });
  director.tick(0);director.lift('table');director.tick(130);
  expect(roots.get('table')!.position.y).toBeGreaterThan(.07);
  expect(roots.get('books')!.position.y).toBeCloseTo(.72+roots.get('table')!.position.y,5);
  director.land('table');director.tick(280);
  expect(roots.get('books')!.position.y).toBeCloseTo(.72+roots.get('table')!.position.y,5);
  director.tick(750);
  expect(roots.get('table')!.position.y).toBe(0);
  expect(roots.get('books')!.position.y).toBeCloseTo(.72,5);
  expect(books.y).toBe(.72);
 });
 it('reduced-motion preference snaps all visual responses to the canonical state',()=>{
  const item={id:'bed',type:'bed',x:-1,y:0,z:1,rot:2},root=fakeRoot();
  const director=createMotionDirector({getRoot:()=>root,getItem:()=>item,reducedMotion:()=>true});
  director.appear(item.id);director.lift(item.id);director.tick(100);
  expect(root.position.x).toBe(-1);
  expect(root.rotation.y).toBeCloseTo(Math.PI);
  expect(root.scaling.y).toBe(1);
 });
});
