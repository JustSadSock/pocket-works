// Reproducible, deterministic headless society audit; does not alter the simulation.
import {createWorld,advanceDays,overview,audit} from './model.js';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2);
const get=(name,fallback)=>{const v=args.find(x=>x.startsWith(`--${name}=`));return v?v.split('=')[1]:fallback;};
const out=resolve(get('output','./audit-output'));
const seeds=get('seeds','43821,413,7777,9001').split(',').map(Number);
const years=Number(get('years','100'));
const period=Number(get('period','10'));
const living=s=>s.people.filter(p=>p.alive);
const groupStats=(s)=>{
 const activeCounts=new Map(),communityMembers=new Map();
 const hhById=new Map(s.households.map(h=>[h.id,h]));
 for(const p of s.people){if(!p.alive)continue;activeCounts.set(p.houseId,(activeCounts.get(p.houseId)||0)+1);const cid=hhById.get(p.houseId)?.communityId;communityMembers.set(cid,(communityMembers.get(cid)||0)+1);}
 return s.communities.map(c=>{
 const hs=s.households.filter(h=>h.communityId===c.id);
 return {name:c.name,pop:communityMembers.get(c.id)||0,homes:hs.length,activeHomes:hs.filter(h=>activeCounts.has(h.id)).length,grainKg:Math.round(hs.reduce((v,h)=>v+h.grain,0)),woodKg:Math.round(hs.reduce((v,h)=>v+h.wood,0)),coins:Math.round(hs.reduce((v,h)=>v+h.coin,0)),prices:c.prices,marketVolume:Math.round(c.volume)};
 });
};
function deepestLineages(s){const map=new Map(s.people.map(p=>[p.id,p]));const depths=new Map();const depth=(p)=>{if(depths.has(p.id))return depths.get(p.id);const v=p.parents.length?1+Math.max(0,...p.parents.map(id=>{const q=map.get(id);return q?depth(q):0;})):0;depths.set(p.id,v);return v;};for(const p of s.people)depth(p);return [...depths.values()].reduce((a,b)=>Math.max(a,b),0);}
function state(s){const o=overview(s),P=living(s),hs=s.households.filter(h=>P.some(p=>p.houseId===h.id)),f=P.filter(p=>p.sex==='f'&&p.age>=18&&p.age<=40);const dead=s.people.filter(p=>!p.alive);
 return {...o,yearComplete:Math.floor(s.day/365),families:hs.length,everPeople:s.people.length,everHomes:s.households.length,dependentChildren:P.filter(p=>p.age<15).length,workingAge:P.filter(p=>p.age>=15&&p.age<65).length,senior:P.filter(p=>p.age>=65).length,fertileWomen:f.length,pairedFertileWomen:f.filter(p=>p.spouse&&P.some(q=>q.id===p.spouse)).length,deathStarvation:dead.filter(p=>p.lifeLog?.some(x=>x.type==='death'&&x.text.includes('истощение'))).length,workDays:{farm:s.people.reduce((v,p)=>v+(p.workDays?.farm||0),0),wood:s.people.reduce((v,p)=>v+(p.workDays?.wood||0),0),haul:s.people.reduce((v,p)=>v+(p.workDays?.haul||0),0),build:s.people.reduce((v,p)=>v+(p.workDays?.build||0),0)},tradeDelivered:s.stats.delivered,aidKg:Math.round(s.stats.aid||0),built:s.stats.built,fields:hs.reduce((v,h)=>v+h.fields.length,0),lineageDepth:deepestLineages(s),villages:groupStats(s),invariants:audit(s).issues};
}
function formatLife(s,p){return {id:p.id,name:p.name,sex:p.sex,alive:p.alive,age:+p.age.toFixed(1),homeId:p.houseId,parents:p.parents,spouse:p.spouse,skill:p.skill,workDays:p.workDays,events:p.lifeLog||[]};}
const worlds=[];const peopleRows=[["seed","id","name","sex","alive","age","homeId","parents","spouseId","workFarmDays","workWoodDays","workHaulDays","workBuildDays","farmSkill","woodSkill","birthDay","deathDay","lifeEventCount"].join(",")];let total=0;
for(const seed of seeds){const s=createWorld(seed),points=[state(s)];console.log(`WORLD ${seed}: year 0 population ${points[0].population}`);
 for(let yr=period;yr<=years;yr+=period){advanceDays(s,period*365);let p=state(s);points.push(p);if(p.invariants.length)throw Error(`seed ${seed} year ${yr}: ${p.invariants.join('; ')}`);console.log(`  ${yr}: ${p.population} people, ${p.households} households, born ${p.born}, died ${p.died}, crops ${Math.round(p.grain/1000)}t, lineage ${p.lineageDepth}`);}
 const ranked=s.people.filter(p=>p.workDays).slice().sort((a,b)=>(b.workDays.farm||0)-(a.workDays.farm||0));const bestFarmer=ranked[0];
 const bestHauler=s.people.slice().sort((a,b)=>(b.workDays?.haul||0)-(a.workDays?.haul||0))[0];
 const oldest=s.people.slice().sort((a,b)=>b.age-a.age)[0];
 const firstBorn=s.people.find(p=>p.parents.length&&p.lifeLog?.[0]?.day>0);
 const parentWithDesc=s.people.filter(p=>p.parents.length).sort((a,b)=>a.id-b.id).find(p=>s.people.some(x=>x.parents.includes(p.id)));
 const featured=[bestFarmer,bestHauler,oldest,firstBorn,parentWithDesc].filter((x,i,l)=>x&&l.findIndex(y=>y?.id===x.id)===i).map(p=>formatLife(s,p));
 for(const p of s.people){const death=(p.lifeLog||[]).find(e=>e.type==='death');const born=p.lifeLog?.[0]?.day||0;peopleRows.push([seed,p.id,p.name,p.sex,p.alive,p.age.toFixed(2),p.houseId,p.parents.join('|'),p.spouse||'',p.workDays?.farm||0,p.workDays?.wood||0,p.workDays?.haul||0,p.workDays?.build||0,p.skill.farm.toFixed(3),p.skill.wood.toFixed(3),born,death?.day??'',p.lifeLog?.length||0].join(','));}
 worlds.push({seed,years,points,featured,totalPeople:s.people.length,totalHomes:s.households.length,eventLogSize:s.events.length});total++;
}
mkdirSync(out,{recursive:true});const report={generated:'deterministic-headless-audit',version:'0.1.1',years,seeds,worlds};writeFileSync(`${out}/results.json`,JSON.stringify(report,null,2));
const rows=[['seed','year','population','families','everBorn','everDied','starvationDeaths','grainKg','woodKg','trades','deliveries','homesBuilt','workFarmDays','workWoodDays','workHaulDays','generations','aidKg','invariantIssues'].join(',')];
for(const w of worlds)for(const p of w.points)rows.push([w.seed,p.yearComplete,p.population,p.families,p.born,p.died,p.deathStarvation,p.grain,p.wood,p.trade,p.tradeDelivered,p.built,p.workDays.farm,p.workDays.wood,p.workDays.haul,p.lineageDepth,p.aidKg,p.invariants.length].join(','));writeFileSync(`${out}/timeseries.csv`,rows.join('\n'));writeFileSync(`${out}/people.csv`,peopleRows.join('\n'));
const start=worlds.map(w=>w.points[0].population),ends=worlds.map(w=>w.points.at(-1).population);const sorted=[...ends].sort((a,b)=>a-b);
let md=`# ЖИВАЯ ИСТОРИЯ · аудит ${years} лет\n\nМетод: ${worlds.length} детерминированных миров, каждые ${period} лет полный тест сохранения зерна, древесины, денег, населения, личности и родства. Это инженерная проверка, а не историческая калибровка.\n\n| Seed | Старт | ${years}-й год | Рождения | Смерти | Смерти от истощения | Торговые отправки | Построенные дома | Поколения |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n`;
for(const w of worlds){const a=w.points[0],p=w.points.at(-1);md+=`| ${w.seed} | ${a.population} | ${p.population} | ${p.born} | ${p.died} | ${p.deathStarvation} | ${p.trade} | ${p.built} | ${p.lineageDepth+1} |\n`;}md+=`\nРезультат: диапазон конечной численности ${sorted[0]}–${sorted.at(-1)}; медиана ${sorted[Math.floor(sorted.length/2)]}. В каждом контрольном срезе нарушений материального баланса: 0.\n`;
for(const w of worlds){md+=`\n## Мир ${w.seed}: поселения\n\n`;
 const last=w.points.at(-1);for(const c of last.villages)md+=`- **${c.name}:** ${c.pop} жителей, ${c.activeHomes} заселённых домов, ${c.grainKg} кг зерна, сделок на рынке на ${c.marketVolume} кг.\n`;
 md+=`\n### Отдельные жизни\n`;
 for(const p of w.featured){md+=`\n**${p.name} (#${p.id})**, ${p.alive?'жив':'умер'}, ${p.age} лет; работа: ${p.workDays?.farm||0} дней поле, ${p.workDays?.wood||0} лес, ${p.workDays?.haul||0} перевозки; родители ${p.parents.join(',')||'неизвестны'}.\n`;for(const e of p.events.slice(-6))md+=`- Год ${Math.floor(e.day/365)+1}: ${e.text}\n`;
 }
}
md+=`\n## Ограничения текущей модели\nСлучайная смертность, браки, производство и спрос условные, а не выверенные по средневековой статистике. Реализована ограниченная номенклатура товаров (зерно и дерево), нет полноценной аренды земли, животных, налогов, военных конфликтов и болезней. Сложное экономическое равновесие и рост континента ещё не доказаны.\n`;
writeFileSync(`${out}/REPORT.md`,md);console.log(`COMPLETE ${total} worlds => ${out}/REPORT.md`);