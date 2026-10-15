#!/usr/bin/env node
// Living History targeted poverty-trap inquiry. Controlled counterfactuals run
// in temporary copies of the existing model; production mechanics stay intact.
// Substitutions are asserted, named and audited. No free resources or population floor.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createWorld,advanceDays,audit,overview,serialize} from '../model.js';
import {CausalityRecorder} from './causality-metrics.mjs';

const args=Object.fromEntries(process.argv.slice(2).filter(a=>a.startsWith('--')).map(v=>{
 const i=v.indexOf('=');return [v.slice(2,i),v.slice(i+1)];
}));
const seed=Number(args.seed??10061),years=Number(args.years??30),mode=args.mode||'forensic';
if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||!Number.isInteger(years)||years<1||years>60||
 !['forensic','threshold'].includes(mode))throw Error('Invalid mode / seed / years');
const round=n=>Math.round(n*100)/100;
const keys=['grain','oats','pulses','garden','dairy'];
const count=(a,fn)=>a.filter(fn).length;
const median=v=>!v.length?null:([...v].sort((a,b)=>a-b)[Math.floor((v.length-1)/2)]+[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)])/2;
const appDir=fileURLToPath(new URL('..',import.meta.url));
const result={schemaVersion:1,mode,seed,years,modelVersion:'main with audited read-only trials'};
function check(s,label,year){
 const report=audit(s);
 if(!report.ok)throw Error(JSON.stringify({label,seed,year,issues:report.issues.slice(0,5)}));
}

function digestRun(s,year){
 const alive=s.people.filter(p=>p.alive),homes=s.households.filter(h=>h.members.some(id=>alive.some(p=>p.id===id)));
 const adults=alive.filter(p=>p.age>=15);
 return {year,population:alive.length,starved:s.stats.starvationDeaths||0,born:s.stats.born||0,
  allDeaths:s.stats.died||0,grainKg:overview(s).grain,
  oatsKg:round(s.households.reduce((n,h)=>n+(h.oats||0),0)),
  pulsesKg:round(s.households.reduce((n,h)=>n+(h.pulses||0),0)),
  adults:adults.length,incapacitatedAdults:count(adults,p=>p.health<=25),
  incapacitatedShare:round(count(adults,p=>p.health<=25)/Math.max(1,adults.length)),
  householdsWithoutCapableAdult:count(homes,h=>!h.members.some(id=>adults.some(p=>p.id===id&&p.health>25))),
  aidKg:round(s.stats.aid||0),grainWagesKg:round(s.stats.grainWagesKg||0),
  loanIssuedKg:round(s.stats.loanIssuedKg||0),loanDefaults:s.stats.loanDefaults||0,
  fields:homes.reduce((n,h)=>n+h.fields.length,0)};
}
function classify(item){
 const prev=(item.timeline||[]).filter(t=>t.day<item.day),last=prev.at(-1)||{};
 const recent=prev.slice(-30),fourteen=(pred)=>count(recent,pred)>=14;
 return {
  age:item.age,personId:item.personId,houseId:item.houseId,day:item.day,
  reason:item.reason,householdMembers:last.people??null,
  adultResidents:last.adultResidents??null,
  capableAdults:last.capableAdults??null,
  noAdultsLong:fourteen(x=>x.adultResidents===0),
  adultsPresentButUnfitLong:fourteen(x=>x.adultResidents>0&&x.capableAdults===0),
  shortageWithDebtLong:fourteen(x=>x.shortageDays>0&&x.outstandingLoansKg>0),
  noAvailableWorkerLong:fourteen(x=>x.availableAdults===0),
  noFullRationLong:fourteen(x=>x.possibleRationToday<.99),
  ableWorkersDays:count(recent,x=>x.availableAdults>0),
  lackWorkersDays:count(recent,x=>x.availableAdults===0),
  foodCoverageLastDay:last.possibleRationToday??null,
  previousStockDays:last.stockDays??null,
  coin:last.coin??null,landStrips:last.ownedFields??null,
  loanKg:last.outstandingLoansKg??null,
  neighbourAidPotentialKg:item.foodAccessAtDeath?.potentialAidKg??0,
  affordableKg:item.foodAccessAtDeath?.affordableKg??0,
  transitKg:item.foodAccessAtDeath?.grainInTransitKg??0,
  diagFlags:item.diagnosticFlags
 };
}
function summarizeDeaths(items){
 const classified=items.map(classify),N=classified.length;
 return {total:N,ageGroups:{infant:count(classified,x=>x.age<5),child:count(classified,x=>x.age>=5&&x.age<15),
  adult:count(classified,x=>x.age>=15&&x.age<60),elder:count(classified,x=>x.age>=60)},
  noAdultsLong:count(classified,x=>x.noAdultsLong),
  adultsPresentButUnfitLong:count(classified,x=>x.adultsPresentButUnfitLong),
  shortageWithDebtLong:count(classified,x=>x.shortageWithDebtLong),
  noAvailableWorkerLong:count(classified,x=>x.noAvailableWorkerLong),
  noFullRationLong:count(classified,x=>x.noFullRationLong),
  medianLostWorkerDays30:median(classified.map(x=>x.lackWorkersDays)),
  hadPotentialAid:count(classified,x=>x.neighbourAidPotentialKg>0),
  couldAffordGrain:count(classified,x=>x.affordableKg>=7),
  hadGrainInTransit:count(classified,x=>x.transitKg>0),
  containedLand:count(classified,x=>x.landStrips>0),
  deathsWithHouseholdRecords:count(classified,x=>x.adultResidents!==null),
  categoriesOverlap:true
 };
}

