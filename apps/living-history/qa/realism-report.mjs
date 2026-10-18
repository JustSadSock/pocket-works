// Human-readable research report: do not treat a green material audit as
// historical validation. All denominators and sample sizes remain visible.
import {REFERENCE_POINTS,REFERENCES} from '../historical-calibration.js';

const printable=v=>v===null||v===undefined?'н/д':Number.isFinite(v)?String(Math.round(v*100)/100):String(v);
const percentile=d=>d?.n?printable(d.median)+' ['+printable(d.p10)+'–'+printable(d.p90)+']':'недостаточно данных';
export function renderRealismReport(report){
 const {summary,runs}=report;
 const lines=[
  '# «ЖИВАЯ ИСТОРИЯ» — количественный отчёт',
  '',
  '**Вердикт: историческая достоверность не подтверждена.** Проверка физической бухгалтерии не доказывает совпадение с жизнью Англии XIII века.',
  '',
  'Источники: '+Object.values(REFERENCES).map(x=>'['+x.label+']('+x.uri+')').join(' · '),
  '',
  'Дата отчёта: '+(report.generatedAt||'не указана')+'. Коммит: '+(report.sourceCommit||'не указан')+'.',
  '',
  'Метод: '+runs.length+' независимых сценарных прогонов (независимость означает разные seed; парные погодные сценарии одного seed независимыми не считаются).',
  '',
  '| Сценарий / лет | Миры | Население, медиана [P10–P90] | Семья | Первый брак: женщины / мужчины | Земельные конфликты за весь период |',
  '|---|---:|---:|---:|---:|---:|'
 ];
 for(const g of summary.groups){
  lines.push('| '+g.scenario+'/'+g.years+' | '+g.sampleWorlds+' | '+percentile(g.finalPopulation)+' | '+
   percentile(g.householdSize)+' | '+percentile(g.firstMarriageWomen)+' / '+percentile(g.firstMarriageMen)+
   ' | '+percentile(g.localConflicts)+' |');
 }
 lines.push('','## Доступность пищи и смертность','',
  'Число семей с недостаточным суточным рационом измеряется на уровне конкретного хозяйства. Общие запасы зерна **не** означают, что бедная семья может купить или получить пищу.',
  '',
  '| Сценарий / лет | Хозяйства с неполным рационом, P50 [P10–P90] | Зерно на человека, кг | Смертей на 1000 человеко-лет¹ |',
  '|---|---:|---:|---:|');
 for(const g of summary.groups)lines.push('| '+g.scenario+'/'+g.years+' | '+percentile(g.lowRationHomes)+
  ' | '+percentile(g.grainPerPersonKg)+' | '+percentile(g.deathsPer1000PersonYears)+' |');
 lines.push('','¹ Приближённый грубый коэффициент: смерти за год / среднее количество живых на начало и конец года. Это не восстановленная историческая таблица смертности.',
  '','## Исторические ориентиры (не нормативы модели)','',
  '| Показатель | Внешний ориентир | Измеренный результат по последним годам | Интерпретация |',
  '|---|---:|---:|---|');
 for(const [metric,b] of Object.entries(REFERENCE_POINTS)){
  const source=summary.groups.map(g=>({name:g.scenario+'/'+g.years,
   value:g[metric==='femaleFirstMarriage'?'firstMarriageWomen':
    metric==='maleFirstMarriage'?'firstMarriageMen':
    metric==='householdSize'?'householdSize':'tenureShare']}));
  const vals=runs.map(r=>r.annual.at(-1).historicalComparison.find(x=>x.metric===metric)).filter(Boolean);
  const valid=vals.filter(x=>x.interpretation==='illustrative-comparison');
  const avg=valid.length?valid.reduce((n,x)=>n+x.observed,0)/valid.length:null;
  lines.push('| '+metric+' | '+b.value+' '+b.unit+' | '+printable(avg)+
   ' ('+valid.length+'/'+vals.length+' сравнимых наблюдений) | '+(valid.length?'Иллюстративное различие, не валидация':'Недостаточная выборка')+' |');
 }
 lines.push('','**Выборка держаний:** доля крупных владений относится к зафиксированному основательному срезу модели, а не к случайной выборке всех средневековых семей. Четыре общины нельзя считать всей Англией.',
  '','## Контрфактические сопоставления','');
 if(!summary.pairedCounterfactuals.length)lines.push('Нет полностью парных normal/drought прогонов одинакового seed и горизонта. Сравнение по чужим seed было бы некорректно.');
 else{
  lines.push('| Seed | Лет | Разница урожая (засуха − норма), кг | Разница населения | Разница смертей от голода |','|---:|---:|---:|---:|---:|');
  for(const p of summary.pairedCounterfactuals)lines.push('| '+p.seed+' | '+p.years+' | '+p.harvestKgDelta+' | '+p.populationDelta+' | '+p.starvationDeathsDelta+' |');
 }
 lines.push('','## Сигналы, требующие исследования','');
 if(!summary.reviewFlags?.length)lines.push('По заранее объявленным эвристикам тревожных отклонений не выявлено. Это **не** удостоверяет историческую точность.');
 else{
  lines.push('| Мир / сценарий | Год | Повод для исследования | Наблюдение | Ориентир |',
   '|---|---:|---|---:|---:|');
  for(const f of summary.reviewFlags)lines.push('| '+f.seed+'/'+f.scenario+' | '+f.year+' | '+f.code+
   ' | '+printable(f.value)+' | '+printable(f.reference)+' |');
 }
 lines.push('','**Пороги сигналов — инженерные эвристики для расследования, а не подтверждённые исторические границы нормы.**');
 lines.push('','## Проверка механики vs историческая реалистичность','',
  '- **Программные инварианты:** каждый завершённый прогон прошёл ежегодный материальный аудит; сбой инварианта аварийно останавливает исследование.',
  '- **Причинные связи:** доступны парные сценарии при одном seed; разницу нельзя толковать как статистическую значимость без неопределённости и дополнительных источников.',
  '- **Историческая достоверность:** не засчитана автоматически. Для боевых коэффициентов и частот земельных стычек независимых датированных данных пока нет.',
  '- **Неизвестные показатели:** точная младенческая смертность по когортам, доля безбрачных по когортам и распределение типов ранений требуют дополнительных данных.',
  '',
  '## Ограничения выборки','',...summary.warnings.map(x=>'- '+x),'',
  '**Исследовательское решение:** предъявлять численные отклонения и несоответствия, но не менять механику до заранее записанного независимого критерия проверки.',
  '');
 return lines.join('\n');
}
