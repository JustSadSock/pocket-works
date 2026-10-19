import test from 'node:test';
import assert from 'node:assert/strict';
import {SpellChoreography,MAX_SPELL_MOTIFS,MAX_SPELL_PROJECTILES,MAGE_SIGNS,
 drawSpellGround,drawSpellActors,drawSpellProjectiles,drawSpellForeground}
 from '../spell-choreography.mjs';

const state=(round=1,serial=0,fx=[])=>({
 phase:'fight',round,serial,ticks:25,fx,
 actors:[{id:0,x:100,y:260,mageId:'kindle',cast:.4},{id:1,x:300,y:350,mageId:'coil',cast:.1}],
 shots:[],mines:[],barriers:[]
});
function fakeCanvas(){
 const operations=[];
 const c={
 save:()=>operations.push('save'),restore:()=>operations.push('restore'),
 fillRect:(...p)=>operations.push(['rect',...p]),beginPath:()=>{},
 moveTo:(...p)=>operations.push(['move',...p]),
 lineTo:(...p)=>operations.push(['line',...p]),
 stroke:()=>operations.push('stroke'),fill:()=>operations.push('fill'),
 arc:(...p)=>operations.push(['arc',...p])
 };
 return {ctx:c,operations};
}
test('all six mage signs are authored and not interchangeable',()=>{
 assert.equal(new Set(MAGE_SIGNS).size,6);
 const s=state(1,1,[{id:1,k:'shoot',x:100,y:260}]);
 const signatures=[];
 for(const m of MAGE_SIGNS){
  s.actors[0].mageId=m;s.shots=[{x:102,y:260,vx:270,vy:0,owner:0,element:'fire'}];
  const p=new SpellChoreography();p.ingest(s);
  assert.equal(p.motifs[0].style,m);
  const {ctx,operations}=fakeCanvas();
  drawSpellGround(ctx,p,false);
  signatures.push(JSON.stringify(operations));
 }
 assert.equal(new Set(signatures).size,6);
});
test('confirmed heat reactions remain distinct and do not affect their authoritative snapshot',()=>{
 const s=state(1,3,[
  {id:1,k:'react_steam',x:195,y:300},
  {id:2,k:'react_crack',x:198,y:300},
  {id:3,k:'react_slag',x:201,y:300}
 ]);
 const original=JSON.stringify(s),p=new SpellChoreography();
 p.ingest(s);assert.equal(p.motifs.length,3);
 const outputs=[];
 for(const kind of ['react_steam','react_crack','react_slag']){
  const {ctx,operations}=fakeCanvas();
  drawSpellGround(ctx,{motifs:p.motifs.filter(x=>x.reaction===kind)});
  drawSpellForeground(ctx,{motifs:p.motifs.filter(x=>x.reaction===kind)});
  outputs.push(JSON.stringify(operations));
 }
 assert.equal(new Set(outputs).size,3);
 assert.equal(JSON.stringify(s),original);
});
test('single server event never repeats through reconnection and repeated frames',()=>{
 const p=new SpellChoreography();
 const s=state(1,2,[{id:1,k:'shoot',x:100,y:260},{id:2,k:'overload',x:300,y:350}]);
 p.ingest(s);p.ingest(s);
 assert.equal(p.motifs.length,2);
 const previous=p.motifs.map(m=>m.id);
 p.ingest(state(1,3,[{id:2,k:'overload',x:300,y:350},{id:3,k:'shield',x:102,y:270}]));
 assert.deepEqual(p.motifs.map(m=>m.id),[...previous,3]);
});
test('reset when the match changes, serial rewinds or simulation time rolls back',()=>{
 const p=new SpellChoreography();
 p.ingest(state(1,1,[{id:1,k:'shoot',x:100,y:260}]));
 p.ingest(state(2,2,[]));assert.equal(p.motifs.length,0);
 p.ingest(state(2,3,[{id:3,k:'dash',x:200,y:300}]));
 assert.equal(p.motifs.length,1);
 p.ingest(state(2,0,[]));assert.equal(p.motifs.length,0);
 p.ingest({...state(2,4,[{id:4,k:'shield',x:100,y:260}]),ticks:45});
 p.ingest({...state(2,5,[]),ticks:5});
 assert.equal(p.motifs.length,0);
});
test('dense spell volleys stay bounded and expire without accumulating indefinitely',()=>{
 const p=new SpellChoreography();
 const events=Array.from({length:90},(_,i)=>({id:i+1,k:i%2?'react_crack':'shoot',x:90+i,y:180+i}));
 const s=state(1,90,events);
 p.ingest(s);assert.equal(p.motifs.length,MAX_SPELL_MOTIFS);
 for(let i=0;i<35;i++)p.advance(.05);
 assert.equal(p.motifs.length,0);
 const {ctx,operations}=fakeCanvas();
 s.shots=Array.from({length:80},(_,i)=>({x:120+i,y:300,vx:200,vy:0,owner:i%2,style:'bolt'}));
 drawSpellProjectiles(ctx,s,1);
 assert.ok(operations.length>MAX_SPELL_PROJECTILES);
 assert.ok(operations.length<MAX_SPELL_PROJECTILES*70,'one bounded vector illustration per projectile');
});
test('reduced motion remains time-stable for projectiles and casting characters',()=>{
 const s=state();
 s.shots=[{x:130,y:200,vx:270,vy:0,owner:0,style:'arc',element:'storm'}];
 const capture=t=>{
  const {ctx,operations}=fakeCanvas();
  drawSpellProjectiles(ctx,s,t,true);drawSpellActors(ctx,s,t,true);
  return operations;
 };
 assert.deepEqual(capture(0),capture(19));
});
test('invalid events are ignored; effects do not create fake damage or hidden abilities',()=>{
 const p=new SpellChoreography(),s=state(1,4,[
  {id:1,k:'react_steam',x:NaN,y:200},
  {id:2,k:'react_crack',x:Infinity,y:310},
  {id:3,k:'secret_cast',x:100,y:250},
  {id:4,k:'impact_bolt',x:190,y:310}
 ]);
 p.ingest(s);
 assert.equal(p.motifs.length,1);
 assert.equal(p.motifs[0].kind,'impact');
 assert.ok(!('damage' in p.motifs[0]));
 assert.ok(!('runes' in p.motifs[0]));
});
test('every drawing pass balances canvas state and leaves simulation byte-identical',()=>{
 const s=state(1,4,[
  {id:1,k:'shoot',x:100,y:260},
  {id:2,k:'react_steam',x:230,y:220},
  {id:3,k:'impact_wave',x:300,y:350},
  {id:4,k:'overload',x:200,y:310}
 ]);
 s.shots=[{owner:0,x:103,y:262,vx:240,vy:30,style:'wave',element:'stone'}];
 const before=JSON.stringify(s),p=new SpellChoreography();
 p.ingest(s);const {ctx,operations}=fakeCanvas();
 drawSpellGround(ctx,p);drawSpellActors(ctx,s,1);drawSpellProjectiles(ctx,s,1);drawSpellForeground(ctx,p);
 assert.equal(operations.filter(x=>x==='save').length,operations.filter(x=>x==='restore').length);
 assert.equal(JSON.stringify(s),before);
});
