import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyEnvironment,aggregate,CONTROLLER,SOURCE_RUN} from './gameplay-portability-probe.mjs';
import {SOURCE,PLAN} from './verified-gameplay-receipt.mjs';
test('environment classifier never hides changed fields',()=>{
 const a={cpu:'x',kernel:'a',node:'v'};
 assert.equal(classifyEnvironment(a,a).category,'exact');
 assert.equal(classifyEnvironment(a,{...a,kernel:'b'}).category,'kernel-only');
 assert.equal(classifyEnvironment(a,{...a,cpu:'y'}).category,'cpu-only');
 assert.equal(classifyEnvironment(a,{...a,cpu:'y',kernel:'b'}).category,'cpu-and-kernel');
 assert.equal(classifyEnvironment(a,{...a,node:'w'}).category,'other');
 assert.throws(()=>classifyEnvironment(a,{...a,extra:'x'}));
});
const ctx={run:1,attempt:1,commit:'a'.repeat(40)},digest='b'.repeat(64);
const fixture=()=>Array.from({length:8},(_,i)=>{
 const n=i<4?234:233,sizes=({0:[150],4:[26],5:[40],6:[60],7:[100]})[i]??[];
 return {schema:1,...ctx,controller:CONTROLLER,sourceRun:SOURCE_RUN,source:SOURCE,planDigest:PLAN,shard:i,category:'kernel-only',changedFields:['kernel'],sourceEnvironment:{cpu:'x',kernel:'a'},targetEnvironment:{cpu:'x',kernel:'b'},gameplayCases:n,freshGameplayCases:n,freshGameplayMeasurements:[4,5].includes(i)?428:430,sourceSemanticDigest:digest,freshSemanticDigest:digest,semanticMatch:true,performance:sizes.map(units=>({units,plannerMs:1,physicsMs:2})),freshPerformanceMeasurements:sizes.length*2,productionAuthorization:false,allowResultReuse:false,allowImpactSkipping:false};
});
test('complete fresh matrix required, no reuse or semantic mismatch permitted',()=>{
 const r=aggregate(fixture(),ctx);assert.equal(r.freshGameplayCases,1868);assert.equal(r.freshGameplayMeasurements,3436);assert.equal(r.categories['kernel-only'].cases,1868);assert.equal(r.productionAuthorization,false);
 for(const mutate of [x=>x.pop(),x=>{x[1].shard=0},x=>{x[1].semanticMatch=false},x=>{x[1].freshGameplayCases=0},x=>{x[4].performance=[]},x=>{x[1].category='exact'},x=>{x[1].productionAuthorization=true},x=>{x[1].freshGameplayMeasurements=428}]){const rows=fixture();mutate(rows);assert.throws(()=>aggregate(rows,ctx));}
});
