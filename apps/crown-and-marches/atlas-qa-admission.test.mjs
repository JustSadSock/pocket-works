import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSuites,resolveTasks,ROOT} from '../../scripts/universal-qa/plan.mjs';
const app='crown-and-marches';
test('manifest admits full PR plan and preserves independent Resident groups',()=>{
 const suites=loadSuites(ROOT,app);assert.equal(suites.length,16);
 const smoke=resolveTasks(ROOT,{apps:[app],profile:'smoke',pullRequest:true});
 const deep=resolveTasks(ROOT,{apps:[app],profile:'deep',pullRequest:true});
 const research=smoke.filter(t=>t.suite==='resident-stabilization');assert.deepEqual(research.map(t=>t.seed),[0,1,2,3,4,5,6,7,8,9,10,11]);assert.ok(research.every(t=>t.kind==='browser-node'));
 assert.deepEqual(smoke.filter(t=>t.suite==='wealth-sinews-experiments').map(t=>t.seed),[0,1,2,3]);
 assert.ok(smoke.some(t=>t.suite==='geography-review'));assert.equal(deep.length-smoke.length,5);
 assert.equal(smoke.length,34);
 const targeted=resolveTasks(ROOT,{apps:[app],suite:'resident-stabilization'});assert.equal(targeted.length,12);
});
