// Reproducible v0.2.1 verification: no benchmarks or scenarios affect gameplay.
// Usage: node qa/calibration-runner.mjs --output=qa/calibration-results.json
import {performance} from 'node:perf_hooks';
import {writeFileSync, mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {createWorld,advanceDays,audit,overview,CALIBRATION} from '../model.js';
const args=process.argv.slice(2);
const value=(key,fallback)=>args.find(a=>a.startsWith(`--${key}=`))?.split('=').slice(1).join('=')??fallback;
const scenarioSeeds=[11,29,413,7777,43821,9001,12345,21773,51291,71331];
const scenarios=['normal','drought','isolated','uplands'];
const longSeeds=[413,7777,43821,9001];
const scenarioYears=25,longYears=100;
const began=new Date().toISOString();
const metrics=(s,year)=>{
 const o=overview(s),P=new Map(s.people.map(p=>[p.id,p]));
 const inhabited=s.households.filter(h=>h.members.some(id=>P.get(id)?.alive));
 const occupiedGrain=inhabited.reduce((v,h)=>v+h.grain,0);
 const currentCrops=inhabited.map(h=>h.farmYear).filter(x=>x?.seedKg>0);
 const seeds=currentCrops.reduce((v,c)=>v+c.seedKg,0),yieldKg=currentCrops.reduce((v,c)=>v+c.yieldKg,0);
 const communityPop=Object.fromEntries(s.communities.map(c=>[c.name,0]));
 const householdCommunity=new Map(s.households.map(h=>[h.id,h.communityId]));
 const names=new Map(s.communities.map(c=>[c.id,c.name]));
 for(const p of s.people)if(p.alive){const name=names.get(householdCommunity.get(p.houseId));if(name)communityPop[name]++;}
 return {year,population:o.population,occupiedHouseholds:inhabited.length,extinctCommunities:Object.values(communityPop).filter(n=>n===0).length,communityPop,grainKg:o.grain,
 grainPerCapitaKg:+(o.grain/Math.max(1,o.population)).toFixed(1),vacantGrainShare:+((o.grain-occupiedGrain)/Math.max(1,o.grain)).toFixed(3),
 seedReturn:seeds?+(yieldKg/seeds).toFixed(2):null,starvationDeaths:s.people.filter(p=>!p.alive&&p.lifeLog?.some(l=>l.type==='death'&&l.text.includes('истощение'))).length,
 births:s.stats.born,deaths:s.stats.died,shipments:s.stats.delivered,construction:s.stats.built,aidKg:s.stats.aid||0};
};
const outputs=[];
async function run(seed,scenario,years,period,category){
 const s=createWorld(seed,{scenario}),snapshot=[],started=performance.now();
 for(let y=1;y<=years;y++){
  advanceDays(s,365);
  const a=audit(s);if(!a.ok)throw Error(`${scenario}/${seed} year ${y}: ${a.issues.join('; ')}`);
  if(y===1||y===years||y%period===0||scenario==='drought'&&[5,6,7,8,9,10,12].includes(y))snapshot.push(metrics(s,y));
 }
 const result={category,seed,scenario,years,elapsedMs:Math.round(performance.now()-started),sample:snapshot,
   final:snapshot.at(-1),peopleEver:s.people.length,homesEver:s.households.length};
 outputs.push(result);console.log(category,scenario,seed,years,'years',result.final.population,'people',result.elapsedMs,'ms');
}
const group=value('group','normal');
if(group==='century'){const one=value('seed','');for(const seed of (one?[Number(one)]:longSeeds))await run(seed,'normal',longYears,10,'century');}
else if(group==='all'){for(const scenario of scenarios)for(const seed of scenarioSeeds)await run(seed,scenario,scenarioYears,5,'scenario');}
else{if(!scenarios.includes(group))throw Error('Invalid scenario '+group);for(const seed of scenarioSeeds)await run(seed,group,scenarioYears,5,'scenario');}
const serial={version:'0.2.1',executedAt:began,calibration:CALIBRATION,
 method:{scenarioSeeds,scenarios,scenarioYears,longSeeds,longYears,periodicInvariants:'annual'},runs:outputs};
const output=resolve(value('output','./qa/calibration-results.json'));
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(serial,null,2));
console.log('Saved',output);