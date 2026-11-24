import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPilot,compareEvidence } from './pilot.mjs';
const tasks=['a','b','c'].map(app=>({key:app+'-suite',app,suite:'suite',kind:'node-test',seed:null,install:false}));
const raw='cpu_matrix='+JSON.stringify({include:tasks})+'\nbrowser_matrix={"include":[]}\nexpected='+JSON.stringify(tasks.map(t=>t.key));
const evidence=Object.fromEntries(tasks.slice(0,2).map(t=>[t.key,{schema:1,...t,success:true,exitCode:0,signal:null,timedOut:false}]));
test('pilot selection is deterministic and bounded',()=>{
  assert.deepEqual(selectPilot(raw).tasks,tasks.slice(0,2));
  assert.throws(()=>selectPilot('cpu_matrix={"include":[]}\nbrowser_matrix={"include":[]}\nexpected=[]'),/at least two/);
});
test('pilot requires both complete, successful sets of real evidence',()=>{
  const expected=tasks.slice(0,2);
  assert.equal(compareEvidence(expected,evidence,evidence).success,true);
  assert.equal(compareEvidence(expected,evidence,{}).success,false);
  assert.equal(compareEvidence(expected,evidence,{...evidence,other:{}}).success,false);
  for(const patch of [{success:false},{seed:10},{exitCode:1},{timedOut:true},{signal:'SIGKILL'}]){
    assert.equal(compareEvidence(expected,evidence,{...evidence,'a-suite':{...evidence['a-suite'],...patch}}).success,false);
  }
});
