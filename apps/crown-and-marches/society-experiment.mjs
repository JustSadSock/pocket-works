import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {societySandbox,societySample,step,materialTotals,serialize,restore,simulationHash,governmentType,startLedgerAudit,sampleLedgerAudit} from './world.mjs';
if(!global.gc){const child=spawnSync(process.execPath,['--expose-gc',fileURLToPath(import.meta.url),...process.argv.slice(2)],{stdio:'inherit',env:process.env});process.exit(child.status??1);}
const shard=Number(process.argv[2]||0),out=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/society';
assert.ok(Number.isInteger(shard)&&shard>=0&&shard<5);mkdirSync(out,{recursive:true});
const governments=['feudal','central','estates','merchant','aristocratic','theocracy','confederation'];
let runs=Array.from({length:4},(_,i)=>({seed:'society-100-'+(shard*4+i+1),years:100,index:shard*4+i}));runs.push({seed:'society-300-'+(shard+1),years:300,index:20+shard});if(shard===3)runs.reverse();const selected=process.argv[3];if(selected){runs=runs.filter(r=>r.seed===selected);assert.equal(runs.length,1,'Unknown seed in shard');}
const p95=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length*.95)]||0,results=[];
function run(config,years){
 const s=societySandbox(config),initial=materialTotals(s),samples=[societySample(s)],events=[],ticks=[],phase=[],start=performance.now();let peakHeap=0,lastEventDay=0;if(config.seed==='society-300-4')startLedgerAudit(s);
 for(let day=0;day<years*360;day++){
 const before=performance.now();step(s);if(s.day%20===0)ticks.push(performance.now()-before);if(s.day%40===0){phase.push(performance.now()-before);for(const e of s.society.events)if(e.day>lastEventDay)events.push(e);lastEventDay=s.day;}
 if(s.day%360===0){global.gc();const heap=process.memoryUsage().heapUsed/1048576;peakHeap=Math.max(peakHeap,heap);
 const sample=societySample(s);sample.heap=heap;samples.push(sample);if(config.seed==='society-300-4'&&s.day%3600===0)console.log(JSON.stringify({seed:config.seed,day:s.day,audit:sampleLedgerAudit(s)}));
 for(const c of s.cities){assert.ok(Math.abs(c.society.cohorts.reduce((n,q)=>n+q.pop,0)-c.pop)<1e-5);assert.ok(Math.abs(c.communities.reduce((n,q)=>n+q.pop,0)-c.pop)<1e-5);assert.ok(c.society.cohorts.every(q=>q.pop>=0&&q.cash>=-1e-7));}
 assert.ok(s.ledger.maxMoneyError<1e-5&&s.ledger.maxGoodsError<1e-5);}
 }
 assert.equal(s.day,years*360);const final=materialTotals(s),goodsError=Math.max(...final.goods.map((q,k)=>Math.abs(q-initial.goods[k]-s.ledger.source[k]+s.ledger.sink[k]))),moneyError=Math.abs(final.money-initial.money-s.ledger.moneySource+s.ledger.moneySink);
 const audit=sampleLedgerAudit(s);if(audit)console.log(JSON.stringify({seed:config.seed,day:s.day,audit,goodsError,moneyError,resources:final.goods.map((v,k)=>({k,source:s.ledger.source[k],sink:s.ledger.sink[k],residual:v-initial.goods[k]-s.ledger.source[k]+s.ledger.sink[k]}))}));assert.ok(goodsError<1e-5&&moneyError<1e-5,JSON.stringify({seed:config.seed,day:s.day,goodsError,moneyError,audit}));const save=serialize(s),a=restore(save),b=restore(save);assert.equal(simulationHash(s),simulationHash(a));for(let i=0;i<40;i++){step(a);step(b);}assert.equal(simulationHash(a),simulationHash(b));
 return {config,years,audit,ms:Math.round(performance.now()-start),first:samples[0],last:samples.at(-1),peakHeap,retainedHeapDelta:(samples.at(-1).heap||0)-(samples[Math.min(5,samples.length-1)].heap||0),saveBytes:Buffer.byteLength(save),tickP95:p95(ticks),reviewP95:p95(phase),goodsError,moneyError,events,samples,politics:s.politics.stats,discovery:s.discovery.stats};
}
for(const r of runs){const n=3+r.index%4,config={seed:r.seed,states:n,government:governments[r.index%7],governments:Array.from({length:n},(_,i)=>governments[(r.index+i)%7]),geography:r.index%4===3?'world':'compact',population:1200+r.index%3*300,stockScale:3,cityLimit:3,autonomy:[.25,.45,.65][r.index%3],tax:[.12,.18,.3,.42][r.index%4],privateWealth:[.2,.35,.5][r.index%3],mixed:[0,.25,.4][r.index%3],resources:r.index%5===1?'iron-scarce':'natural',sea:true,autoExplore:true,sides:Array.from({length:n},(_,i)=>({gold:350+i*50,regiments:i%2}))};
 if(r.seed==='society-300-4'){const baseline=run({...config,circulation:false,institutionalReforms:false},r.years);writeFileSync(join(out,'society-300-4-legacy-audit.json'),JSON.stringify(baseline,null,2));}const report=run(config,r.years);results.push(report);writeFileSync(join(out,'society-'+shard+'.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({seed:r.seed,years:r.years,ms:report.ms,last:report.last,peakHeap:report.peakHeap,saveBytes:report.saveBytes,tickP95:report.tickP95,reviewP95:report.reviewP95,goodsError:report.goodsError,moneyError:report.moneyError,eventCounts:report.events.reduce((o,e)=>(o[e.kind]=(o[e.kind]||0)+1,o),{}),politics:report.politics,discovery:report.discovery}));}
if(shard===0&&!selected){const pair={seed:'society-institutions-pair',states:3,geography:'compact',autonomy:.45,population:1500,stockScale:3,cityLimit:3,mixed:.25,privateWealth:.35,tax:.18,sea:true,sides:[{gold:450},{gold:450},{gold:450}]};const comparisons=governments.map(government=>run({...pair,government},10));writeFileSync(join(out,'society-paired.json'),JSON.stringify(comparisons,null,2));console.log(JSON.stringify({paired:comparisons.map(q=>({government:q.config.government,years:q.years,last:q.last,events:q.events.length,goodsError:q.goodsError,moneyError:q.moneyError}))}));}