async function getEngine(label){
 if(label==='base')return {createWorld,advanceDays,audit,overview,serialize};
 // The pre-v0.7.3 binary threshold experiment has been completed and its
 // original report is archived. Current sensitivity compares continuous
 // fitness curves around the production healthy=75 reference, not fake
 // "healthy at 10" workers doing a full day of work.
 const modelSource=fs.readFileSync(path.join(appDir,'model.js'),'utf8');
 const navigationSource=fs.readFileSync(path.join(appDir,'navigation.js'),'utf8');
 const target='const healthy=75;';
 if(modelSource.split(target).length!==2)throw Error('Labour-curve intervention anchor changed');
 const healthy=label==='gentle60'?60:label==='strict90'?90:null;
 if(!healthy)throw Error('Unknown sensitivity label');
 const revised=modelSource.replace(target,'const healthy='+healthy+';');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'living-work-curve-'));
 fs.writeFileSync(path.join(dir,'package.json'),'{"type":"module"}');
 fs.writeFileSync(path.join(dir,'model.js'),revised);
 fs.writeFileSync(path.join(dir,'navigation.js'),navigationSource);
 const imported=await import(pathToFileURL(path.join(dir,'model.js')).href);
 return {...imported,dispose:()=>fs.rmSync(dir,{recursive:true,force:true}),
  patch:{label,changed:'healthy-normalization',healthy,baselineHealthy:75}};
}

async function runThreshold(){
 const variants=['base','gentle60','strict90'],rows=[];
 for(const label of variants){
  const engine=await getEngine(label);
  try {
   const s=engine.createWorld(seed),trajectory=[digestRun(s,0)];
   for(let y=1;y<=years;y++){
    engine.advanceDays(s,365);
    const ok=engine.audit(s);
    if(!ok.ok)throw Error('Material audit '+label+' year='+y+' '+ok.issues.slice(0,3).join(' / '));
    trajectory.push(digestRun(s,y));
   }
   rows.push({label,patch:engine.patch||null,final:trajectory.at(-1),annual:trajectory,
    audit:{passed:true,years}});
   console.log('THRESHOLD',seed,label,'population',trajectory.at(-1).population,
    'starved',trajectory.at(-1).starved,'incapacitatedAdults',trajectory.at(-1).incapacitatedAdults);
  }finally{engine.dispose?.();}
 }
 const baseline=rows[0];
 for(const row of rows){
  row.deltaPopulation=row.final.population-baseline.final.population;
  row.deltaStarved=row.final.starved-baseline.final.starved;
  row.firstAnnualPopulationDifference=row.annual.findIndex((x,i)=>x.population!==baseline.annual[i].population);
 }
 result.variants=rows;result.method={
  matchedInitialSeed:seed,changedCode:'Only the healthy-normalization constant of workCapacity in a temporary copy of model.js is changed; the base engine remains untouched',
  gentle60:'Full effective day is reached at health 60 rather than 75',
  strict90:'Full effective day is reached at health 90 rather than 75',
  caveat:'Sensitivity probes the structural effect of labour eligibility. It does not establish the historically correct cutoff.',
  demography:'Same keyed draw procedure; economic choices and eligibility can diverge after intervention'};
}

