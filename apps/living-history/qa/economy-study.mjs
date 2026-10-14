// Reproducible paired-seed experiment; model is never modified from test runner.
import {createWorld,advanceDays,audit,overview,storageCapacity} from '../model.js';
import {performance} from 'node:perf_hooks';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
const seeds=process.argv.includes('--short')?[413,43821]:[413,7777,43821];
const scenarios=['normal','drought','isolated','uplands'];
const years=Number(process.argv.find(a=>a.startsWith('--years='))?.split('=')[1]||20);
const results=[];
for(const seed of seeds)for(const scenario of scenarios){
 const sim=createWorld(seed,{scenario}),start=performance.now(),samples=[];
 for(let year=1;year<=years;year++){
  advanceDays(sim,365);
  const check=audit(sim);if(!check.ok)throw Error(`${seed}/${scenario}/${year}: ${check.issues.join('; ')}`);
  if(year%5===0||year===1||year===years){
   const live=new Set(sim.people.filter(p=>p.alive).map(p=>p.houseId));
   const house=sim.households.filter(h=>live.has(h.id));
   const food=house.reduce((n,h)=>n+h.grain,0);
   const rates=house.map(h=>h.grain/Math.max(1,storageCapacity(h)));
   samples.push({year,population:overview(sim).population,hungry:overview(sim).hungry,grainKg:overview(sim).grain,
     occupiedGrainKg:+food.toFixed(1),grainKgPerCapita:+(overview(sim).grain/Math.max(1,overview(sim).population)).toFixed(1),
     occupiedHomes:house.length,storagesUpgraded:house.filter(h=>(h.storeLevel||0)>0).length,
     occupation:Object.fromEntries(['farm','wood','trade'].map(k=>[k,house.filter(h=>h.focus===k).length])),
     paidHiringCoin:house.reduce((n,h)=>n+(h.accounting?.wagesPaid||0)+(h.lastAccounting?.wagesPaid||0),0)});
  }
 }
 results.push({seed,scenario,years,timeMs:Math.round(performance.now()-start),last:samples.at(-1),samples,
    stats:sim.stats,persons:sim.people.length,homes:sim.households.length});
 console.log(seed,scenario,'population',results.at(-1).last.population,'grain/person',results.at(-1).last.grainKgPerCapita,'ms',results.at(-1).timeMs);
}
const out=resolve(process.argv.find(a=>a.startsWith('--out='))?.split('=')[1]||'qa/economy-study-results.json');
mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify({release:'0.3.0',seedPolicy:'paired deterministic',scenarios,seeds,years,runs:results},null,2));
console.log(out);