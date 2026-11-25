import test from 'node:test';
import assert from 'node:assert/strict';
import {compare,project} from './simulation-repeatability.mjs';
const crown=['regional-growth','regional-overseas'].map(name=>({name,seed:name,days:1800,ms:10,initialPower:[1],finalPower:[2],stats:{},wars:[],samples:Array.from({length:5},(_,i)=>({day:(i+1)*360,ms:i,power:[2]}))}));
const banners=[0,1].map(seed=>({id:'example',series:'A',seed,repeat:seed,final:{time:120,loss:[1,2]},trajectory:[{time:120}],result:null,resultReason:null,plannerMs:10,physicsMs:20}));
test('only documented top-level runtime fields are excluded',()=>{
 const c=structuredClone(crown);c[0].ms=40;
 const r=compare('crown',crown,c);assert.equal(r.semanticMatch,true);assert.equal(r.rawMatch,false);assert.equal(r.canSkip,false);
 c[0].samples[0].ms=99;assert.equal(compare('crown',crown,c).semanticMatch,false);
 const b=structuredClone(banners);b[1].plannerMs=33;b[1].physicsMs=55;assert.equal(compare('banners',banners,b).semanticMatch,true);
 b[1].final.time=121;assert.equal(compare('banners',banners,b).semanticMatch,false);
});
test('missing cases, duplicate identities, reordered cases, malformed timing reject',()=>{
 assert.throws(()=>project('crown',crown.slice(0,1)),/exactly two/);
 assert.throws(()=>project('banners',[banners[0],banners[0]]),/Duplicate/);
 assert.throws(()=>compare('banners',banners,[...banners].reverse()),/identity mismatch/);
 assert.throws(()=>project('crown',[{...crown[0],ms:-1},crown[1]]),/timing/);
});