function runForensic(){
 const s=createWorld(seed),recorder=new CausalityRecorder({monthly:true});
 const annual=[digestRun(s,0)];
 for(let day=1;day<=years*365;day++){
  advanceDays(s,1);recorder.capture(s);
  if(day%365===0){check(s,'forensic',day/365);annual.push(digestRun(s,day/365));}
 }
 const cases=recorder.deathCases;
 if(recorder.missingCases||cases.length!==(s.stats.starvationDeaths||0))
  throw Error('Incomplete death ledger '+cases.length+' vs '+s.stats.starvationDeaths);
 const classified=cases.map(classify);
 // Export a reproducible but compact selection of detailed 90-day trajectories.
 const ranked=[...cases].sort((a,b)=>
  (b.timeline.filter(x=>x.availableAdults===0).length-a.timeline.filter(x=>x.availableAdults===0).length)
  ||a.day-b.day);
 const selected=[...new Map([...ranked.slice(0,6),...cases.slice(0,3),...cases.slice(-3)].map(c=>[c.personId,c])).values()];
 result.final=annual.at(-1);
 result.annual=annual;
 result.deathSummary=summarizeDeaths(cases);
 result.deathRecords=classified;
 result.examples=selected.map(item=>({
  ...classify(item),
  history:item.timeline.filter((_,i)=>i%7===0||i===item.timeline.length-1)
   .map(t=>({day:t.day,foodDays:t.stockDays,ration:t.possibleRationToday,
    shortage:t.shortageDays,adults:t.adultResidents,capable:t.capableAdults,
    healthAdultMax:t.maxAdultHealth,coin:t.coin,loanKg:t.outstandingLoansKg,
    grain:t.stocks.grain,oats:t.stocks.oats,pulses:t.stocks.pulses,fields:t.ownedFields}))
 }));
 result.warnings=[
  'A final daily snapshot is post-death: pre-death timeline rows alone are used to attribute labour eligibility',
  'Eligible labour ignores temporarily absent workers; inspect capableAdults and availableAdults separately',
  'Aid potential is not a guarantee; it does not check the full donor-specific mutualAid predicate',
  'Shortage and borrowing correlate with hunger, but a causal direction is not established'];
 console.log('FORENSIC',seed,'pop',result.final.population,'starved',result.deathSummary.total,
 'noWorkers30',result.deathSummary.noAvailableWorkerLong,
 'unfit30',result.deathSummary.adultsPresentButUnfitLong,
 'noAdults30',result.deathSummary.noAdultsLong,
 'debt30',result.deathSummary.shortageWithDebtLong,
 'aidPot',result.deathSummary.hadPotentialAid,
 'affordable',result.deathSummary.couldAffordGrain);
}
if(mode==='threshold')await runThreshold();else runForensic();
const output=args.output;
if(output){fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(result,null,2));
 console.log('STUDY COMPLETE',mode,seed,years,'file',output);}
else console.log(JSON.stringify({mode,seed,deathSummary:result.deathSummary,
 variants:result.variants?.map(x=>({label:x.label,final:x.final,deltaPopulation:x.deltaPopulation,
  deltaStarved:x.deltaStarved}))},null,2));
