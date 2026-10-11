// Historical app contracts remain visible; a new regression never joins this ledger.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
export function partitionFindings(errors, baseline) {
  const known=new Set(baseline);
  return { existing:errors.filter(e=>e.startsWith('apps/')&&!e.startsWith('apps/_')&&known.has(e)),
    regressions:errors.filter(e=>!e.startsWith('apps/')||e.startsWith('apps/_')||!known.has(e)),
    resolved:baseline.filter(e=>!errors.includes(e)) };
}
export function reportValidationDebt(gate, errors, root=process.cwd()) {
  const ledger=JSON.parse(readFileSync(path.join(root,'docs/VALIDATION-DEBT.json'),'utf8'));
  if(ledger.schemaVersion!==1 || !Array.isArray(ledger.gates[gate])) throw Error('Invalid historical validation ledger');
  const report=partitionFindings(errors,ledger.gates[gate]);
  const output=path.join(root,'quality-artifacts','validation-debt');mkdirSync(output,{recursive:true});
  writeFileSync(path.join(output,gate+'.json'),JSON.stringify({gate,originCommit:ledger.originCommit,...report},null,2)+'\n');
  if(report.existing.length) console.warn(`${gate}: ${report.existing.length} exact legacy app findings remain; see quality-artifacts/validation-debt/${gate}.json. No new findings permitted.`);
  if(process.env.PW_STRICT_LEGACY==='1') return errors;
  return report.regressions;
}
