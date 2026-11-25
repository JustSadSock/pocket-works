// Advisory estimates only: no historical result can satisfy delivery coverage.
// Measured on 2026-11-25, run 45685258405, job 139456962520.
// Seed 0 took about eight minutes; seed 1 was interrupted by a new PR head.
// Seed 5 was much faster. Isolate the family conservatively until per-task
// timings from completed live runs support narrower estimates.
export function liveSchedulingHistory(tasks){
 const history=Object.create(null);
 for(const t of tasks){
  if(t.app==='crown-and-marches'&&t.suite==='balance-experiments'&&
     t.kind==='node'&&Number.isSafeInteger(t.seed)){
   history[t.key]=900000;
  }
 }
 return history;
}
