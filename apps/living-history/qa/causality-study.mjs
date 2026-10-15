#!/usr/bin/env node
// Reproducible v0.7.1 causal audit. All interventions are explicit scenarios;
// there is NO population target, emergency ration, or hidden resource creation.
// Use --group + --batch to keep Universal QA jobs below the 45-minute limit.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createWorld,advanceDays,audit,overview} from '../model.js';
import {historicalObservation,quantiles} from '../historical-calibration.js';
import {CausalityRecorder,householdFoodSnapshot,livingByHouse} from './causality-metrics.mjs';

export const FAMILY_SEEDS=Object.freeze([
 413,7777,43821,9001,11,29,101,202,303,404,505,606,12345,21773,51291,71331,
 909,1818,2727,3636,4545,5454,6363,7272,8181,9191,10001,10007,10009,10037,10039,10061
]);
export const FACTORS=Object.freeze([
 {id:'baseline',tuning:{}},
 {id:'yield-minus-5',tuning:{yield:.95}},
 {id:'yield-plus-5',tuning:{yield:1.05}},
 {id:'planting-minus-5',tuning:{planting:.95}},
 {id:'storage-minus-5',tuning:{storage:.95}},
 {id:'transport-minus-5',tuning:{transport:.95}},
]);
export const CRISES=Object.freeze([
 {id:'multi-year-drought',scenario:'drought',tuning:{}},
 {id:'trade-isolation',scenario:'isolated',tuning:{}},
 {id:'draft-oxen-plague',scenario:'normal',tuning:{},oxenShock:true},
 {id:'compound-trade-yield-oxen',scenario:'isolated',tuning:{yield:.90},oxenShock:true},
]);
const YEAR_DAYS=365;
const round=n=>Math.round(n*100)/100;
const parse=Object.fromEntries(process.argv.slice(2).filter(s=>s.startsWith('--')).map(v=>{
 const i=v.indexOf('=');return [v.slice(2,i<0?undefined:i),i<0?'true':v.slice(i+1)];
}));
const group=parse.group||'family';
const batches={family:16,paired:12,crisis:12,genealogy:8};
const defaults={family:30,paired:25,crisis:30,genealogy:200};
const batch=Number(parse.batch??0),years=Number(parse.years??defaults[group]);
if(!(group in batches)||!Number.isSafeInteger(batch)||batch<0||batch>=batches[group]||
 !Number.isSafeInteger(years)||years<1||years>200)throw Error('Invalid group, batch or years');

