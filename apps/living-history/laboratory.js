// Read-only diagnostics. This module never changes the simulation or its RNG.
import {CALIBRATION,BASE_TUNING,storageCapacity} from './model.js';
const rounded=(n,p=2)=>Number(n.toFixed(p));
const quantile=(values,q)=>{
 if(!values.length)return 0;
 const ordered=values.slice().sort((a,b)=>a-b);
 const i=(ordered.length-1)*q,a=Math.floor(i),b=Math.ceil(i);
 return rounded(ordered[a]+(ordered[b]-ordered[a])*(i-a));
};
const gini=values=>{
 const sorted=values.filter(n=>n>=0).sort((a,b)=>a-b),total=sorted.reduce((a,b)=>a+b,0);
 if(!sorted.length||total===0)return 0;
 const weighted=sorted.reduce((sum,value,i)=>sum+value*(i+1),0);
 return rounded((2*weighted)/(sorted.length*total)-(sorted.length+1)/sorted.length,3);
};
const foodConsumption=p=>(p.age<4?.35:p.age<10?.55:p.age<15?.77:1)*CALIBRATION.adultGrainKgPerDay;
export function diagnoseWorld(s){
 const living=s.people.filter(p=>p.alive),homeIndex=new Map(s.households.map(h=>[h.id,h]));
 const households=new Map();
 for(const p of living){let entry=households.get(p.houseId);if(!entry){entry={people:0,foodDay:0,workDays:0,unhealthy:0};households.set(p.houseId,entry);}
  entry.people++;entry.foodDay+=foodConsumption(p);
  if(p.health<50||p.foodDebt>12)entry.unhealthy++;
  entry.workDays+=Object.values(p.workDays||{}).reduce((a,b)=>a+b,0);
 }
 const rows=[...households].map(([id,info])=>{
  const h=homeIndex.get(id);
  if(!h)return null;
  const daily=info.foodDay;
  const foodDays=daily>0?(h.grain+(h.garden||0)+(h.dairy||0))/daily:0;
  const report=h.lastAccounting||h.accounting||{};
  return {id,communityId:h.communityId,people:info.people,grainKg:rounded(h.grain),gardenEquivalentKg:rounded(h.garden||0),dairyEquivalentKg:rounded(h.dairy||0),coin:rounded(h.coin),
   foodDays:rounded(foodDays,1),storageUse:rounded(h.grain/Math.max(1,storageCapacity(h,s))),unhealthy:info.unhealthy,
   occupation:h.focus||h.work||'farm',workDays:info.workDays,landHa:rounded(h.fields.length*.0625,3),landStrips:h.fields.length,leasedIn:h.leaseIn?.length||0,leasedOut:h.leaseOut?.length||0,tenure:h.tenure||'customary',cattle:h.cattle||0,hayKg:rounded(h.fodder||0),
   harvestKg:report.harvestKg||0,spoilKg:report.spoilKg||0,wagesEarned:report.wagesEarned||0,wagesPaid:report.wagesPaid||0,grainWagesEarnedKg:report.grainWagesEarnedKg||0,grainWagesPaidKg:report.grainWagesPaidKg||0};
 }).filter(Boolean);
 const byCommunity=s.communities.map(c=>{
  const subset=rows.filter(h=>h.communityId===c.id);
  return {id:c.id,name:c.name,people:subset.reduce((n,h)=>n+h.people,0),homes:subset.length,
   grainKg:rounded(subset.reduce((n,h)=>n+h.grainKg,0)),atRiskHomes:subset.filter(h=>h.foodDays<30).length,
   medianFoodDays:quantile(subset.map(h=>h.foodDays),.5),
   medianCoin:quantile(subset.map(h=>h.coin),.5)};
 });
 const grains=rows.map(h=>h.grainKg),cash=rows.map(h=>h.coin);
 const foodDays=rows.map(h=>h.foodDays),members=rows.reduce((n,h)=>n+h.people,0);
 const byOccupation=Object.fromEntries(['farm','wood','trade'].map(j=>[j,rows.filter(h=>h.occupation===j).length]));
 const stats=s.stats||{};
 const deceased=s.people.filter(p=>!p.alive);
 const hungerDeaths=deceased.filter(p=>p.lifeLog?.some(e=>e.type==='death'&&e.text?.includes('истощение'))).length;
 return {day:s.day,year:Math.floor(s.day/365)+1,seed:s.seed,scenario:s.scenario,tuning:{...BASE_TUNING,...s.tuning},
  population:members,homes:rows.length,cattle:rows.reduce((n,h)=>n+h.cattle,0),fodderKg:rounded(rows.reduce((n,h)=>n+h.hayKg,0)),peopleEver:s.people.length,deaths:stats.died||0,births:stats.born||0,hungerDeaths,
  landlessHomes:rows.filter(h=>h.landStrips===0).length,medianLandHa:quantile(rows.map(h=>h.landHa),.5),landGini:gini(rows.map(h=>h.landHa)),landInherited:stats.landInherited||0,landDivided:stats.landDivided||0,landReclaimed:stats.landReclaimed||0,landAbandoned:stats.landAbandoned||0,landReallocated:stats.landReallocated||0,leasePlots:stats.leasePlots||0,rentGrainKg:stats.rentGrain||0,migratedPersons:stats.migrations||0,serviceMigrants:stats.serviceMigrants||0,
  meanGrainKgPerPerson:rounded(members?grains.reduce((a,b)=>a+b,0)/members:0),
  grainGini:gini(grains),coinGini:gini(cash),coinP10:quantile(cash,.1),coinMedian:quantile(cash,.5),coinP90:quantile(cash,.9),
  foodDaysP10:quantile(foodDays,.1),foodDaysMedian:quantile(foodDays,.5),foodDaysP90:quantile(foodDays,.9),
  familiesUnder30Days:rows.filter(h=>h.foodDays<30).length,familiesUnder90Days:rows.filter(h=>h.foodDays<90).length,
  householdsWithUnhealthyPeople:rows.filter(h=>h.unhealthy>0).length,
  averageStorageUse:rounded(rows.length?rows.reduce((n,h)=>n+h.storageUse,0)/rows.length:0),
  occupations:byOccupation,gardenProducedKg:stats.gardenProduced||0,gardenConsumedKg:stats.gardenConsumed||0,dairyProducedKg:stats.dairyProduced||0,dairyConsumedKg:stats.dairyConsumed||0,grainWagesKg:stats.grainWagesKg||0,loanIssuedKg:stats.loanIssuedKg||0,seedLoans:(s.loans||[]).filter(l=>l.purpose==='seed-and-food').length,loanRepaidKg:stats.loanRepaidKg||0,loanDefaults:stats.loanDefaults||0,activeLoans:(s.loans||[]).filter(l=>['active','in-transit'].includes(l.status)).length,grainSpoiledKg:stats.spoiled||0,grainHarvestedKg:stats.harvest||0,
  totalPaidWages:rounded(rows.reduce((n,h)=>n+(h.wagesPaid||0),0)),
  transportDeliveries:stats.delivered||0,tradeCount:stats.trades||0,communities:byCommunity,
  // Rows are suitable for exporting, but are not shown all at once on mobile.
  households:rows};
}
export function summarizeDiagnostics(d){const {households,...summary}=d;return summary;}
export function comparePaired(baseline,alternative){
 const keys=['population','familiesUnder30Days','familiesUnder90Days','foodDaysMedian','grainGini','coinGini','meanGrainKgPerPerson','tradeCount','hungerDeaths'];
 return Object.fromEntries(keys.map(k=>[k,rounded((alternative[k]??0)-(baseline[k]??0))]));
}