// The same seed and scenario yield exactly the same household-level famine evidence.
import {createWorld,advanceDays,audit,foodAccess,overview} from '../model.js';
import {performance} from 'node:perf_hooks';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
const flag=(key,defaultValue)=>process.argv.find(v=>v.startsWith(`--${key}=`))?.slice(key.length+3)??defaultValue;
const seed=Number(flag('seed','413')),years=Number(flag('years','20')),scenario=flag('scenario','normal');
if(!Number.isInteger(seed)||seed<0||seed>4294967295||!Number.isInteger(years)||years<1||years>100||!['normal','drought','isolated','uplands'].includes(scenario))throw Error('Invalid diagnostic parameters');
const s=createWorld(seed,{scenario}),samples=[],start=performance.now();
const summarize=()=>{
 const households=s.households.filter(h=>h.members.some(id=>s.people.some(p=>p.id===id&&p.alive)));
 const access=households.map(h=>foodAccess(s,h));
 const critical=access.filter(a=>a.foodDays<35);
 const reasons={};for(const a of critical)reasons[a.reason]=(reasons[a.reason]||0)+1;
 const communities=s.communities.map(c=>{const relevant=access.filter(a=>a.communityId===c.id);
  return {name:c.name,people:relevant.reduce((n,a)=>n+a.people,0),foodKg:+relevant.reduce((n,a)=>n+a.foodKg,0).toFixed(2),
   households:relevant.length,critical:relevant.filter(a=>a.foodDays<35).length};
 });
 return {year:s.day/365,population:overview(s).population,grainKg:overview(s).grain,
  starvationDeaths:s.stats.starvationDeaths||0,naturalDeaths:s.stats.died-(s.stats.starvationDeaths||0),
  reliefKg:s.stats.aid||0,tradeCount:s.stats.trades||0,transfers:s.stats.migrations||0,lodgingMigrants:s.stats.lodgingMigrants||0,
  criticalHouseholds:critical.length,unreachableReasons:reasons,communities,
  householdsAtRisk:critical.sort((a,b)=>a.foodDays-b.foodDays).slice(0,18)};
};
for(let year=1;year<=years;year++){advanceDays(s,365);const result=audit(s);
 if(!result.ok)throw Error(`Year ${year} seed ${seed} broken: ${result.issues.join('; ')}`);
 const sample=summarize();samples.push(sample);
 console.log(`YEAR ${year}: pop=${sample.population} grain=${Math.round(sample.grainKg)} starved=${sample.starvationDeaths} migrated=${sample.transfers} lodged=${sample.lodgingMigrants} critical=${sample.criticalHouseholds} reasons=${JSON.stringify(sample.unreachableReasons)}`);
}
const results={version:'0.4.1',seed,scenario,years,elapsedMs:Math.round(performance.now()-start),
 samples,deathCases:(s.foodCases||[]).slice(-100),last:samples.at(-1)};
const file=resolve(flag('output','/tmp/living-food-access.json'));
mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(results,null,2));
console.log(`food-access ${scenario} seed=${seed} years=${years} pop=${results.last.population} starved=${results.last.starvationDeaths} atRisk=${results.last.criticalHouseholds} migrated=${results.last.transfers} lodged=${results.last.lodgingMigrants} output=${file}`);