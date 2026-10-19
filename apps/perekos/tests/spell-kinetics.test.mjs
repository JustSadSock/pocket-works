import test from 'node:test';
import assert from 'node:assert/strict';
import {drawKineticProjectiles,ContactTheater,spellSilhouette,SHAPE_FAMILIES,MAX_KINETIC_SHOTS,MAX_CONTACTS} from '../spell-kinetics.mjs';

const shot=(style,element='fire',index=0)=>({style,element,owner:index%2,x:140+index,y:260+index,
 vx:style==='rock'?198:style==='bolt'?365:255,vy:17,r:style==='rock'?8:style==='wave'?12:style==='bolt'?3:style==='echo'?4:5,life:.9});
function fakeCanvas(){
 const ops=[];let depth=0;
 const ctx=new Proxy({},{
  get(obj,key){
   if(key==='depth')return depth;
   if(key in obj)return obj[key];
   return(...args)=>{
    if(key==='save')depth++;else if(key==='restore')depth--;
    ops.push([String(key),...args]);
    if(depth<0)throw Error('restore underflow');
   };
  },set(obj,key,value){obj[key]=value;ops.push(['set',String(key),value]);return true}
 });
 return {ctx,ops};
}
const state=(fx=[],round=1,serial=fx.length)=>({phase:'fight',round,serial,ticks:10,
 actors:[{id:0,mageId:'kindle',x:140,y:260},{id:1,mageId:'wire',x:290,y:350}],
 shots:[],fx});
test('all seven projectile materials have distinct shapes and bounded silhouette parameters',()=>{
 const names=['orb','flame','bolt','arc','rock','wave','echo'];
 assert.equal(Object.keys(SHAPE_FAMILIES).length,7);
 const result=names.map((style,i)=>{
  const s=state();s.shots=[shot(style,'storm',i)];
  const {ctx,ops}=fakeCanvas(),count=drawKineticProjectiles(ctx,s,.2);
  assert.equal(count,1);assert.equal(ctx.depth,0);
  assert.ok(ops.length>28,'style needs authored geometry: '+style);
  const r=spellSilhouette(s.shots[0]);assert.ok(r.mass>0&&r.scale>0&&r.trail>0);
  return JSON.stringify(ops);
 });
 assert.equal(new Set(result).size,7,'sprites must not be color swaps');
});
test('elemental modifications recolor a physical projectile without changing its shape family',()=>{
 const a=spellSilhouette(shot('rock','fire')),b=spellSilhouette(shot('rock','storm'));
 assert.equal(a.form,b.form);assert.notEqual(a.element,b.element);
 const fire=state();fire.shots=[shot('rock','fire')];
 const storm=state();storm.shots=[shot('rock','storm')];
 const aCanvas=fakeCanvas(),bCanvas=fakeCanvas();
 drawKineticProjectiles(aCanvas.ctx,fire,0,true);
 drawKineticProjectiles(bCanvas.ctx,storm,0,true);
 assert.notDeepEqual(aCanvas.ops,bCanvas.ops);
});
test('dense volleys reject corrupt records and cap work at twenty-four actual projectiles',()=>{
 const s=state();s.shots=[{x:NaN,y:200,vx:100,vy:0},...Array.from({length:80},(_,i)=>shot('bolt','storm',i))];
 const {ctx,ops}=fakeCanvas(),unchanged=JSON.stringify(s);
 assert.equal(drawKineticProjectiles(ctx,s,4),MAX_KINETIC_SHOTS);
 assert.equal(ctx.depth,0);
 assert.ok(ops.length<MAX_KINETIC_SHOTS*150,'performance must remain bounded');
 assert.equal(JSON.stringify(s),unchanged);
});
test('visual projectile diameter follows the authoritative style radius',()=>{
 for(const style of ['orb','flame','bolt','arc','rock','wave','echo']){
  const q=shot(style),s=state();s.shots=[q];
  const view=fakeCanvas();drawKineticProjectiles(view.ctx,s,0,{reduced:true});
  const transform=view.ops.find(o=>o[0]==='scale');
  assert.ok(transform,'missing scale for '+style);
  assert.equal(transform[1],1,'base hitbox should have baseline art size: '+style);
 }
 const bigger=shot('rock');bigger.r=12;
 const s=state();s.shots=[bigger];
 const view=fakeCanvas();drawKineticProjectiles(view.ctx,s,0,{reduced:true});
 assert.ok(view.ops.find(o=>o[0]==='scale')[1]>1);
});
test('reduced motion renders a byte-stable picture independent of time',()=>{
 const s=state();s.shots=[shot('arc','storm'),shot('flame','fire',3)];
 const snap=time=>{const {ctx,ops}=fakeCanvas();drawKineticProjectiles(ctx,s,time,{reduced:true});return ops};
 assert.deepEqual(snap(0),snap(100));
 assert.notDeepEqual(snap(0),snap(0).slice(0,3));
});
test('contact theater only consumes authoritative impact_* events, never hidden commands',()=>{
 const s=state([
  {id:1,k:'shoot',x:150,y:260},{id:2,k:'secret_blast',x:160,y:270},
  {id:3,k:'impact_rock',x:180,y:280},{id:4,k:'impact_arc',x:205,y:290}
 ],1,4);
 const original=JSON.stringify(s),theater=new ContactTheater();
 theater.ingest(s);assert.equal(theater.contacts.length,2);
 theater.ingest(s);assert.equal(theater.contacts.length,2,'same events must be idempotent');
 const {ctx,ops}=fakeCanvas();theater.draw(ctx);
 assert.ok(ops.length>40);assert.equal(ctx.depth,0);
 assert.equal(JSON.stringify(s),original,'rendering must not edit simulation snapshots');
});
test('seven contact styles have different confirmed silhouettes and expire cleanly',()=>{
 const figures=[];
 for(const kind of ['orb','flame','bolt','arc','rock','wave','echo']){
  const t=new ContactTheater();t.ingest(state([{id:1,k:'impact_'+kind,x:200,y:310}],1,1));
  const c=fakeCanvas();t.draw(c.ctx);figures.push(JSON.stringify(c.ops));
  for(let i=0;i<50;i++)t.advance(.05);
  assert.equal(t.contacts.length,0);
 }
 assert.equal(new Set(figures).size,7);
});
test('contact pool and round transitions are bounded; reduce motion is stable',()=>{
 const theater=new ContactTheater();
 const s=state(Array.from({length:99},(_,i)=>({id:i+1,k:'impact_wave',x:120+i,y:250})),1,99);
 theater.ingest(s);
 assert.equal(theater.contacts.length,MAX_CONTACTS);
 theater.ingest(state([{id:100,k:'impact_bolt',x:200,y:300}],1,100),true);
 const drawn=()=>{const c=fakeCanvas();theater.draw(c.ctx,true);return c.ops};
 const a=drawn();assert.deepEqual(drawn(),a);
 theater.ingest(state([],2,0),true);
 assert.equal(theater.contacts.length,0);
});
