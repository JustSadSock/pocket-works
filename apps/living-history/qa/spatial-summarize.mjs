#!/usr/bin/env node
// Fail-closed cartographic summary. Every reported world must pass all 50
// material-balance audits. Morphology is not a target population/road shape.
import fs from 'node:fs';
import path from 'node:path';
import {SEEDS} from './spatial-seeds.mjs';
import {median,share} from './spatial-metrics.mjs';

const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')).map(x=>{const i=x.indexOf('=');return [x.slice(2,i),x.slice(i+1)];}));
const root=path.resolve(args.input||'raw'),dest=path.resolve(args.output||'summary');
fs.mkdirSync(dest,{recursive:true});
const reports=[],errors=[],checkpoints=[1,5,20,50];
for(const seed of SEEDS){
 const shard=Math.floor(SEEDS.indexOf(seed)/2),base=path.join(root,'spatial-shard-'+shard,String(seed));
 const file=path.join(base,'metrics.json'),map=path.join(base,'maps.svg');
 if(!fs.existsSync(file)||!fs.existsSync(map)){errors.push('Missing files for seed '+seed);continue;}
 let r;
 try{r=JSON.parse(fs.readFileSync(file,'utf8'));}
 catch(e){errors.push('Unreadable seed '+seed+': '+e.message);continue;}
 if(r.schema!==2||r.seed!==seed||r.years!==50
  ||r.snapshots?.map(x=>x.year).join(',')!==checkpoints.join(',')
  ||r.auditPassedYears?.join(',')!==Array.from({length:50},(_,i)=>i+1).join(','))errors.push('Incomplete or wrong schema seed '+seed);
 if(!Array.isArray(r.constructionObservations)
  ||r.constructionObservations.some(h=>h.year<1||h.year>50||h.dayBuilt<1||h.dayBuilt>18250
   ||!Number.isInteger(h.houseId)||h.priorYearTrackDistanceTiles< -1))errors.push('Invalid construction history seed '+seed);
 for(const s of r.snapshots||[]){
  if(s.communities?.length!==4||s.road?.worn<0||s.road?.main<0
   ||!s.roadStructure||!s.roadAblation
   ||s.roadAblation.comparable>s.roadAblation.attempts
   ||s.roadAblation.changed>s.roadAblation.comparable
   ||s.roadAblation.trials?.length!==s.roadAblation.attempts
   ||s.communities.some(c=>c.roadFrontageShare<0||c.roadFrontageShare>1
     ||c.coreRoadCells<0||c.coreRoadWithinTwoTilesShare===undefined||c.coreRoadDistanceTilesMedian===undefined
     ||c.mainRoadWithinTwoTilesShare!==null&&(c.mainRoadWithinTwoTilesShare<0||c.mainRoadWithinTwoTilesShare>1)
     ||c.junctionWithinSixTilesShare!==null&&(c.junctionWithinSixTilesShare<0||c.junctionWithinSixTilesShare>1))){
   errors.push('Invalid morphology seed '+seed+' year '+s.year);break;
  }
 }
 if(!fs.readFileSync(map,'utf8').startsWith('<svg'))errors.push('Invalid map '+seed);
 reports.push(r);
}
const med=values=>median(values);
const round=x=>Math.round(x*1000)/1000;
const allConstruction=reports.flatMap(r=>r.constructionObservations||[]);
const yearStats=checkpoints.map(year=>{
 const snapshots=reports.map(r=>r.snapshots?.find(x=>x.year===year)).filter(Boolean);
 const communities=snapshots.flatMap(s=>s.communities||[]);
 const probes=snapshots.map(s=>s.roadAblation).filter(Boolean);
 const eligible=allConstruction.filter(h=>h.year<=year);
 return {year,worlds:snapshots.length,communitySnapshots:communities.length,
  medianPopulation:med(snapshots.map(s=>s.population)),
  medianHouseholds:med(snapshots.map(s=>s.inhabitedHomes)),
  medianWornRoadCells:med(snapshots.map(s=>s.road.worn)),
  medianMainRoadCells:med(snapshots.map(s=>s.road.main)),
  legacyFrontageShare:med(communities.map(c=>c.roadFrontageShare)),
  medianMainRoadWithinTwoTilesShare:med(communities.map(c=>c.mainRoadWithinTwoTilesShare)),
  medianCoreRoadWithinTwoTilesShare:med(communities.map(c=>c.coreRoadWithinTwoTilesShare)),
  medianCoreRoadDistanceTiles:med(communities.map(c=>c.coreRoadDistanceTilesMedian)),
  medianJunctionWithinSixTilesShare:med(communities.map(c=>c.junctionWithinSixTilesShare)),
  medianDistanceToMainRoadTiles:med(communities.map(c=>c.mainRoadDistanceTilesMedian)),
  medianDistanceToJunctionTiles:med(communities.map(c=>c.junctionDistanceTilesMedian)),
  medianVillageRadiusTiles:med(communities.map(c=>c.radiusTilesMedian)),
  medianNearestNeighbourTiles:med(communities.map(c=>c.neighbourTilesMedian)),
  medianWalkingDistanceToFieldsTiles:med(communities.map(c=>c.fieldsWalkTilesMedian)),
  medianActualEffortToFields:med(communities.map(c=>c.fieldsActualEffortMedian)),
  junctionCount: snapshots.reduce((n,s)=>n+s.roadStructure.junctionCount,0),
  isolatedHomes:communities.reduce((n,c)=>n+c.isolatedHouses,0),
  totalsCroftTiles:communities.reduce((n,c)=>n+c.croftTiles,0),
  siteSelectionAblation:{compared:probes.reduce((n,x)=>n+x.comparable,0),
   changed:probes.reduce((n,x)=>n+x.changed,0),
   changedShare:share(probes.flatMap(x=>x.trials.filter(t=>t.comparable).map(t=>t.changed)))},
  newHomesToDate:eligible.length,
  newHomesWithinTwoTilesOfPriorYearTrackShare:share(eligible.map(h=>h.priorYearTrackDistanceTiles>=0&&h.priorYearTrackDistanceTiles<=2)),
  medianPriorYearTrackDistanceForNewHomes:med(eligible.map(h=>h.priorYearTrackDistanceTiles>=0?h.priorYearTrackDistanceTiles:null))
 };
});
const last=yearStats.at(-1),first=yearStats[0];
const findings=[
 {id:'street-frontage-saturation',type:'measurement',
  observation:'Legacy frontage within two cells = '+last.legacyFrontageShare+' at year 50; absolute main-road frontage = '+last.medianMainRoadWithinTwoTilesShare+' while rank-core frontage = '+last.medianCoreRoadWithinTwoTilesShare+'.',
  mechanism:'initialFootpaths() and markRoad() imprint journeys from homes; a radius around the same homes cannot distinguish a street from a private access trail.',
  response:'Do not interpret legacy or absolute-main-road frontage as street organization. Inspect top-decile core road access, junction structure and construction-time temporal evidence.'},
 {id:'road-incentive-in-site-choice',type:'paired-selection-test',
  observation:last.siteSelectionAblation.changed+' of '+last.siteSelectionAblation.compared+' same-state site selections move if traffic is zeroed.',
  mechanism:'chooseSettlementSite() rewards wear; croftCandidate() also penalizes existing traffic behind the toft.',
  response:'Road ablation isolates the immediate selection rule. It does not demonstrate how a different road network would evolve over 50 years.'},
 {id:'founding-geometry-and-road-order',type:'causal-limitation',
  observation:allConstruction.length+' houses built after day zero; '+String(last.newHomesWithinTwoTilesOfPriorYearTrackShare)+' within two tiles of a track already present at the start of their construction year.',
  mechanism:'Four community centers are initialized at fixed scenario anchors and inherited tracks are seeded by real starting household routes.',
  response:'Separate micro-location choice from community founding, and do not mistake road presence at year start for an exact construction-day timestamp.'}
];
const report={schema:2,complete:reports.length===24&&errors.length===0,seeds:reports.length,simulatedYears:reports.length*50,
 yearStats,findings,errors,limitations:[
 'This model-internal morphology comparison is not independent archaeological validation.',
 'There are four predetermined community anchor positions; spontaneous village founding is not simulated.',
 'The road ablation is a controlled frozen-state selector comparison, not a paired long-running world.',
 'A one-year baseline road precedes year-end buildings only coarsely; no construction-day causal ordering is claimed.',
 'A population decline is not automatically caused by roads or building placement.'
]};
fs.writeFileSync(path.join(dest,'summary.json'),JSON.stringify(report,null,2));
let md='# «Живая история» v0.7.6 — анатомия поселения\n\n';
md+='**Проверено:** '+report.seeds+'/24 миров, '+report.simulatedYears+'/1200 лет, ежегодный материальный аудит; статус: '+(report.complete?'полный':'НЕПОЛНЫЙ')+'.\n\n';
md+='| Год | Население (мед.) | Дома (мед.) | Дороги, клетки (мед.) | Магистрали (мед.) | У магистрали ≤2 клеток | У топ-10% дорог ≤2 клеток | До ядра дороги, клетки | Пешком до пашни | Контрфактов с изменением места |\n';
md+='|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
for(const s of yearStats)md+='| '+[s.year,s.medianPopulation,s.medianHouseholds,s.medianWornRoadCells,s.medianMainRoadCells,s.medianMainRoadWithinTwoTilesShare,s.medianCoreRoadWithinTwoTilesShare,s.medianCoreRoadDistanceTiles,s.medianWalkingDistanceToFieldsTiles,(s.siteSelectionAblation.changed+'/'+s.siteSelectionAblation.compared)].join(' | ')+' |\n';
md+='\n**Построено новых домов:** '+last.newHomesToDate+'. **Доля уже у протоптанной дороги в начале года строительства:** '+last.newHomesWithinTwoTilesOfPriorYearTrackShare+'.\n';
md+='\n## Три приоритетных вывода для следующего этапа\n\n';
for(const f of findings)md+='### '+f.id+'\n'+f.observation+'\n\n**Механизм:** '+f.mechanism+'\n\n**Действие:** '+f.response+'\n\n';
md+='## Ограничения\n\n'+report.limitations.join(' ')+'\n';
if(errors.length)md+='\n## Ошибки (fail closed)\n\n'+errors.join('\n')+'\n';
fs.writeFileSync(path.join(dest,'SUMMARY.md'),md);
console.log(md);
if(!report.complete)process.exitCode=1;
