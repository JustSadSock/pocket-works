#!/usr/bin/env node
// Controlled long-run road-site experiment. One difference only: the coefficient
// multiplying road wear in chooseSettlementSite(). Routes, prices, fields,
// demographics, weather and every resource rule remain untouched.
import {createWorld,advanceDays,audit,serialize,deserialize,overview,SIZE} from '../model.js';
import {homeRoadMetrics,median,share,TRACK_WEAR,MAIN_WEAR} from './spatial-metrics.mjs';
import {performance} from 'node:perf_hooks';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';

export const ROAD_ARMS=Object.freeze([
 Object.freeze({name:'no-incentive',weight:0}),
 Object.freeze({name:'baseline',weight:1}),
 Object.freeze({name:'double-incentive',weight:2})
]);
const get=(n,otherwise)=>process.argv.find(x=>x.startsWith('--'+n+'='))?.slice(n.length+3)??otherwise;
export function currentHouses(s){
 const active=new Set(s.people.filter(p=>p.alive).map(p=>p.houseId));
 return s.households.filter(h=>active.has(h.id));
}
const rounded=n=>Math.round(n*100)/100;
export function geography(s,year){
 const homes=currentHouses(s),byId=new Map(s.communities.map(c=>[c.id,c]));
 const spatial=homeRoadMetrics(s.traffic,SIZE,homes);
 const neighbour=[];
 for(const h of homes){
  let best=Infinity;
  for(const other of homes)if(h!==other&&h.communityId===other.communityId)
   best=Math.min(best,Math.hypot(h.x-other.x,h.y-other.y));
  if(Number.isFinite(best))neighbour.push(best);
 }
 const homeFoodDays=[],fieldWalk=[],poverty=[];
 const livingPeople=s.people.filter(p=>p.alive);
 const peopleByHouse=new Map();
 for(const p of livingPeople){
  if(!peopleByHouse.has(p.houseId))peopleByHouse.set(p.houseId,[]);
  peopleByHouse.get(p.houseId).push(p);
 }
 for(const h of homes){
  const members=peopleByHouse.get(h.id)||[];
  const kcalDaily=members.reduce((sum,p)=>sum+(p.age<4?.35:p.age<10?.55:p.age<15?.77:1)*.68,0);
  const food=(h.grain||0)+(h.oats||0)+(h.pulses||0)+(h.garden||0)+(h.dairy||0);
  if(kcalDaily>0){const days=food/kcalDaily;homeFoodDays.push(days);poverty.push(days<30);}
  if(Number.isFinite(h.commuteMemo?.effort))fieldWalk.push(h.commuteMemo.effort);
 }
 const ov=overview(s);
 let wear=0,main=0;
 for(const v of s.traffic){if(v>=TRACK_WEAR)wear++;if(v>=MAIN_WEAR)main++;}
 return {year,population:ov.population,homes:homes.length,totalHomes:s.households.length,
  built:s.stats.built||0,born:s.stats.born||0,died:s.stats.died||0,
  starvationDeaths:s.stats.starvationDeaths||0,
  grainKg:ov.grain,totalEdibleKg:rounded(s.households.reduce((a,h)=>a+(h.grain||0)+(h.oats||0)+(h.pulses||0)+(h.garden||0)+(h.dairy||0),0)),
  grainHarvestKg:rounded(s.stats.harvest||0),
  woodKg:ov.wood,trades:s.stats.trades||0,landReclaimed:s.stats.landReclaimed||0,
  migrations:s.stats.migrations||0,
  landlessHomes:homes.filter(h=>!h.fields?.length).length,
  foodDaysMedian:rounded(median(homeFoodDays)??0),familiesUnder30Days:poverty.filter(Boolean).length,
  medianCommuteEffort:rounded(median(fieldWalk)??0),
  medianNeighbourDistanceTiles:rounded(median(neighbour)??0),
  mainRoadTiles:main,wornRoadTiles:wear,
  coreRoadWithinTwoTilesShare:spatial.coreRoadWithinTwoTilesShare,
  medianCoreDistanceTiles:spatial.coreRoadDistanceTilesMedian,
  junctions:spatial.junctionCount,communityIds:[...byId.keys()]};
}
export function delta(base,alternative){
 const keys=['population','homes','built','starvationDeaths','grainKg','totalEdibleKg',
  'grainHarvestKg','woodKg','trades','landReclaimed','migrations','landlessHomes',
  'foodDaysMedian','familiesUnder30Days','medianCommuteEffort','medianNeighbourDistanceTiles',
  'mainRoadTiles','wornRoadTiles','coreRoadWithinTwoTilesShare','medianCoreDistanceTiles','junctions'];
 return Object.fromEntries(keys.map(k=>[k,base[k]===null||alternative[k]===null?null:rounded(alternative[k]-base[k])]));
}
export function buildRoadExperiment(seed,years,log=false){
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid seed');
 if(![1,5,20,50].includes(years))throw Error('Allowed years: 1, 5, 20, 50');
 const checkpoint=[1,5,20,50].filter(y=>y<=years);
 const initial=serialize(createWorld(seed,{scenario:'normal'}));
 const initialState=deserialize(initial);
 if(initialState.tuning.roadAttraction!==1)throw Error('Default must be neutral');
 const outputs=[];
 for(const {name,weight} of ROAD_ARMS){
  const world=deserialize(initial);
  world.tuning.roadAttraction=weight;
  const annualAudit=[],snapshots=[],started=performance.now();
  for(let year=1;year<=years;year++){
   advanceDays(world,365);
   const a=audit(world);
   if(!a.ok)throw Error('Audit '+seed+'/'+name+'/'+year+': '+a.issues.slice(0,6).join(' | '));
   annualAudit.push(year);
   if(checkpoint.includes(year))snapshots.push(geography(world,year));
  }
  outputs.push({name,weight,yearsAudited:annualAudit.length,auditedYears:annualAudit,snapshots,
   runtimeMs:Math.round(performance.now()-started)});
  if(log)console.log('ROAD ARM',seed,name,years,'years','population',snapshots.at(-1).population,'built',snapshots.at(-1).built);
 }
 const b=outputs.find(v=>v.name==='baseline');
 const paired=outputs.filter(v=>v!==b).map(alt=>({
  arm:alt.name,weight:alt.weight,
  checkpoints:checkpoint.map((year,i)=>({year,changes:delta(b.snapshots[i],alt.snapshots[i])}))
 }));
 return {schema:1,study:'settlement-road-attraction-paired',seed,years,scenario:'normal',
  intervention:'One site-scoring term: road wear × 0.33 × controlled multiplier; initialized from identical serialized state.',
  arms:outputs,paired,initialEqualAcrossArms:true,
  limitations:[
   'These are coupled causal trajectories with different development outcomes, not matched household identities after splits.',
   'Only the site-selection incentive changes. Actual roads still reduce travel effort equally in every arm.',
   'Identical starting state does not imply identical later RNG identities when births, construction and household IDs diverge.',
   'Four village origins are pre-defined and not experimentally varied. No archaeological authenticity threshold is fitted.'
  ]};
}
const invoked=process.argv[1]&&import.meta.url===new URL('file://'+resolve(process.argv[1])).href;
if(invoked){
 const seed=Number(get('seed','413')),years=Number(get('years','50'));
 const destination=resolve(get('output','./road-incentive.json'));
 const result=buildRoadExperiment(seed,years,true);
 mkdirSync(dirname(destination),{recursive:true});
 writeFileSync(destination,JSON.stringify(result,null,2));
 console.log('ROAD PAIRED COMPLETE',seed,years,destination);
}
