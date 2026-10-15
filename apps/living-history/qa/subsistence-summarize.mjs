#!/usr/bin/env node
// Independent fail-closed aggregate; outcomes are descriptive, not pass/fail
// targets. Missing scenarios or inconsistent baseline chronology fail the run.
import fs from 'node:fs';
import path from 'node:path';
const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')).map(x=>{
 const p=x.indexOf('=');return [x.slice(2,p),x.slice(p+1)];
}));
const input=path.resolve(args.input||'raw'),output=path.resolve(args.output||'summary');
const FORENSICS=[10061,43821,413,202,7777,51291,10009,9001];
const CONTROLS=[...FORENSICS,29,101,505,71331];
const data={schemaVersion:1,complete:false,errors:[],forensic:{},controls:{},interpretation:[
 'No mechanical relief, population floor or changed production code exists in the baseline.',
 'Threshold variants were loaded from guarded copies of model.js; baseline uses production engine.',
 'Source-patched interventions probe labour-gate sensitivity, not historically valid curves.',
 'Cause indicators are overlapping and sometimes contextual, never exhaustive medical causes.',
 'Aid potential only bounds possible offers; it does not prove a viable donor or carrier.',
]};
function read(group,seed){
 const file=path.join(input,`subsistence-${group}-${seed}`,'report.json');
 if(!fs.existsSync(file)){data.errors.push(`Missing ${group} ${seed}`);return null;}
 const item=JSON.parse(fs.readFileSync(file,'utf8'));
 if(item.seed!==seed||item.mode!==(group==='forensic'?'forensic':'curve')){
  data.errors.push(`Mismatched ${group} ${seed}`);return null;
 }
 return item;
}
const studies=[];
for(const seed of FORENSICS){
 const v=read('forensic',seed);if(!v)continue;
 if(v.deathSummary.total!==v.deathRecords.length)
  data.errors.push(`Incomplete death count ${seed}`);
 if(v.annual.some((x,i)=>i>0&&x.starved<v.annual[i-1].starved))
  data.errors.push(`Death counter went backwards ${seed}`);
 studies.push(v);
}
const med=a=>{if(!a.length)return null;const x=[...a].sort((a,b)=>a-b),m=Math.floor(x.length/2);
 return x.length%2?x[m]:(x[m-1]+x[m])/2;};
const totals=key=>studies.reduce((n,x)=>n+(x.deathSummary[key]||0),0);
data.forensic={
 seedCount:studies.length,totalDeathCases:totals('total'),
 noWorkersLong:totals('noAvailableWorkerLong'),noAdultsLong:totals('noAdultsLong'),
 adultsPresentButUnfitLong:totals('adultsPresentButUnfitLong'),
 withFoodDebtLong:totals('shortageWithDebtLong'),
 noFullRationLong:totals('noFullRationLong'),
 aidPotential:totals('hadPotentialAid'),affordableGrain:totals('couldAffordGrain'),
 grainInTransit:totals('hadGrainInTransit'),
 perSeed:studies.map(x=>({seed:x.seed,population:x.final.population,starvationDeaths:x.deathSummary.total,
  ...x.deathSummary})),
};
const matched=new Map(studies.map(x=>[x.seed,x]));
const comparisons=[];
for(const seed of CONTROLS){
 const v=read('curve',seed);if(!v)continue;
 if(v.variants?.map(x=>x.label).join(',')!=='base,gentle60,strict90')
  data.errors.push(`Incorrect control arms ${seed}`);
 if(v.variants?.some(x=>!x.audit?.passed))
  data.errors.push(`Counterfactual audit failed ${seed}`);
 const reference=matched.get(seed)?.annual.find(x=>x.year===25);
 const baseline=v.variants.find(x=>x.label==='base')?.final;
 if(reference&&(baseline?.population!==reference.population||baseline?.starved!==reference.starved))
  data.errors.push(`Seed chronology disagreement ${seed}: forensic ${reference.population}/${reference.starved} vs base ${baseline?.population}/${baseline?.starved}`);
 comparisons.push({seed,base:baseline,gentle60:v.variants.find(x=>x.label==='gentle60'),
  strict90:v.variants.find(x=>x.label==='strict90')});
}
const armStats=label=>{
 const a=comparisons.map(x=>x[label]);
 const populations=a.map(x=>x.deltaPopulation),deaths=a.map(x=>x.deltaStarved);
 return {worlds:a.length,medianPopulationDelta:med(populations),minPopulationDelta:Math.min(...populations),
  maxPopulationDelta:Math.max(...populations),medianStarvationDelta:med(deaths),
  fewerStarvations:deaths.filter(x=>x<0).length,sameStarvations:deaths.filter(x=>x===0).length,
  moreStarvations:deaths.filter(x=>x>0).length,
  positivePopulation:populations.filter(x=>x>0).length,negativePopulation:populations.filter(x=>x<0).length,
  samples:comparisons.map(x=>({seed:x.seed,baselinePopulation:x.base.population,
   baselineDeaths:x.base.starved,deltaPopulation:x[label].deltaPopulation,
   deltaStarved:x[label].deltaStarved,
   firstAnnualDivergence:x[label].firstAnnualPopulationDifference}))};
};
data.controls={
 seedCount:comparisons.length,
 gentle60:armStats('gentle60'),
 strict90:armStats('strict90'),
 baselineMatchesForensic:FORENSICS.filter(seed=>matched.has(seed)&&comparisons.some(c=>c.seed===seed)).length,
};
if(studies.length!==FORENSICS.length||comparisons.length!==CONTROLS.length)
 data.errors.push('Incomplete experiment matrix');
