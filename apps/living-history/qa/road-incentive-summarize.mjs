// Read-only fail-closed analysis of the 24 paired, three-arm road experiments.
// Geographic or demographic outcomes have NO success targets.
import {median} from './spatial-metrics.mjs';
import {ROAD_ARMS,delta} from './road-incentive-study.mjs';

export const CHECKPOINTS=Object.freeze([1,5,20,50]);
const metrics=['population','homes','built','starvationDeaths','totalEdibleKg',
 'grainHarvestKg','trades','landlessHomes','foodDaysMedian','familiesUnder30Days',
 'medianCommuteEffort','medianNeighbourDistanceTiles','wornRoadTiles',
 'coreRoadWithinTwoTilesShare','medianCoreDistanceTiles'];
const round=n=>Math.round(n*1000)/1000;
const range=a=>{const values=a.filter(Number.isFinite).sort((x,y)=>x-y);
 return {minimum:values.length?values[0]:null,median:median(values),maximum:values.length?values.at(-1):null};};

export function verifyRoadExperiment(spatial,trial){
 const errors=[];
 if(trial?.schema!==1||trial?.seed!==spatial.seed||trial?.years!==50
  ||trial?.initialEqualAcrossArms!==true||trial?.arms?.length!==3)
  errors.push('Incorrect study identity or arm count');
 if(errors.length)return errors;
 for(const {name,weight} of ROAD_ARMS){
  const arm=trial.arms.find(a=>a.name===name);
  if(!arm||arm.weight!==weight||arm.yearsAudited!==50
   ||arm.auditedYears?.join(',')!==Array.from({length:50},(_,i)=>i+1).join(',')
   ||arm.snapshots?.map(s=>s.year).join(',')!==CHECKPOINTS.join(',')){
   errors.push('Missing 50-year audit or snapshots in '+name);continue;
  }
  for(const snap of arm.snapshots){
   for(const k of metrics){
    if(snap[k]!==null&&!Number.isFinite(snap[k])){errors.push(name+' invalid '+k);break;}
   }
   if(snap.population<0||snap.homes<0||snap.built<0
    ||snap.coreRoadWithinTwoTilesShare!==null&&
    (snap.coreRoadWithinTwoTilesShare<0||snap.coreRoadWithinTwoTilesShare>1))
    errors.push(name+' impossible morphology');
  }
 }
 const baseline=trial.arms.find(a=>a.name==='baseline');
 if(baseline?.snapshots.length===4)
  for(let i=0;i<4;i++){
   const ours=baseline.snapshots[i],s=spatial.snapshots[i];
   if(ours.population!==s.population||ours.homes!==s.inhabitedHomes
    ||ours.wornRoadTiles!==s.road.worn||ours.mainRoadTiles!==s.road.main
    ||Math.abs(ours.grainKg-s.grainKg)>.001)
    errors.push('Baseline not identical to v0.7.6 history, year '+ours.year);
  }
 for(const alt of ROAD_ARMS.filter(v=>v.name!=='baseline')){
  const paired=trial.paired?.find(p=>p.arm===alt.name&&p.weight===alt.weight);
  const target=trial.arms.find(a=>a.name===alt.name);
  if(!paired||paired.checkpoints?.map(x=>x.year).join(',')!==CHECKPOINTS.join(',')){
   errors.push('Missing counterfactual '+alt.name);continue;
  }
  if(baseline?.snapshots?.length!==4||target?.snapshots?.length!==4)continue;
  for(let i=0;i<4;i++){
   const expected=delta(baseline.snapshots[i],target.snapshots[i]);
   if(JSON.stringify(expected)!==JSON.stringify(paired.checkpoints[i].changes))
    errors.push('Paired delta mismatch '+alt.name+' year '+CHECKPOINTS[i]);
  }
 }
 return errors;
}
export function summarizeRoadExperiments(records){
 const errors=[],expected=24;
 if(records.length!==expected)errors.push('Requires all 24 independent seed pairs');
 const perYear=CHECKPOINTS.map((year,index)=>{
  const studies=records.filter(r=>r?.arms?.length===3);
  const baseline=studies.map(r=>r.arms.find(a=>a.name==='baseline')?.snapshots[index]).filter(Boolean);
  const alternatives=ROAD_ARMS.filter(v=>v.name!=='baseline').map(arm=>{
   const rows=studies.map(r=>r.paired?.find(p=>p.arm===arm.name)?.checkpoints[index]?.changes).filter(Boolean);
   const columns=Object.fromEntries(metrics.map(key=>{
    const values=rows.map(d=>d[key]).filter(Number.isFinite);
    return [key,{...range(values),positive:values.filter(v=>v>0).length,
      negative:values.filter(v=>v<0).length,unchanged:values.filter(v=>v===0).length,count:values.length}];
   }));
   return {arm:arm.name,weight:arm.weight,pairs:rows.length,changes:columns};
  });
  return {year,pairs:studies.length,baseline:{
    populationMedian:median(baseline.map(x=>x.population)),
    builtMedian:median(baseline.map(x=>x.built)),
    medianCoreRoadShare:median(baseline.map(x=>x.coreRoadWithinTwoTilesShare))
   },alternatives};
 });
 const complete=errors.length===0&&records.every(r=>r?.arms?.every(a=>a.yearsAudited===50));
 const result={schema:1,complete,seeds:records.length,arms:ROAD_ARMS.map(a=>a.name),
  totalSimulatedYears:records.length*3*50,checkpoints:perYear,errors,
  limitations:[
   'Paired random seeds and identical first states identify sensitivity of this programmed incentive, not medieval historical validity.',
   'After treatment household IDs, births and economies may diverge, so paired world results cannot attribute each later death to a particular road.',
   'Baseline reproduction must match the independent original 50-year spatial audit for each seed.',
   'Road pathfinding remains in all three arms; only the attractiveness of roads for new housing is manipulated.',
   'Four village anchors are scripted by the 1280 scenario. This study does not test settlement founding.',
   'No preference for linear streets, positive population growth or a particular road share is encoded in a passing criterion.'
  ]};
 return result;
}
export function roadMarkdown(report){
 const metric=(arm,key)=>arm.changes[key];
 let md='# ЖИВАЯ ИСТОРИЯ v0.7.7 — парные дороги × 50 лет\n\n';
 md+='Статус: **'+(report.complete?'все 24 seed и 3600 миро-лет проверены':'НЕПОЛНО, НЕ ИНТЕРПРЕТИРОВАТЬ')+'**. Один фактор выбора участка: коэффициент дорожного сигнала 0× / 1× / 2×, одинаковое исходное состояние. Годовой материальный аудит обязателен.\n\n';
 md+='| Год | Вариант | Пар | Δ населения, медиана | Δ новых домов, медиана | Δ расстояния до соседей, клетки | Δ доли у ядра дорог | Δ медианной стоимости пути к полю | Положительный/отрицательный/нулевой эффект на население |\n';
 md+='|---:|---|---:|---:|---:|---:|---:|---:|---|\n';
 for(const row of report.checkpoints)for(const alt of row.alternatives){
  const d=k=>{const v=metric(alt,k).median;return v===null?'—':round(v);};
  const p=metric(alt,'population');
  md+='| '+row.year+' | '+alt.arm+' | '+alt.pairs+' | '+d('population')+' | '+d('built')+' | '+d('medianNeighbourDistanceTiles')+' | '+d('coreRoadWithinTwoTilesShare')+' | '+d('medianCommuteEffort')+' | '+p.positive+'/'+p.negative+'/'+p.unchanged+' |\n';
 }
 md+='\n**Проверяемые ограничения:** '+report.limitations.join(' ')+'\n';
 if(report.errors.length)md+='\n**Ошибки:** '+report.errors.join('; ')+'\n';
 return md;
}
