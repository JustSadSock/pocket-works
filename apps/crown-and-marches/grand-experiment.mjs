import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {grandCampaign,step,materialTotals,serialize,restore,simulationHash,WORLD_SIZES} from './world.mjs';
const cases=[
 {seed:'grand-century-continent',worldSize:'standard',states:6,mapShape:'continents',years:100},
 {seed:'grand-three-centuries-straits',worldSize:'standard',states:4,mapShape:'straits',years:300},
 {seed:'grand-five-centuries-islands',worldSize:'standard',states:3,mapShape:'archipelago',years:500},
 {seed:'grand-century-large',worldSize:'large',states:8,mapShape:'continent',years:100},
 {seed:'grand-century-huge',worldSize:'huge',states:12,mapShape:'inland-sea',years:100}
];
const cfg=cases[Number(process.argv[2]||0)];assert.ok(cfg,'Unknown experiment');
const output=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/grand-experiments';mkdirSync(output,{recursive:true});
let revision=process.env.GITHUB_SHA||'unknown';try{revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()}catch{}
const s=grandCampaign(cfg);s.autonomous=true;
const initial=materialTotals(s),samples=[],timings=[];let peak=0;const started=performance.now(),report={revision,cfg,samples};
const target=join(output,cfg.seed+'.json');
for(let day=1;day<=cfg.years*360;day++){
 const t=performance.now();step(s);timings.push(performance.now()-t);
 assert.ok(Number.isFinite(s.ledger.maxGoodsError)&&s.ledger.maxGoodsError<1e-5,'material balance day '+day);
 assert.ok(Number.isFinite(s.ledger.maxMoneyError)&&s.ledger.maxMoneyError<1e-5,'money balance day '+day);
 if(day%360===0){peak=Math.max(peak,process.memoryUsage().heapUsed);timings.sort((a,b)=>a-b);const total=materialTotals(s),raw=serialize(s),stats=s.discovery.stats;const row={year:day/360,population:s.cities.reduce((n,c)=>n+c.pop,0),realms:s.states.length,active:s.states.filter(x=>!x.defunct).length,contracts:s.politics.contracts.length,wars:s.wars.length,shipments:s.shipments.length,discoveries:stats.inventions,contacts:stats.contacts,expeditions:stats.launched,blockers:stats.surveyBlockers,goodsError:s.ledger.maxGoodsError,moneyError:s.ledger.maxMoneyError,saveChars:raw.length,p95:timings[Math.floor(timings.length*.95)],p99:timings[Math.floor(timings.length*.99)],heap:process.memoryUsage().heapUsed};
 if(day%3600===0||day===cfg.years*360){const copy=restore(raw);assert.equal(simulationHash(copy),simulationHash(s));row.roundTrip=true;}
 samples.push(row);timings.length=0;report.peakHeap=peak;report.elapsedMs=performance.now()-started;writeFileSync(target,JSON.stringify(report,null,2));if(row.year%10===0)console.log(JSON.stringify(row));}
}
report.completed=true;writeFileSync(target,JSON.stringify(report,null,2));console.log(JSON.stringify({revision,cfg,final:samples.at(-1),peakHeap:peak,elapsedMs:report.elapsedMs}));
