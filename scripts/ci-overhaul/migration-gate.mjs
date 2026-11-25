// Migration routing is deliberately separate from workflow implementation.
// A missing or contradictory signal routes to full legacy QA, never a pass.
export function migrationDecision({policy,evidence,health}={}){
 const blockers=[];
 const need=(condition,message)=>{if(!condition)blockers.push(message);};
 need(policy?.schema===1&&policy.mode==='canary'&&policy.enabled===true,'Production canary not enabled');
 need(policy?.allowResultReuse===false&&policy?.allowImpactSkipping===false,'Canary must retain full original coverage');
 need(evidence?.integrated?.expected===180&&evidence?.integrated?.finalPassed===180&&evidence?.integrated?.success===true,'Integrated coverage incomplete');
 const cases=Array.isArray(evidence?.cases)?evidence.cases:[];
 const required={'crown-and-marches':20,'banners-of-war':19,maintenance:11};
 need(Array.isArray(cases)&&cases.length===3&&Object.entries(required).every(([id,count])=>cases.filter(c=>c?.id===id&&c.expected===count&&c.finalPassed===count&&c.success===true).length===1),'Independent replay coverage incomplete');
 need(evidence?.provenance?.success===true&&evidence?.provenance?.skippingEnabled===false,'Protected policy audit incomplete');
 need(evidence?.impact?.success===true&&evidence?.impact?.canSkip===false,'Impact graph safety audit incomplete');
 need(evidence?.verifiedByProtectedController===true,'Evidence not verified by protected controller');
 need(health?.legacyAvailable===true,'Legacy rollback unavailable');
 need(health?.branchProtectionVerified===true,'Required check transition not verified');
 need(health?.rollbackDrillPassed===true,'Rollback drill not passed');
 need(health?.currentRunHealthy===true,'Current infrastructure unhealthy or unknown');
 return {schema:1,route:blockers.length?'legacy-full':'dual-run-canary',blockers,
  legacyRequired:true,allowResultReuse:false,allowImpactSkipping:false,
  canReplaceLegacy:false};
}
export function canaryOutcome({legacy,integrated}={}){
 // Compare an immutable tree and exact task identities, not just totals.
 // These reports must be reconstructed from actual evidence by the controller.
 const valid=r=>r?.success===true&&Number.isSafeInteger(r.expected)&&r.expected>0&&r.finalPassed===r.expected&&
  /^[a-f0-9]{40}$/.test(r.tree??'')&&/^[a-f0-9]{64}$/.test(r.planDigest??'')&&
  Array.isArray(r.passedTaskDigests)&&r.passedTaskDigests.length===r.expected&&
  new Set(r.passedTaskDigests).size===r.expected&&r.passedTaskDigests.every(d=>/^[a-f0-9]{64}$/.test(d));
 const legacyPassed=valid(legacy),integratedPassed=valid(integrated)&&legacyPassed&&integrated.expected===legacy.expected&&
  integrated.tree===legacy.tree&&integrated.planDigest===legacy.planDigest&&
  [...integrated.passedTaskDigests].sort().join(',')===[...legacy.passedTaskDigests].sort().join(',');
 return {deliveryAllowed:legacyPassed,canaryPassed:legacyPassed&&integratedPassed,
   rollback:!integratedPassed,route:integratedPassed?'dual-run-canary':'legacy-full'};
}
