import test from 'node:test';
import assert from 'node:assert/strict';
import {carveStoneFloor,carveButtressFace,courtMaterialSignature} from '../court-materials.mjs';
function surface(){
 const operations=[];
 const c=new Proxy({},{
  get(obj,key){
   if(key in obj)return obj[key];
   if(key==='createLinearGradient')return(...args)=>{
    operations.push(['gradient',...args]);
    return{__testGradient:true,addColorStop:(...data)=>operations.push(['stop',...data])};
   };
   return(...args)=>{operations.push([String(key),...args])};
  },set(obj,key,val){obj[key]=val;operations.push(['property',String(key),val?.__testGradient?'linear-gradient':val]);return true}
 });
 return{c,operations};
}
test('stone material is deterministic, geographically constrained and substantive',()=>{
 const first=surface(),second=surface();
 carveStoneFloor(first.c);carveStoneFloor(second.c);
 assert.deepEqual(first.operations,second.operations);
 assert.ok(first.operations.filter(x=>x[0]==='fillRect').length>150);
 assert.ok(first.operations.some(x=>x[0]==='gradient'));
 assert.equal(courtMaterialSignature().deterministic,true);
});
test('raised buttresses receive a dimensional mineral face on both wall shapes',()=>{
 for(const wall of [{x:102,y:180,w:64,h:54},{x:232,y:385,w:66,h:56}]){
  const s=surface();carveButtressFace(s.c,wall,0);
  assert.ok(s.operations.filter(x=>x[0]==='fillRect').length>36);
  assert.ok(s.operations.filter(x=>x[0]==='stroke').length>=5);
 }
});
