// Forensic replay of century-paired results: every 30 days capture family
// reserves, and at each actual starvation death preserve food-access evidence.
// An independent QA tool; no production simulation or balance changes.
import {createWorld,advanceDays,audit,overview,normalizeTuning} from '../model.js';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const flag=(key,fallback)=>process.argv.find(x=>x.startsWith(`--${key}=`))?.slice(key.length+3)??fallback;
const seed=Number(flag('seed','413')),years=Number(flag('years','100'));
if(![413,7777,43821,9001,12345].includes(seed)||years!==100)throw Error('Five study seeds and 100 years only');
const common={scenario:'normal'};
const variants=[
 {id:'baseline',tuning:normalizeTuning()},
 {id:'alternative',tuning:normalizeTuning({yield:1.04,storage:.97,planting:1.02,transport:.96,weather:.98})}
];
const records=[];
const round=n=>Math.round(n*100)/100;
function inspect(s){
 const lookup=new Map(s.people.map(p=>[p.id,p]));
 const homes=s.households.filter(h=>h.members.some(id=>lookup.get(id)?.alive));
 const dailyNeed=h=>h.members.map(id=>lookup.get(id)).filter(p=>p?.alive)
  .reduce((n,p)=>n+(p.age<4?.35:p.age<10?.55:p.age<15?.77:1)*.68,0);
 const foodDays=h=>(h.grain+(h.oats||0)+(h.pulses||0)+(h.garden||0)+(h.dairy||0))/Math.max(.01,dailyNeed(h));
 const foodSorted=[...homes].sort((a,b)=>b.grain-a.grain);
 const nTop=Math.max(1,Math.ceil(foodSorted.length*.2));
 const total=homes.reduce((n,h)=>n+h.grain,0);
 const low=homes.filter(h=>foodDays(h)<30);
 const parcels=homes.reduce((n,h)=>n+h.fields.length,0);
 return {
  day:s.day,population:overview(s).population,weather:round(s.weather),
  grainKg:round(overview(s).grain),households:homes.length,
  edibleStockKg:round(homes.reduce((n,h)=>n+h.grain+(h.oats||0)+(h.pulses||0)+(h.garden||0)+(h.dairy||0),0)),
  hungryUnder14:homes.filter(h=>foodDays(h)<14).length,
  hungryUnder30:low.length,foodDaysUnder90:homes.filter(h=>foodDays(h)<90).length,
  grainTop20PercentShare:round(foodSorted.slice(0,nTop).reduce((n,h)=>n+h.grain,0)/Math.max(1,total)),
  familiesUnder30WithCoin:low.filter(h=>h.coin>=40).length,
  poorFamiliesWithLand:low.filter(h=>h.fields.length>=15).length,
  poorFamiliesWithoutAdults:low.filter(h=>!h.members.some(id=>{const p=lookup.get(id);return p?.alive&&p.age>=15&&p.health>25})).length,
  meanOwnedFields:round(parcels/Math.max(1,homes.length)),
  meanGrainPerPerson:round(overview(s).grain/Math.max(1,overview(s).population)),
  harvestedKg:round(s.stats.harvest||0),starved:s.stats.starvationDeaths||0,
  loanIssuedKg:round(s.stats.loanIssuedKg||0),serviceMigrants:s.stats.serviceMigrants||0,
  rng:s.rng,marketRng:s.randomStreams?.market??null,demographyRng:s.randomStreams?.demography??null
 };
}
function buildRecord(item){
 const s=createWorld(seed,{...common,tuning:item.tuning}),months=[],deaths=[],fatalityReasonCounts={},periods=[];
 let count=0,missingCases=0;
 for(let year=1;year<=100;year++){
  const startDeaths=s.stats.starvationDeaths||0,monthlyRisk=[];
  const reasonCounts={};
  while(s.day<year*365){
   const n=Math.min(30,year*365-s.day),previous=s.stats.starvationDeaths||0;
   advanceDays(s,n);
   const now=s.stats.starvationDeaths||0,newDeaths=now-previous;
   if(newDeaths>0){
    const fresh=(s.foodCases||[]).slice(-Math.min(newDeaths,160));
    missingCases+=newDeaths-fresh.length;
    for(const x of fresh){
     const h=s.households.find(h=>h.id===x.houseId);
     const people=h?.members.map(id=>s.people.find(p=>p.id===id)).filter(p=>p?.alive)||[];
     const evidence={
      year,day:x.day,home:x.houseId,person:x.personId,age:x.age,shortageDays:x.shortageDays,
      reason:x.reason,ownGrainKg:x.foodKg,ownFoodDays:x.foodDays,neighbourGrainKg:x.reachableGrainKg,
      neighboursOfferingKg:x.offeredEmergencyKg,affordableKg:x.affordableKg,
      potentialAidKg:x.potentialAidKg,coin:x.coin,grainInTransitKg:x.grainInTransitKg,
      peopleAtDeath:x.people,fieldStrips:h?.fields.length??null,
      leasedIn:h?.leaseIn?.length||0,leasedOut:h?.leaseOut?.length||0,
      activeAdults:people.filter(p=>p.age>=15&&p.health>25).length,
      focus:h?.focus||null,
      planSownAreaHa:round(h?.farmYear?.sownArea||0),
      planHarvestedAreaHa:round(h?.farmYear?.harvestedArea||0),
      loanDueKg:x.outstandingLoanKg||0
     };
     deaths.push(evidence);reasonCounts[x.reason]=(reasonCounts[x.reason]||0)+1;
     fatalityReasonCounts[x.reason]=(fatalityReasonCounts[x.reason]||0)+1;
    }
   }
   const snapshot=inspect(s);monthlyRisk.push(snapshot);
   months.push(snapshot);
  }
  const audited=audit(s);
  if(!audited.ok)throw Error(`${item.id} seed=${seed} year=${year}: ${audited.issues.slice(0,5).join(' | ')}`);
  const casualties=(s.stats.starvationDeaths||0)-startDeaths;
  periods.push({year,starvationDeaths:casualties,reasons:reasonCounts,
   peakAtRisk:Math.max(...monthlyRisk.map(x=>x.hungryUnder30)),
   meanGrainTop20Share:round(monthlyRisk.reduce((n,x)=>n+x.grainTop20PercentShare,0)/monthlyRisk.length),
   grainHarvestYear:round((s.stats.harvest||0)-((year===1)?0:periods.at(-1).totalHarvest)),
   totalHarvest:round(s.stats.harvest||0),population:overview(s).population});
  if(year%20===0)console.log(item.id,'seed',seed,'year',year,'pop',overview(s).population,'starved',s.stats.starvationDeaths||0,'fatalityReasons',JSON.stringify(fatalityReasonCounts));
 }
 return {id:item.id,tuning:item.tuning,monthly:months,annual:periods,deathCases:deaths,missingCases,reasons:fatalityReasonCounts,
   final:{population:overview(s).population,starved:s.stats.starvationDeaths||0,harvestKg:round(s.stats.harvest||0)}};
}
for(const item of variants)records.push(buildRecord(item));
const a=records[0],b=records[1];
const firstRngMismatch=a.monthly.findIndex((x,i)=>x.marketRng!==b.monthly[i].marketRng);
const firstPopMismatch=a.monthly.findIndex((x,i)=>x.population!==b.monthly[i].population);
const output={schema:1,experiment:'forensic replay of five paired 100-year simulations',seed,years,
 sourceCommit:process.env.GITHUB_SHA||null,
 randomStream:{firstMismatchDay:firstRngMismatch>=0?a.monthly[firstRngMismatch].day:null,
  firstPopulationDifferenceDay:firstPopMismatch>=0?a.monthly[firstPopMismatch].day:null,
  firstLegacyStreamMismatchDay:(a.monthly.findIndex((x,i)=>x.rng!==b.monthly[i].rng)>=0?a.monthly[a.monthly.findIndex((x,i)=>x.rng!==b.monthly[i].rng)].day:null),
  firstDemographyStreamMismatchDay:(a.monthly.findIndex((x,i)=>x.demographyRng!==b.monthly[i].demographyRng)>=0?a.monthly[a.monthly.findIndex((x,i)=>x.demographyRng!==b.monthly[i].demographyRng)].day:null),
  caution:'Weather and individual demographic risk are keyed to the seed, day and genealogical identity; household and market draws use separate serialized streams. Economic differences may still alter which people are alive or eligible for marriage.'},
 records};
const dst=resolve(flag('output','/tmp/century-forensics.json'));
mkdirSync(dirname(dst),{recursive:true});writeFileSync(dst,JSON.stringify(output));
console.log('FORENSICS COMPLETE seed=',seed,'base=',a.final.population,'alternative=',b.final.population,
 'rngDriftDay=',output.randomStream.firstMismatchDay,'starvation=',a.final.starved,'/',b.final.starved,
 'reasons=',JSON.stringify(a.reasons),'/',JSON.stringify(b.reasons));
