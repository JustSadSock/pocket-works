import test from 'node:test';
import assert from 'node:assert/strict';
import {controlCases,controlTrial} from './control-lab.mjs';
test('paired control matrix separates physical side and controller assignment',()=>{
 const cases=controlCases(),keys=new Set(cases.map(k=>JSON.stringify(k)));
 assert.equal(keys.size,cases.length);
 assert.equal(cases.length,174);
 for(const k of cases)assert.ok(keys.has(JSON.stringify({...k,mirror:!k.mirror})));
 for(const k of controlCases('command'))assert.ok(keys.has(JSON.stringify({...k,swapPolicies:!k.swapPolicies})));
});
test('equal material and same command have deterministic control inputs', {timeout:120000},()=>{
 const k={factor:'standard-control',suite:'control',seed:11,mirror:false,swapPolicies:false,seconds:30};
 const a=controlTrial(k),b=controlTrial({...k,mirror:true});
 assert.equal(a.initialReference,a.initialChallenger);
 assert.equal(b.initialReference,b.initialChallenger);
 assert.ok(Math.abs(a.initialScore)<1e-10&&Math.abs(b.initialScore)<1e-10);
 assert.deepEqual(controlTrial(k),a);
 assert.equal(a.rounds,1);assert.equal(b.rounds,1);
 const another=controlTrial({...k,seed:47});
 assert.notDeepEqual(a.initialPositions,another.initialPositions);
 assert.ok(Math.abs(another.initialScore)<1e-10);
});
