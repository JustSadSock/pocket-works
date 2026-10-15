// Read-only causality instruments for v0.7.1. These never call RNG and never
// alter the simulated world. The daily ring retains evidence BEFORE it is lost
// to the model's capped foodCases array.
import {CALIBRATION,foodAccess,overview,workCapacity} from '../model.js';

const round=(n)=>Math.round(n*100)/100;
const ageWeight=(age)=>age<4?.35:age<10?.55:age<15?.77:1;
export const HOUSEHOLD_TRACE_DAYS=90;
export const FOOD_KEYS=Object.freeze(['grain','oats','pulses','garden','dairy']);

export function livingByHouse(state) {
 const result=new Map();
 for(const p of state.people)if(p.alive){
  if(!result.has(p.houseId))result.set(p.houseId,[]);
  result.get(p.houseId).push(p);
 }
 return result;
}

// IMPORTANT: stock days are an inventory indicator, not days of guaranteed
// nourishment. Pulses, gardens and dairy are rate-limited by the daily diet;
// seed reservations can reduce the usable oats/pulses still further.
export function householdFoodSnapshot(s,h,people=[]) {
 const need=people.reduce((sum,p)=>sum+ageWeight(p.age)*CALIBRATION.adultGrainKgPerDay,0);
 const stocks=Object.fromEntries(FOOD_KEYS.map(k=>[k,round(h[k]||0)]));
 const rawFoodKg=FOOD_KEYS.reduce((sum,k)=>sum+(h[k]||0),0);
 const dailyGarden=Math.min(stocks.garden,need*.22);
 const dailyDairy=Math.min(stocks.dairy,need*.16);
 const dailyPulses=Math.min(stocks.pulses,need*.38);
 const dailyOats=Math.min(stocks.oats,Math.max(0,need-dailyGarden-dailyDairy-dailyPulses));
 const possibleToday=Math.min(need,dailyGarden+dailyDairy+dailyPulses+dailyOats+stocks.grain);
 const productive=people.filter(p=>workCapacity(p,'farm')>0);
 const farmLabour=people.reduce((n,p)=>n+workCapacity(p,'farm'),0);
 const loanOutstanding=(s.loans||[]).filter(l=>l.borrowerId===h.id&&['active','in-transit'].includes(l.status))
   .reduce((sum,l)=>sum+l.owed,0);
 const inbound=s.shipments.filter(t=>t.good==='grain'&&t.buyer===h.id).reduce((sum,t)=>sum+t.amount,0);
 return {
  day:s.day,houseId:h.id,communityId:h.communityId,people:people.length,
  stocks,needKg:round(need),stockDays:need>0?round(rawFoodKg/need):null,
  possibleRationToday:need>0?round(possibleToday/need):null,
  // "Possible" ignores reserved seed and tomorrow's food, deliberately an upper bound.
  caution:'Possible ration is an upper bound before seed protection; stock days are NOT guaranteed accessible food.',
  coin:round(h.coin||0),ownedFields:h.fields.length,leasedIn:h.leaseIn?.length||0,leasedOut:h.leaseOut?.length||0,
  adultResidents:people.filter(p=>p.age>=15).length,
  capableAdults:productive.length,
  capableFarmDayEquivalents:round(farmLabour),
  availableFarmDayEquivalents:round(productive.filter(p=>!p.travel||p.travel.end<=s.day).reduce((n,p)=>n+workCapacity(p,'farm'),0)),
  nonWorkingAdults:people.filter(p=>p.age>=15&&workCapacity(p,'farm')===0).length,
  maxAdultHealth:people.some(p=>p.age>=15)?round(Math.max(...people.filter(p=>p.age>=15).map(p=>p.health))):null,
  availableAdults:productive.filter(p=>!p.travel||p.travel.end<=s.day).length,
  workersTraveling:productive.filter(p=>p.travel&&p.travel.end>s.day).length,
  workerJobs:Object.fromEntries(['farm','wood','garden','hired','haul','cattle','build','home'].map(k=>
   [k,productive.filter(p=>p.job===k).length])),
  healthMin:people.length?round(Math.min(...people.map(p=>p.health))):null,
  foodDebtMax:people.length?round(Math.max(...people.map(p=>p.foodDebt||0))):null,
  shortageDays:h.shortage||0,livelihood:h.focus||null,
  sownHa:round(h.farmYear?.sownArea||0),harvestedHa:round(h.farmYear?.harvestedArea||0),
  outstandingLoansKg:round(loanOutstanding),grainInTransitKg:round(inbound),
  estateStatus:h.tenure||null
 };
}

