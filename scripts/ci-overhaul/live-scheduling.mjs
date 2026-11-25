// Advisory scheduling estimates; task identity and complete delivery remain unchanged.
// Crown: completed live run 45710896020, seed 3 job 139544988005 took 936s.
// Banners: full original completion seed 0 took 601161ms and 593025ms in
// 45717048670; earlier grouped completion jobs were cancelled after 21min.
// Conservative isolation prevents consecutive long simulations in one shard.
export function liveSchedulingHistory(tasks){
 const history=Object.create(null);
 for(const t of tasks){
  if(t.kind!=='node'||t.install!==false||!Number.isSafeInteger(t.seed))continue;
  if(t.app==='crown-and-marches'&&t.suite==='balance-experiments'&&t.seed>=0&&t.seed<=5&&
     t.key==='crown-and-marches-balance-experiments-'+t.seed){
   history[t.key]=t.seed===3?1200000:900000;
  }else if(t.app==='banners-of-war'&&t.suite==='completion-lab'&&t.seed>=0&&t.seed<=7&&
     t.key==='banners-of-war-completion-lab-'+t.seed){
   history[t.key]=900000;
  }
 }
 return history;
}
