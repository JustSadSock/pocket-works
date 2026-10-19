import test from 'node:test';
import assert from 'node:assert/strict';
import {DuelFeedback} from '../duel-feedback.mjs';

const actor=(id,x,y,mageId,cast=.45)=>({id,x,y,mageId,cast,face:id?Math.PI:0});
const sample=(round=1,serial=4)=>({phase:'fight',round,serial,ticks:1,actors:[
 actor(0,140,300,'wire'),actor(1,260,300,'slate')],
 fx:[{id:1,k:'shoot',x:140,y:300},{id:2,k:'hit',x:260,y:300},
 {id:3,k:'impact_rock',x:260,y:300},{id:4,k:'react_crack',x:260,y:300}]});
const context=()=>{
 const calls={draw:0};
 const ctx=new Proxy({canvas:{width:400,height:620}},{
  get(o,k){return k in o?o[k]:(...args)=>{calls.draw++;return undefined}},
  set(o,k,v){o[k]=v;return true}
 });
 return {ctx,calls};
};
test('genuine events spawn bounded effects without touching match state',()=>{
 const s=sample(),initial=JSON.stringify(s),view=new DuelFeedback();
 view.ingest(s);assert.ok(view.particles.length>20);assert.equal(view.scars.length,3);
 const count=view.particles.length;view.ingest(s);
 assert.equal(view.particles.length,count,'duplicate frames may not replay events');
 assert.equal(JSON.stringify(s),initial,'visuals must not mutate physics');
 const {ctx,calls}=context();
 view.ground(ctx);view.actors(ctx,s,.4);view.air(ctx);
 view.aim(ctx,s.actors[0],{x:380,y:255});
 assert.ok(calls.draw>25);
 for(let i=0;i<350;i++)view.advance(.02);
 assert.equal(view.particles.length,0);assert.equal(view.scars.length,0);
});
test('large event bursts are capped; new rounds remove every old stain',()=>{
 const view=new DuelFeedback(),s=sample();
 s.fx=Array.from({length:140},(_,i)=>({id:i+1,k:'impact_rock',x:180,y:200}));
 s.serial=140;view.ingest(s);
 assert.ok(view.particles.length<=100);assert.ok(view.scars.length<=24);
 view.ingest({...sample(2,145),fx:[]});
 assert.equal(view.particles.length,0);assert.equal(view.scars.length,0);
});
test('reduce motion avoids airborne particles but keeps readable confirmed stains',()=>{
 const view=new DuelFeedback(),s=sample();
 view.ingest(s,true);assert.equal(view.particles.length,0);
 assert.equal(view.scars.length,3);
 const {ctx}=context();
 assert.doesNotThrow(()=>view.actors(ctx,s,0,true));
 assert.doesNotThrow(()=>view.ground(ctx,true));
 assert.doesNotThrow(()=>view.aim(ctx,s.actors[0],{x:340,y:300},{reduced:true}));
});