export function detectCausalFlags(snapshot,foodAccessAtDeath=null,preDeathDays=[]){
 const flags=[];
 if(snapshot?.people>0 && snapshot.stockDays>=14 && snapshot.possibleRationToday<.99)
  flags.push('stocks-do-not-cover-daily-diet');
 // A worker who died TODAY must not be counted as evidence that the household
 // lacked workers BEFORE the death. Require persistent pre-death observations.
 const prior=preDeathDays.filter(row=>row.day<foodAccessAtDeath?.day || !foodAccessAtDeath).slice(-30);
 if(prior.length>=14 && prior.filter(x=>x.ownedFields>0 && x.availableAdults===0).length>=14)
  flags.push('persistent-labour-shortage-before-death');
 if(prior.length>=14 && prior.filter(x=>x.adultResidents>0&&x.capableFarmDayEquivalents<=.15).length>=14)
  flags.push('persistent-severe-labour-impairment-before-death');
 if(prior.length>=14 && prior.filter(x=>x.adultResidents===0).length>=14)
  flags.push('persistent-no-adult-residents-before-death');
 if(prior.length>=14 && prior.filter(x=>x.shortageDays>0 && x.outstandingLoansKg>0).length>=14)
  flags.push('persistent-food-shortage-with-debt');
 if(foodAccessAtDeath){
  if(foodAccessAtDeath.foodDays>=14 && snapshot?.foodDebtMax>0)
   flags.push('death-despite-positive-aggregate-stock-days');
  if(foodAccessAtDeath.affordableKg>0 && foodAccessAtDeath.grainInTransitKg===0)
   flags.push('purchase-potential-requires-investigation');
  if(foodAccessAtDeath.aid?.canDispatchNow && foodAccessAtDeath.aid.dispatchableKg>0)
   flags.push('aid-dispatch-eligible-on-death-day');
 }
 return flags;
}

export class CausalityRecorder {
 constructor({monthly=true,deathCaseLimit=Infinity}={}){
  this.rings=new Map();
  this.monthlySnapshots=[];
  this.deathCases=[];
  this.previousStarvations=0;
  this.monthlyEnabled=monthly;
  this.deathCaseLimit=deathCaseLimit;
  this.missingCases=0;
  this.lastObservedDay=-1;
 }
 capture(s) {
  if(s.day<=this.lastObservedDay)throw Error('Recorder needs strictly increasing simulation days');
  this.lastObservedDay=s.day;
  const members=livingByHouse(s),current=new Map();
  for(const h of s.households){
   const people=members.get(h.id)||[];
   if(!people.length)continue;
   const record=householdFoodSnapshot(s,h,people);
   current.set(h.id,record);
   if(!this.rings.has(h.id))this.rings.set(h.id,new Array(HOUSEHOLD_TRACE_DAYS));
   this.rings.get(h.id)[s.day%HOUSEHOLD_TRACE_DAYS]=record;
  }
  if(this.monthlyEnabled && (s.day%30===0 || s.day===1)){
   this.monthlySnapshots.push({
    day:s.day,year:round(s.day/365),population:overview(s).population,
    starvationDeaths:s.stats.starvationDeaths||0,
    households:[...current.values()],
   });
  }
  const fresh=(s.foodCases||[]).filter(x=>x.day===s.day);
  const increase=(s.stats.starvationDeaths||0)-this.previousStarvations;
  if(increase<0)throw Error('Starvation counter decreased');
  if(increase!==fresh.length)this.missingCases+=Math.abs(increase-fresh.length);
  for(const cause of fresh){
   if(this.deathCases.length>=this.deathCaseLimit)continue;
   const timeline=(this.rings.get(cause.houseId)||[]).filter(x=>x&&x.day>=s.day-HOUSEHOLD_TRACE_DAYS+1&&x.day<=s.day)
     .sort((a,b)=>a.day-b.day);
   const previousDays=timeline.filter(x=>x.day<s.day);
   // The snapshot from the fatal day has already lost the dead person's
   // workforce/health state. Use the preceding day for causal attribution.
   const latest=previousDays.at(-1)||timeline.at(-1)||null;
   this.deathCases.push({
    day:s.day,year:round(s.day/365),personId:cause.personId,
    houseId:cause.houseId,age:cause.age,reason:cause.reason,
    shortageDays:cause.shortageDays,foodAccessAtDeath:{...cause},
    preDeathObservationDays:previousDays.length,
    diagnosticFlags:detectCausalFlags(latest,cause,previousDays),timeline,
    evidenceLimit:'Snapshots cover up to 90 days; available purchases/aid are possibilities, not guaranteed transactions.',
   });
  }
  this.previousStarvations=s.stats.starvationDeaths||0;
  // Empty estates stay in the last ring long enough to explain the last death.
  for(const [id,ring] of this.rings)
   if(!members.has(id)&&ring.every(x=>!x||x.day<s.day-HOUSEHOLD_TRACE_DAYS))this.rings.delete(id);
 }
 result(s) {
  return {
   world:overview(s),monthly:this.monthlySnapshots,deaths:this.deathCases,
   starvationCount:s.stats.starvationDeaths||0,missingCases:this.missingCases,
   caveats:['Inventories are not promises of food access','No historical mortality targets or population floor',
    'A starvation death is a model-classified health<=0 death; other mortality includes illness/age risk',
    'Possible purchases and aid require route, willingness, credit and labour, not merely inventory'],
  };
 }
}