const summarize=s=>{
 const members=livingByHouse(s);
 const home=s.households.filter(h=>members.has(h.id));
 const o=overview(s),rations=home.map(h=>householdFoodSnapshot(s,h,members.get(h.id)));
 const activePeople=s.people.filter(p=>p.alive);
 return {
  year:Math.floor(s.day/YEAR_DAYS),population:o.population,
  inhabitedHomes:home.length,activeVillages:s.communities.filter(c=>home.some(h=>h.communityId===c.id)).length,
  starvationDeaths:s.stats.starvationDeaths||0,births:s.stats.born||0,deaths:s.stats.died||0,
  grainKg:o.grain,oatsKg:round(s.households.reduce((n,h)=>n+(h.oats||0),0)),
  pulsesKg:round(s.households.reduce((n,h)=>n+(h.pulses||0),0)),
  grainHarvestKg:round(s.stats.harvest||0),outsideImportsKg:round(s.stats.outsideGrainIn||0),
  grainWagesKg:round(s.stats.grainWagesKg||0),loanIssuedKg:round(s.stats.loanIssuedKg||0),
  loanDefaults:s.stats.loanDefaults||0,activeLoans:(s.loans||[]).filter(l=>l.status==='active').length,
  staffedHouseholds:rations.filter(x=>x.availableAdults>0).length,
  under30StockDays:rations.filter(x=>x.stockDays!==null&&x.stockDays<30).length,
  deprivedRationToday:rations.filter(x=>x.possibleRationToday!==null&&x.possibleRationToday<.99).length,
  meanOwnedStrips:round(home.reduce((n,h)=>n+h.fields.length,0)/Math.max(1,home.length)),
  medianHouseholdSize:quantiles(home.map(h=>members.get(h.id).length)).median,
  medianLivingAge:quantiles(activePeople.map(p=>p.age)).median,
  livingDraftOxen:home.reduce((n,h)=>n+(h.draftOxen||0),0),
  residentialMigrations:s.stats.migrations||0,
  serviceMigrants:s.stats.serviceMigrants||0,
 };
};
function check(s,seed,id,year){
 const result=audit(s);
 if(!result.ok)throw Error('Material/rights audit failed '+JSON.stringify({seed,id,year,issues:result.issues.slice(0,10)}));
}
export function killDraftOxen(s){
 // Explicit, deterministic, one-time animal-loss shock; no meat is created.
 // Physical cattle death counters preserve all existing livestock invariants.
 let deaths=0,affected=0;
 for(const h of s.households){
  if(h.id%3===0||!h.draftOxen)continue;
  const lost=h.draftOxen;
  h.draftOxen-=lost;h.cattle-=lost;
  deaths+=lost;affected++;
 }
 s.stats.cattleDied=(s.stats.cattleDied||0)+deaths;
 return {day:s.day,affectedHouseholds:affected,deadDraftOxen:deaths};
}
function runAnnual(seed,variant,years,extra={}){
 const s=createWorld(seed,{scenario:variant.scenario||'normal',tuning:variant.tuning||{}});
 const chronicle=[summarize(s)];
 let intervention=null;
 for(let year=1;year<=years;year++){
  if(year===6&&variant.oxenShock){intervention=killDraftOxen(s);check(s,seed,variant.id,year);}
  advanceDays(s,YEAR_DAYS);
  check(s,seed,variant.id,year);
  chronicle.push(summarize(s));
 }
 const end=historicalObservation(s);
 return {seed,variant:variant.id,years,intervention,chronicle,final:chronicle.at(-1),
  historical:{femaleFirstMarriage:end.femaleFirstMarriage,maleFirstMarriage:end.maleFirstMarriage,
   farmlandGini:end.farmlandGini,customaryTenementsAbove10Acres:end.customaryTenementsAbove10Acres},
  audit:{ok:true,yearsChecked:years},...extra};
}
function runFamily(seed,years){
 const s=createWorld(seed,{scenario:'normal'});
 const recorder=new CausalityRecorder();
 const annual=[summarize(s)];
 for(let day=1;day<=years*YEAR_DAYS;day++){
  advanceDays(s,1);
  recorder.capture(s);
  if(day%YEAR_DAYS===0){check(s,seed,'family',day/YEAR_DAYS);annual.push(summarize(s));}
 }
 const evidence=recorder.result(s);
 if(evidence.missingCases)throw Error('Missing exact-day starvation evidence: '+seed+' count '+evidence.missingCases);
 return {seed,variant:'baseline',years,annual,monthly:evidence.monthly,
  deaths:evidence.deaths,starvationCount:evidence.starvationCount,
  deathCasesRecorded:evidence.deaths.length,missingCases:0,
  audit:{ok:true,yearsChecked:years},caveats:evidence.caveats};
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
const seeds=group==='family'?FAMILY_SEEDS.slice(batch*2,batch*2+2):
 group==='paired'?FAMILY_SEEDS.slice(batch*2,batch*2+2):
 group==='crisis'?[FAMILY_SEEDS[batch]]:[FAMILY_SEEDS[batch]];
const runs=[];
for(const seed of seeds){
 if(group==='family'){
  const r=runFamily(seed,years);runs.push(r);
  console.log('FAMILY',seed,'deaths',r.deathCasesRecorded,'population',r.annual.at(-1).population);
 }else if(group==='paired'){
  const sameSeed=FACTORS.map(f=>runAnnual(seed,f,years));
  const reference=sameSeed[0];
  for(const row of sameSeed){
   row.populationDifference=row.final.population-reference.final.population;
   row.starvationDifference=row.final.starvationDeaths-reference.final.starvationDeaths;
   row.firstPopulationDivergence=reference.chronicle.findIndex((v,i)=>v.population!==row.chronicle[i].population);
   runs.push(row);
  }
  console.log('PAIRED',seed,sameSeed.map(x=>x.variant+':'+x.final.population).join(' '));
 }else if(group==='crisis'){
  for(const v of CRISES)runs.push(runAnnual(seed,v,years));
  console.log('CRISIS',seed,runs.slice(-CRISES.length).map(x=>x.variant+':'+x.final.population).join(' '));
 }else{
  runs.push(runAnnual(seed,{id:'baseline-200-year'},years));
  console.log('GENEALOGY',seed,'population',runs.at(-1).final.population);
 }
}
const output={
 schemaVersion:1,study:'living-history-causality-v0.7.1',group,batch,years,seeds,
 requestedDesign:{family:{worlds:32,years:30,monthlyHouseholdSnapshots:true,dailyDeathTimelineDays:90},
  paired:{worlds:24,variants:6,years:25},
  crisis:{worlds:12,variants:4,years:30},
  genealogy:{worlds:8,years:200}},
 samples:runs.length,results:runs,
 limitations:[
  'All results are from the simulation, not a statistical estimate of 1280 England.',
  'Population decline and starvation are not QA failures; breakage of physical/rights invariants is.',
  'Raw food stock days are not ration days; milk and pulses have dietary limits, seed can be protected.',
  'Scenario interventions are researcher-defined counterfactuals, not historically observed event rates.',
  'Paired runs have keyed weather and demographic risk, but economic choices still alter eligibility and trajectories.',
  'The oxen shock uses registered deaths, no carcass food or replacement animals.',
  'A 200-year run tests internal stability, not reconstruction of 1280–1480 history.',
 ],
};
const destination=parse.output||parse.out;
if(destination){fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(output));
 console.log('AUDIT COMPLETE',group,'batch',batch,'worlds',runs.length,'file',destination);}
else console.log(JSON.stringify({group,batch,years,seeds,samples:runs.length,
 stats:runs.map(r=>({seed:r.seed,variant:r.variant,population:(r.final||r.annual?.at(-1))?.population,
  starvationDeaths:(r.final||r.annual?.at(-1))?.starvationDeaths}))},null,2));

}
