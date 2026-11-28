import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {diplomacySandbox,step,serialize,restore,simulationHash,materialTotals} from './world.mjs';
const out=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/balance';mkdirSync(out,{recursive:true});
const strong={gold:720,regiments:5,population:2600,stockScale:2,risk:.85,expansion:.92,military:.5,loyalty:.35},weak={gold:115,regiments:1,population:700,stockScale:1,risk:.25,expansion:.25,loyalty:.9,military:.24},merchant={gold:550,regiments:1,population:2000,stockScale:3,commerce:.95,risk:.2,expansion:.2,military:.12};
const hostility=(n,target=0)=>Array.from({length:n},(_,i)=>i).filter(i=>i!==target).map(a=>({a,b:target,aggression:2}));
const treaty=(a,b,clauses,duration=1440)=>({a,b,clauses,duration}),clause=(kind,from,to,extra={})=>({kind,from,to,...extra});
const ambitions=(target=1)=>[{f:0,target,kind:'subjugation',weight:.9,duration:1800}];
const scenarios=[
 {name:'regional-growth',seed:'balance-50-3',states:5,sides:[strong,weak,weak,{...weak,gold:240},weak],perceptions:hostility(5),interests:ambitions()},
 {name:'regional-overseas',seed:'balance-20-4',states:4,geography:'world',sides:[strong,weak,weak,merchant],perceptions:hostility(4),interests:ambitions()},
 {name:'small-states-resistance',seed:'balance-20-2',states:4,sides:[strong,weak,weak,weak],perceptions:hostility(4),interests:ambitions()},
 {name:'small-states-patron',seed:'balance-20-3',states:4,sides:[strong,weak,{...strong,risk:.4,expansion:.2,loyalty:.9},weak],perceptions:hostility(4),interests:ambitions()},
 {name:'commercial-hegemony',seed:'balance-1080',states:3,sides:[merchant,weak,weak],agreements:[treaty(0,1,[clause('trade',0,1)]),treaty(0,2,[clause('trade',0,2)])],interests:[{f:1,target:0,kind:'trade',weight:.8,duration:1800}]},
 {name:'competing-trade-partners',seed:'balance-50-3',states:4,sides:[merchant,weak,{...merchant,gold:400},weak],agreements:[treaty(0,1,[clause('trade',0,1)]),treaty(1,2,[clause('trade',1,2)])]},
 {name:'coercive-subjugation',seed:'balance-20-2',states:3,sides:[{...strong,regiments:4},weak,weak],perceptions:[...hostility(3),{a:0,b:1,aggression:2}],interests:ambitions()},
 {name:'independence',seed:'balance-20-2',states:3,sides:[{...weak,gold:100},strong,{...merchant,loyalty:.9}],agreements:[treaty(0,1,[clause('protectorate',1,0,{amount:4}),clause('guarantee',0,1)],0)],perceptions:[{a:1,b:0,aggression:3},{a:2,b:1,cooperation:3}],interests:[{f:1,target:0,kind:'independence',weight:.95,duration:1800}]},
 {name:'two-great-powers',seed:'balance-50-3',states:5,sides:[strong,weak,{...strong,loyalty:.85},weak,weak],perceptions:[...hostility(5),{a:0,b:2,aggression:3},{a:2,b:0,aggression:3}],interests:[...ambitions(),{f:2,target:0,kind:'security',weight:.9,duration:1800}]},
 {name:'coalition-against-expansion',seed:'balance-20-2',states:3,sides:[strong,{...weak,regiments:2},{...strong,regiments:2,expansion:.25,loyalty:.95}],perceptions:[...hostility(3),{a:0,b:1,aggression:2}],agreements:[treaty(1,2,[clause('defense',1,2,{against:0}),clause('access',1,2),clause('access',2,1)],1800)],interests:ambitions()}
];
const shard=Number(process.argv[2]||0),results=[];
for(const scenario of scenarios.slice(shard*2,shard*2+2)){
 const config={geography:'compact',population:1600,stockScale:4,cityLimit:3,sea:true,...scenario};let s=diplomacySandbox(config);const start=materialTotals(s),initialPower=s.politics.power.map(q=>q.total),samples=[],t=performance.now();
 // No declarations, forced alliance acceptance or forced peace after the world begins.
 for(let i=0;i<1800;i++){step(s);if(s.day%360===0)samples.push({day:s.day,power:s.politics.power.map(q=>q.total),stats:{...s.politics.stats},postures:s.politics.plans.map(q=>q.securityChoice),dependencies:s.politics.contracts.filter(t=>t.status==='active'&&t.dependency).map(t=>t.dependency)});}
 const end=materialTotals(s);assert.ok(end.goods.every((q,k)=>Math.abs(q-start.goods[k]-s.ledger.source[k]+s.ledger.sink[k])<1e-6));assert.ok(Math.abs(end.money-start.money-s.ledger.moneySource+s.ledger.moneySink)<1e-6);assert.equal(simulationHash(s),simulationHash(restore(serialize(s))));
 const p=s.politics,report={name:scenario.name,seed:scenario.seed,days:s.day,ms:Math.round(performance.now()-t),initialPower,finalPower:p.power.map(q=>q.total),stats:p.stats,contractEnds:p.contractEnds,postures:p.plans.map(q=>q.securityChoice?.kind),dependencies:p.contracts.filter(t=>t.status==='active'&&t.dependency).map(t=>t.dependency),wars:s.wars.map(w=>({f:w.f,enemy:w.enemy,start:w.start,end:w.end,reason:w.reason,terms:w.terms,conflict:w.conflict,outcome:w.outcome})),decisions:p.decisions||[],samples};results.push(report);console.log(JSON.stringify({...report,decisions:undefined,samples:undefined}));
}
writeFileSync(join(out,'balance-targeted-'+shard+'.json'),JSON.stringify(results,null,2));
