#!/usr/bin/env node
// Fail-closed end-to-end geographical report. No threshold treats neat
// villages, wealth or demographic targets as proof of historical accuracy.
import fs from 'node:fs';
import path from 'node:path';
const seeds=[413,7777,43821,9001,10061,202,29,101,505,12345,71331,51291,11,21773,303,404,606,7331,10009,9007,31415,27182,5150,8888];
const a=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')).map(x=>{const i=x.indexOf('=');return [x.slice(2,i),x.slice(i+1)];}));
const root=path.resolve(a.input||'raw'),dest=path.resolve(a.output||'summary');
fs.mkdirSync(dest,{recursive:true});
const reports=[],errors=[];
for(const seed of seeds){
 const shard=Math.floor(seeds.indexOf(seed)/2);
 const base=path.join(root,'spatial-shard-'+shard,String(seed));
 const file=path.join(base,'metrics.json');
 const map=path.join(base,'maps.svg');
 if(!fs.existsSync(file)||!fs.existsSync(map)){errors.push('Missing seed '+seed);continue;}
 const r=JSON.parse(fs.readFileSync(file,'utf8'));
 if(r.seed!==seed||r.years!==50||r.snapshots.map(x=>x.year).join(',')!=='1,5,20,50'||r.auditPassedYears.length!==50)errors.push('Incomplete seed '+seed);
 if(r.snapshots.some(x=>x.communities.length!==4||x.road.worn<0||x.road.main<0||x.communities.some(c=>c.roadFrontageShare<0||c.roadFrontageShare>1)))errors.push('Invalid geometry '+seed);
 reports.push(r);
}
const med=values=>{const a=values.filter(x=>Number.isFinite(x)).sort((a,b)=>a-b),n=a.length;return n?n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2:null;};
const yearStats=[1,5,20,50].map(year=>{
 const s=reports.map(r=>r.snapshots.find(x=>x.year===year)).filter(Boolean);
 const cs=s.flatMap(x=>x.communities);
 return {year,worlds:s.length,communitySnapshots:cs.length,
  medianPopulation:med(s.map(x=>x.population)),
  medianHouseholds:med(s.map(x=>x.inhabitedHomes)),
  medianWornRoadCells:med(s.map(x=>x.road.worn)),
  medianMainRoadCells:med(s.map(x=>x.road.main)),
  medianRoadFrontageShare:med(cs.map(x=>x.roadFrontageShare)),
  medianVillageRadiusTiles:med(cs.map(x=>x.radiusTilesMedian)),
  medianNearestNeighbourTiles:med(cs.map(x=>x.neighbourTilesMedian)),
  medianWalkingDistanceToFieldsTiles:med(cs.map(x=>x.fieldsWalkTilesMedian)),
  medianActualEffortToFields:med(cs.map(x=>x.fieldsActualEffortMedian)),
  isolatedHomes:cs.reduce((n,c)=>n+c.isolatedHouses,0),
  totalsCroftTiles:cs.reduce((n,c)=>n+c.croftTiles,0)};
});
const report={schema:1,complete:reports.length===24&&errors.length===0,seeds:reports.length,simulatedYears:reports.length*50,
 years:yearStats,errors,limitations:[
 'This is a model-internal morphology comparison, not independent medieval archaeological validation.',
 'Initial positions of four community nodes are scenario assumptions; only building placements and routes self-organize.',
 'Road coverage depends on actual trips, site proximity and decay; no symmetrical street plan is imposed.',
 'A year-50 population collapse is not automatically a geography bug; inspect household autopsies and balance sheets.',
 'Road improvements shorten effort but not physical distance; no free food or transport has been added.']};
fs.writeFileSync(path.join(dest,'summary.json'),JSON.stringify(report,null,2));
let md='# «Живая история» — 24 пространства × 50 лет\n\n';
md+='**Завершено:** '+report.seeds+'/24 независимых seed; '+report.simulatedYears+'/1200 лет с годовыми проверками материальных балансов.\n\n';
md+='| Год | Медиана населения | Медиана домов | Протоптанных клеток | Клеток основных дорог | Доля домов у дороги | Радиус деревни (клетки) | Пешком до пашни (клетки) |\n|---:|---:|---:|---:|---:|---:|---:|---:|\n';
for(const r of yearStats)md+=`| ${r.year} | ${r.medianPopulation} | ${r.medianHouseholds} | ${r.medianWornRoadCells} | ${r.medianMainRoadCells} | ${r.medianRoadFrontageShare} | ${r.medianVillageRadiusTiles} | ${r.medianWalkingDistanceToFieldsTiles} |\n`;
md+='\n**Ограничения:** '+report.limitations.join(' ')+'\n';
if(errors.length)md+='\n**Ошибки (fail closed):** '+errors.join(', ')+'\n';
fs.writeFileSync(path.join(dest,'SUMMARY.md'),md);
console.log(md);
if(!report.complete)process.exitCode=1;
