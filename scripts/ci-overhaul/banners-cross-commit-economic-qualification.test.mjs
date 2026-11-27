import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyCosts,validateHistoricalFresh} from './banners-cross-commit-economic-qualification.mjs';
const now=1795800000000,base={source:'8c70528d57134a01558a3b9d5bef8d1e34d429a3',target:'ce4bc09ba2a105f6e8db0a8a0153da079f4e2c5f',issuer:'3b4294292ba7aed4034231c8bc5ec277073bdfae',observedAt:now};
const rows=(cost)=>[1,2,3].map(i=>({...base,id:String(i),costMs:cost+i}));
test('whole-matrix lower and upper costs include issuance and measured hits',()=>{
 const r=qualifyCosts(rows(3300000),rows(900000),3600000,now);
 assert.equal(r.decision,'cost-qualified-candidate');assert.equal(r.issuanceShareMs,1200000);assert.equal(r.productionAuthorization,false);
 assert.equal(qualifyCosts(rows(3300000),rows(900000),9000000,now).decision,'fresh');
});
test('unknown, duplicate, incompatible or stale costs remain fresh',()=>{
 const f=rows(3300000),m=rows(900000);
 for(const x of [m.slice(1),[m[0],m[0],m[2]],m.map(r=>({...r,target:'other'})),m.map(r=>({...r,observedAt:now-8*86400000}))])assert.equal(qualifyCosts(f,x,3600000,now).decision,'fresh');
});

test('legacy summary without newer identity fields is valid only with complete original fresh rows',()=>{
 const results=Array.from({length:21},(_,i)=>({schema:1,app:'banners-of-war',key:i<8?'banners-of-war-completion-lab-'+i:'other-'+i,suite:i<8?'completion-lab':'other',kind:'node',seed:i,install:false,success:true,exitCode:0,signal:null,timedOut:false,durationMs:100}));
 const g={schema:1,expected:21,passed:21,failed:0,missing:[],success:true,results};
 assert.equal(validateHistoricalFresh(g),true);
 assert.throws(()=>validateHistoricalFresh({...g,results:results.slice(1)}));
 assert.throws(()=>validateHistoricalFresh({...g,results:[{...results[0],verificationMode:'historical'},...results.slice(1)]}));
});
