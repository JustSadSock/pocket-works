import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runIndependentGates,coreGates,appContractGates} from './validate-all-independent.mjs';
test('all checks run even after multiple preceding failures',()=>{
 const visited=[];
 const failed=runIndependentGates(['one','two','three','four'],name=>{
  visited.push(name);return name==='one'||name==='three'?1:0;
 });
 assert.deepEqual(visited,['one','two','three','four']);
 assert.deepEqual(failed,['one','three']);
});
test('independent success preserves a green result',()=>{
 assert.deepEqual(runIndependentGates(['x','y'],()=>0),[]);
});
test('app contracts are a focused subset of the exhaustive validation run',()=>{
 assert.ok(appContractGates.every(name=>coreGates.includes(name)));
 assert.ok(coreGates.includes('validate:pipeline'));
});
