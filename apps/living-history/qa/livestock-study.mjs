// Isolated deterministic deep QA task, safe to run as GitHub Actions CPU shard.
// node qa/livestock-study.mjs --seed=413 --years=20 --output=/tmp/qa/study.json
import {createWorld,advanceDays,audit,overview} from '../model.js';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
const flag=(name,fall)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??fall;
const seed=Number(flag('seed','413')),years=Number(flag('years','20'));
if(!Number.isInteger(seed)||seed<0||seed>4294967295||!Number.isInteger(years)||years<1||years>50)throw Error('Invalid seed/year bounds');
const output=resolve(flag('output',process.env.PW_QA_OUTPUT_DIR?`${process.env.PW_QA_OUTPUT_DIR}/study.json`:'qa/livestock-results.json'));
const sim=createWorld(seed);const history=[];
for(let y=1;y<=years;y++){
 const start=performance.now();advanceDays(sim,365);const verification=audit(sim);
 if(!verification.ok)throw Error(`Year ${y}: ${verification.issues.join('; ')}`);
 const census=overview(sim);
 history.push({year:y,population:census.population,households:census.households,
  cattle:sim.households.reduce((n,h)=>n+(h.cattle||0),0),hayKg:Math.round(sim.households.reduce((n,h)=>n+(h.fodder||0),0)),
  births:sim.stats.cattleBorn,deaths:sim.stats.cattleDied,
  grain:census.grain,grainPerPerson:Math.round(census.grain/Math.max(1,census.population)),
  forageConsumedKg:Math.round(sim.stats.forageConsumed),forageGrownKg:Math.round(sim.stats.forageGrown),
  millis:Math.round(performance.now()-start)});
}
const result={seed,years,history,passed:true,notes:'No enforced population survival: cattle and families may die.'};
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2));
console.log(`seed=${seed}, years=${years}, ending population=${history.at(-1).population}, cattle=${history.at(-1).cattle}, output=${output}`);