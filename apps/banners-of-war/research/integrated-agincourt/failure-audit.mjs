import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const roots=process.argv.slice(2),out=process.env.BOW_AUDIT_OUTPUT;
const rows=[];
for(let root of roots){for(let d of await readdir(root)){if(!d.endsWith('.json')||d==='failures.json')continue;let a=JSON.parse(await readFile(resolve(root,d),'utf8'));if(!a.rounds?.length)continue;let last=a.rounds.at(-1).state,eligible=last.units.filter(u=>u.side===0&&u.type!=='guard'&&u.n>=1&&!u.escaped),oldSelection=eligible.slice(0,5);rows.push({file:d,rounds:a.rounds.length,time:last.time,oldSelection:oldSelection.map(u=>({id:u.id,type:u.type,n:u.n,rout:u.rout,escaped:u.escaped,order:u.order?.kind})),all:eligible.map(u=>({id:u.id,type:u.type,n:u.n,rout:u.rout,escaped:u.escaped})),potentialHiddenOrders:oldSelection.filter(u=>u.rout).map(u=>u.id)});}}
await writeFile(resolve(out,'french-failure-diagnosis.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
