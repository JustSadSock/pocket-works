// Living History: independent observation only. No gameplay mutations,
// no forced demographic targets and no "historically validated" labels.
import {overview,foodAccess} from '../model.js';
import {historicalObservation,historicalComparison,quantiles} from '../historical-calibration.js';

const number=n=>Math.round(n*1000)/1000;
const ratio=(n,d)=>d>0?number(n/d):null;
const bands=[0,1,5,15,25,45,65,Infinity];
const ageBand=age=>{
 for(let i=0;i<bands.length-1;i++)if(age>=bands[i]&&age<bands[i+1])
  return ['under1','age1to4','age5to14','age15to24','age25to44','age45to64','age65plus'][i];
 return 'unknown';
};
export const AGE_BANDS=['under1','age1to4','age5to14','age15to24','age25to44','age45to64','age65plus'];

function ageCounts(people){
 const counts=Object.fromEntries(AGE_BANDS.map(k=>[k,0]));
 for(const p of people)counts[ageBand(p.age)]??=0;
 for(const p of people)counts[ageBand(p.age)]++;
 return counts;
}
function dispersion(list){
 const a=list.filter(v=>Number.isFinite(v)).sort((x,y)=>x-y);
 if(!a.length)return {n:0,median:null,p10:null,p90:null};
 return quantiles(a);
}
export function snapshotReality(s,prev){
 const living=s.people.filter(p=>p.alive),liveIds=new Set(living.map(p=>p.id));
 const byPerson=new Map(s.people.map(p=>[p.id,p]));
 const homes=s.households.filter(h=>h.members.some(id=>liveIds.has(id)));
 const householdAccess=homes.map(h=>({h,access:foodAccess(s,h),
  people:h.members.filter(id=>liveIds.has(id)).length}));
 const deficits=householdAccess.filter(x=>x.access.rationCoverageToday<.95);
 const isolated=householdAccess.filter(x=>x.access.foodDays<30);
 const communityStock=new Map();
 for(const h of s.households)communityStock.set(h.communityId,(communityStock.get(h.communityId)||0)+(h.grain||0));
 const coexisting=deficits.filter(x=>communityStock.get(x.h.communityId)>x.access.dailyNeedKg*30);
 const totalFields=homes.reduce((sum,h)=>sum+h.fields.length,0);
 const obs=historicalObservation(s);
 const deathNew=prev?.knownDead?
  s.people.filter(p=>!p.alive&&!prev.knownDead.has(p.id)):[];
 const deadIds=new Set(s.people.filter(p=>!p.alive).map(p=>p.id));
 const birthCount=(s.stats.born||0)-(prev?.born||0);
 const deathCount=(s.stats.died||0)-(prev?.died||0);
 const exposure=prev?(prev.population+living.length)/2:null;
 const byAge=ageCounts(deathNew);
 const population=overview(s);
 const conflictStarted=(s.stats.armedDisputes||0)-(prev?.armedDisputes||0);
 const conflictsResolved=(s.stats.armedDisputesResolved||0)-(prev?.armedDisputesResolved||0);
 const casualties=(s.stats.battleDeaths||0)-(prev?.battleDeaths||0);
 const wounded=(s.stats.battleWounds||0)-(prev?.battleWounds||0);
 const grainPeople=population.population?number(population.grain/population.population):null;
 const output={
  year:Math.round(s.day/365),day:s.day,population:living.length,peopleEver:s.people.length,
  households:homes.length,ageCounts:ageCounts(living),sexCounts:{
   women:living.filter(p=>p.sex==='f').length,men:living.filter(p=>p.sex==='m').length},
  vital:{
   births:birthCount,deaths:deathCount,
   crudeBirthsPer1000PersonYears:exposure?number(1000*birthCount/exposure):null,
   crudeDeathsPer1000PersonYears:exposure?number(1000*deathCount/exposure):null,
   newlyDeadAgeCounts:byAge,
   // Not infant mortality probability: the denominator is not a tracked birth cohort.
   neonatalOrInfantRiskStatus:'unvalidated-cohort-denominator'
  },
  marriages:{
   firstAgeWomen:obs.femaleFirstMarriage,firstAgeMen:obs.maleFirstMarriage,
   observedWomen:obs.femaleFirstMarriagesObserved,observedMen:obs.maleFirstMarriagesObserved,
   householdSize:obs.householdSize
  },
  food:{
   grainKg:population.grain,grainPerPersonKg:grainPeople,
   insufficientDailyRationHomes:deficits.length,
   homesBelow30DaysOfNominalStock:isolated.length,
   lowRationDespiteGrainInCommunity:coexisting.length,
   // Cumulative measures are converted to YEARLY DELTAS below.
   harvestedGrainKg:number((s.stats.harvest||0)-(prev?.harvest||0)),
   starvationDeaths:Math.max(0,(s.stats.starvationDeaths||0)-(prev?.starvationDeaths||0)),
   grainImportedKg:number((s.stats.outsideGrainIn||0)-(prev?.outsideGrainIn||0))
  },
  householdsEconomy:{
   giniLand:obs.farmlandGini,fieldStrips:totalFields,smallholdings:obs.smallholdings,
   largeholdings:obs.largeholdings,cattle:s.households.reduce((n,h)=>n+(h.cattle||0),0),
   loansOutstanding:(s.loans||[]).filter(l=>l.status==='active'||l.status==='in-transit').length,
   tradeTransactions:(s.stats.trades||0)-(prev?.trades||0),
   abandonedHouseholds:s.households.length-homes.length
  },
  disputes:{
   started:Math.max(0,conflictStarted),resolved:Math.max(0,conflictsResolved),
   wounds:Math.max(0,wounded),fatalities:Math.max(0,casualties),
   // Exposure is a crude whole-population proxy, NOT the eligible landholding population.
   disputesPer1000ResidentYears:exposure?number(1000*conflictStarted/exposure):null
  },
  historicalComparison:historicalComparison(obs),
  observability:{
   mortalityAgeDenominator:'annual survivor snapshot; no real reconstructed historical cohort',
   foodAvailability:'household ration coverage, not merely village-wide grain',
   conflicts:'observed local disputes, not all warfare in medieval England',
   historicalStatus:'illustrative-not-validated'
  }
 };
 return {observation:output,next:{
  knownDead:deadIds,born:s.stats.born||0,died:s.stats.died||0,population:living.length,
  armedDisputes:s.stats.armedDisputes||0,armedDisputesResolved:s.stats.armedDisputesResolved||0,
  battleDeaths:s.stats.battleDeaths||0,battleWounds:s.stats.battleWounds||0,
  harvest:s.stats.harvest||0,starvationDeaths:s.stats.starvationDeaths||0,
  outsideGrainIn:s.stats.outsideGrainIn||0,trades:s.stats.trades||0
 }};
}
export function validateObservation(row){
 const errors=[];
 if(!Number.isInteger(row.year)||row.year<0)errors.push('bad-year');
 if(row.population<0||row.ageCounts&&Object.values(row.ageCounts).reduce((a,b)=>a+b,0)!==row.population)
  errors.push('demographic-reconciliation');
 if(row.vital.deaths<0||row.vital.births<0)errors.push('negative-vital-events');
 if(row.vital.newlyDeadAgeCounts&&Object.values(row.vital.newlyDeadAgeCounts)
  .reduce((a,b)=>a+b,0)!==row.vital.deaths)errors.push('death-record-mismatch');
 if(row.food.grainKg<-.051)errors.push('negative-world-grain');
 if(row.food.insufficientDailyRationHomes>row.households||
    row.food.homesBelow30DaysOfNominalStock>row.households)errors.push('food-household-count');
 if(row.disputes.wounds<0||row.disputes.fatalities<0||
    row.disputes.fatalities>row.vital.deaths)errors.push('combat-death-count');
 if(row.historicalComparison.some(x=>!['illustrative-comparison','insufficient-sample'].includes(x.interpretation)))
  errors.push('fabricated-historical-validation');
 return errors;
}
export function summarizeEnsemble(runs){
 if(!Array.isArray(runs)||!runs.length)throw Error('No completed runs');
 const seen=new Set();
 for(const r of runs){
  if(!Number.isInteger(r.seed)||!Number.isInteger(r.years)||!Array.isArray(r.annual)||
   r.annual.length!==r.years||r.validation?.materialAudit!==true)throw Error('Incomplete or invalid run');
  const key=r.seed+'/'+r.years+'/'+r.scenario;
  if(seen.has(key))throw Error('Duplicate run '+key);
  seen.add(key);
 }
 const groups=new Map();
 for(const run of runs){
  const key=run.scenario+'/'+run.years,arr=groups.get(key)||[];
  arr.push(run);groups.set(key,arr);
 }
 const summaries=[...groups].map(([key,group])=>{
  const end=group.map(r=>r.annual.at(-1));
  const measure=(path)=>dispersion(end.map(row=>path.split('.').reduce((v,k)=>v?.[k],row)));
  return {key,scenario:group[0].scenario,years:group[0].years,seeds:group.map(r=>r.seed),
   sampleWorlds:group.length,finalPopulation:measure('population'),
   birthsPer1000PersonYears:dispersion(group.flatMap(r=>r.annual.map(y=>y.vital.crudeBirthsPer1000PersonYears))),
   deathsPer1000PersonYears:dispersion(group.flatMap(r=>r.annual.map(y=>y.vital.crudeDeathsPer1000PersonYears))),
   firstMarriageWomen:measure('marriages.firstAgeWomen'),
   firstMarriageMen:measure('marriages.firstAgeMen'),householdSize:measure('marriages.householdSize'),
   lowRationHomes:measure('food.insufficientDailyRationHomes'),
   localConflicts:dispersion(group.map(r=>r.annual.reduce((n,y)=>n+y.disputes.started,0))),
   grainPerPersonKg:measure('food.grainPerPersonKg')
  };
 });
 const paired=[];
 for(const seed of new Set(runs.map(r=>r.seed)))for(const years of new Set(runs.map(r=>r.years))){
  const baseline=runs.find(r=>r.seed===seed&&r.years===years&&r.scenario==='normal');
  const drought=runs.find(r=>r.seed===seed&&r.years===years&&r.scenario==='drought');
  if(baseline&&drought)paired.push({seed,years,
   harvestKgDelta:number(drought.annual.reduce((n,y)=>n+y.food.harvestedGrainKg,0)-
      baseline.annual.reduce((n,y)=>n+y.food.harvestedGrainKg,0)),
   populationDelta:drought.annual.at(-1).population-baseline.annual.at(-1).population,
   starvationDeathsDelta:drought.annual.reduce((n,y)=>n+y.food.starvationDeaths,0)-
      baseline.annual.reduce((n,y)=>n+y.food.starvationDeaths,0)
  });
 }
 return {schema:1,method:'multi-seed descriptive ensemble; no fitting to historical targets',
  historicalEvidence:'unvalidated; ancient records are not sampled from the simulated population',
  runs:runs.length,groups:summaries,pairedCounterfactuals:paired,
  warnings:[
   'Per-year vital rates are crude rates using approximate average midyear population.',
   'Age at infant death is counted, but birth-cohort survival cannot yet be estimated reliably.',
   'Comparative percentile ranges describe model worlds, not historical confidence intervals.',
   'Annual samples from one world are correlated; they do NOT increase independent sample-world count.',
   'Missing comparable documentary evidence is NOT automatically reported as a successful test.'
  ]};
}
