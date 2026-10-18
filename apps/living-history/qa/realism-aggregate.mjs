#!/usr/bin/env node
// Aggregate independently saved reports, including the CI matrix artifacts.
// Example: node qa/realism-aggregate.mjs --inputs=/tmp/413.json,/tmp/7777.json --output=/tmp/ensemble.json
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {summarizeEnsemble} from './realism-metrics.mjs';
import {renderRealismReport} from './realism-report.mjs';

const options=Object.fromEntries(process.argv.slice(2).filter(a=>a.startsWith('--')).map(s=>{
 const n=s.indexOf('=');return [s.slice(2,n<0?undefined:n),n<0?'true':s.slice(n+1)];
}));
const files=(options.inputs||'').split(',').filter(Boolean);
if(!files.length)throw Error('Supply --inputs=run1.json,run2.json,...');
const runs=[];
for(const name of files){
 const report=JSON.parse(readFileSync(resolve(name),'utf8'));
 if(report.study!=='living-history-realism-ensemble'||!Array.isArray(report.runs))
  throw Error('Not a compatible validated study: '+name);
 runs.push(...report.runs);
}
const summary=summarizeEnsemble(runs);
const combined={schema:1,study:'living-history-realism-ensemble',sourceCommit:process.env.GITHUB_SHA||null,
 generatedAt:new Date().toISOString(),sources:files,summary,runs};
const output=resolve(options.output||'./realism-aggregate.json');
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify(combined,null,2)+'\n');
const markdown=output.replace(/\.json$/i,'')+'.md';
writeFileSync(markdown,renderRealismReport(combined));
console.log('REALISM AGGREGATED worlds='+runs.length+' independentWorldKeys='+new Set(runs.map(r=>r.seed+'/'+r.years+'/'+r.scenario)).size+
 ' json='+output+' markdown='+markdown);
