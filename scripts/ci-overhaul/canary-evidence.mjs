// Candidate verdicts are independently reconstructed from task evidence.
import {canonical,digest,taskDigest} from './verified-results.mjs';
import {compareEvidence} from './pilot.mjs';
import {canaryOutcome} from './migration-gate.mjs';

export function verdict(tasks,records,tree){
 if(!/^[a-f0-9]{40}$/.test(tree)||!Array.isArray(tasks)||!tasks.length||new Set(tasks.map(t=>t.key)).size!==tasks.length)throw Error('Invalid canary plan');
 if(!Array.isArray(records)||records.length!==tasks.length)throw Error('Incomplete canary evidence');
 const byKey=new Map();
 for(const r of records){
  if(!r||byKey.has(r.key)||!tasks.some(t=>t.key===r.key))throw Error('Unexpected or duplicate canary evidence');
  byKey.set(r.key,r);
 }
 const passed=[],failed=[];
 for(const t of tasks){
  const r=byKey.get(t.key);
  if(r.schema!==1||typeof r.success!=='boolean'||canonical(Object.fromEntries(Object.keys(t).map(k=>[k,r[k]])))!==canonical(t))throw Error('Canary task identity mismatch: '+t.key);
  if(compareEvidence([t],{[t.key]:r},{[t.key]:r}).success)passed.push(t);else failed.push(t);
 }
 return {tree,planDigest:digest(canonical(tasks.map(taskDigest).sort())),expected:tasks.length,finalPassed:passed.length,passedTaskDigests:passed.map(taskDigest).sort(),failed:failed.map(t=>t.key),success:failed.length===0};
}
export function recover(tasks,first,retries,tree){
 const initial=verdict(tasks,first,tree),failed=new Set(initial.failed);
 if(!Array.isArray(retries)||retries.length!==failed.size||new Set(retries.map(r=>r.key)).size!==failed.size||retries.some(r=>!failed.has(r.key)))throw Error('Invalid retry coverage');
 if(retries.length)verdict(tasks.filter(t=>failed.has(t.key)),retries,tree);
 const byKey=new Map(retries.map(r=>[r.key,r]));
 const final=verdict(tasks,first.map(r=>byKey.get(r.key)??r),tree);
 return {...final,firstPass:initial.finalPassed,recovered:final.finalPassed-initial.finalPassed,firstAttemptFailures:initial.failed};
}
export function legacyVerdict(tasks,summary,tree,sourceConclusion){
 if(sourceConclusion!=='success')return null;
 if(summary?.schema!==1||summary.success!==true||summary.expected!==tasks.length||summary.passed!==tasks.length||summary.failed!==0||!Array.isArray(summary.missing)||summary.missing.length)throw Error('Original successful workflow evidence incomplete');
 const v=verdict(tasks,summary.results,tree);
 if(!v.success)throw Error('Original successful workflow has invalid task evidence');
 return v;
}
export function shadowDecision(legacy,integrated){
 return {...canaryOutcome({legacy,integrated}),experimental:true,productionChanged:false};
}
