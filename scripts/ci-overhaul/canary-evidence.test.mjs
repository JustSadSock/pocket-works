import test from 'node:test';
import assert from 'node:assert/strict';
import {verdict,recover,legacyVerdict,shadowDecision} from './canary-evidence.mjs';
const tasks=['a','b'].map(app=>({key:app+'-test',app,suite:'test',kind:'node-test',seed:null,install:false}));
const tree='a'.repeat(40),ok=t=>({schema:1,...t,success:true,exitCode:0,signal:null,timedOut:false});
const records=tasks.map(ok);
test('independent candidate success cannot bypass failed or missing legacy verdict',()=>{
 const candidate=verdict(tasks,records,tree);
 assert.equal(candidate.success,true);
 assert.equal(legacyVerdict(tasks,null,tree,'failure'),null);
 assert.equal(shadowDecision(null,candidate).deliveryAllowed,false);
 assert.equal(shadowDecision(candidate,candidate).canaryPassed,true);
});
test('retry restores only failed tasks and retains first attempt history',()=>{
 const first=[records[0],{...records[1],success:false}];
 const r=recover(tasks,first,[records[1]],tree);
 assert.equal(r.firstPass,1);assert.equal(r.recovered,1);assert.equal(r.finalPassed,2);
 assert.deepEqual(r.firstAttemptFailures,[tasks[1].key]);
 assert.throws(()=>recover(tasks,first,[records[0]],tree),/retry coverage/);
});
test('reject missing, duplicate or changed task evidence',()=>{
 assert.throws(()=>verdict(tasks,[records[0]],tree),/Incomplete/);
 assert.throws(()=>verdict(tasks,[records[0],records[0]],tree),/duplicate/);
 assert.throws(()=>verdict(tasks,[records[0],{...records[1],seed:1}],tree),/identity/);
 assert.throws(()=>legacyVerdict(tasks,{success:true},tree,'success'),/incomplete/);
});
