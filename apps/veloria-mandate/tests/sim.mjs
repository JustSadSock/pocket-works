import assert from 'node:assert/strict';
import {createGame,availableDecrees,enactDecree,advanceTurn,resolveEvent,needsDispatch,submitDispatch,stateSummary} from '../sim-core.mjs';

function choose(s,mode){
  const ds=availableDecrees(s);
  const prefs={
    economy:['export_quota','harbor_bonds','tax_relief','land_survey','customs_purge','sanitation'],
    reform:['wage_code','local_compact','press_charter','sanitation','customs_purge','autonomy_council'],
    iron:['emergency_patrols','imperial_levy','land_survey','customs_purge','grain_release'],
    balanced:['sanitation','customs_purge','grain_release','harbor_bonds','local_compact','wage_code','press_charter'],
    reckless:['export_quota','land_survey','emergency_patrols','harbor_bonds','tax_relief','imperial_levy']
  }[mode];
  for(const id of prefs){const d=ds.find(x=>x.id===id);if(d&&s.authority>=d.cost)return id}
  return ds.find(d=>s.authority>=d.cost)?.id;
}
function eventChoice(s,mode){if(!s.event)return;const t=s.event.title;if(mode==='reform')return t.includes('Хлеб')?0:t.includes('свист')?0:t.includes('Карта')?0:t.includes('лихорад')?1:0;if(mode==='iron'||mode==='reckless')return Math.min(2,s.event.choices.length-1);if(mode==='economy')return t.includes('аудитор')?1:t.includes('пролив')?1:1;return 0}
function run(seed,mode,preset='standard'){
  const s=createGame(seed,preset);
  let guard=0;
  while(!s.ending&&guard++<120){
    if(s.event){resolveEvent(s,eventChoice(s,mode));continue}
    if(needsDispatch(s)){submitDispatch(s,(mode==='economy'||mode==='reckless')?'polish':mode==='reform'?'alarm':'truth');continue}
    const id=choose(s,mode); if(id)enactDecree(s,id);
    const r=advanceTurn(s); if(!r.ok) throw new Error(r.reason);
  }
  assert.ok(s.ending,'campaign must end');
  assert.ok(Number.isFinite(s.score));
  assert.ok(s.history.length>12);
  return stateSummary(s);
}
const results=[];
for(const mode of ['economy','reform','iron','balanced','reckless']){
  for(let i=0;i<6;i++)results.push({mode,seed:`QA-${mode}-${i}`,...run(`QA-${mode}-${i}`,mode,i===5?'collapse':'standard')});
}
const wins=results.filter(x=>x.ending&&!['Отозванный мандат','Ночь трёх флагов','Банкротство колонии'].includes(x.ending)).length;
const unique=new Set(results.map(x=>x.ending));
assert.ok(unique.size>=3,`need varied endings, got ${[...unique]}`);
assert.ok(wins>2,'game should be winnable');
assert.ok(wins<results.length,'game should be losable');
console.table(results);
console.log('endings',Object.fromEntries([...unique].map(e=>[e,results.filter(x=>x.ending===e).length])));