data.complete=data.errors.length===0;
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(data,null,2));
let md='# Живая история — расследование голодной ловушки\n\n';
md+=`**Статус:** ${data.complete?'все контрольные проверки выполнены':'неполный или ошибочный прогон'}. Источники: ${studies.length}/8 детальных миров, ${comparisons.length}/12 seed × 3 варианта.\n\n`;
md+='## Верифицированные признаки в 8 мирах\n\n';
md+=`Голодных смертей: **${data.forensic.totalDeathCases}**. Не было доступных работников минимум 14 дней из 30: ${data.forensic.noWorkersLong}; взрослые присутствовали, но были недостаточно здоровы: ${data.forensic.adultsPresentButUnfitLong}; взрослых не было: ${data.forensic.noAdultsLong}; продолжительный долг и нехватка пищи: ${data.forensic.withFoodDebtLong}.\n\n`;
md+=`Возможная соседская помощь (только диагностический потенциал): ${data.forensic.aidPotential}; потенциальная платёжеспособность (≥7 кг): ${data.forensic.affordableGrain}. Эти показатели не являются доказательством действительной доступности еды.\n\n`;
md+='## Контролируемая чувствительность порога работоспособности (25 лет)\n\n';
md+='| Вмешательство | Медианная Δ населения | Медианная Δ смертей от голода | Миров с меньшей смертностью / 12 |\n|---|---:|---:|---:|\n';
for(const [key,label] of [['gentle60','Полный трудовой день при health≥60'],['strict90','Полный трудовой день при health≥90']]){
 const r=data.controls[key];md+=`| ${label} | ${r.medianPopulationDelta??'—'} | ${r.medianStarvationDelta??'—'} | ${r.fewerStarvations} |\n`;
}
md+='\nКонтроль совпадения 25-го года с независимо запущенным 30-летним миром: '+data.controls.baselineMatchesForensic+'/8.\n\n';
md+='## Данные по seed\n\n';
md+='| Seed | Базовое население | Порог gentle60: Δ населения / голодных смертей | Порог strict90: Δ населения / голодных смертей |\n|---|---:|---:|---:|\n';
for(const row of comparisons)md+=`| ${row.seed} | ${row.base.population} | ${row.gentle60.deltaPopulation} / ${row.gentle60.deltaStarved} | ${row.strict90.deltaPopulation} / ${row.strict90.deltaStarved} |\n`;
if(data.errors.length)md+='\nОшибки: '+data.errors.join('; ')+'\n';
md+='\n**Методологическое ограничение:** тестирование другого порога не устанавливает исторически верного значения. Гибель животных и иных ресурсов не компенсируется; перенос ресурсов между семьями должен оставаться физическим. Обнаруженная зависимость требует исследования конкретных решений, а не автоматического изменения базового параметра.\n';
fs.writeFileSync(path.join(output,'SUMMARY.md'),md);
console.log(md);
if(!data.complete)process.exitCode=1;
