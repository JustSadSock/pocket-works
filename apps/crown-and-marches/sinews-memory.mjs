import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {newGame,step,serialize,restore,simulationHash,campaignSandbox,warSnapshot,setOperation} from './world.mjs';
import {customBattle,battleTick} from './battle.mjs';
if(!global.gc){const child=spawnSync(process.execPath,['--expose-gc',fileURLToPath(import.meta.url)],{stdio:'inherit',env:process.env});process.exit(child.status??1);}
const out=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/sinews-memory';mkdirSync(out,{recursive:true});
const mb=n=>Math.round(n/1048576*100)/100,measure=()=>{global.gc();const m=process.memoryUsage();return {heap:mb(m.heapUsed),rss:mb(m.rss),external:mb(m.external),buffers:mb(m.arrayBuffers)};};
let s=newGame('wealth-decade-10');s.autonomous=true;const strategy=[];
for(let d=0;d<7200;d++){step(s);if(s.day%360===0){let json=serialize(s);const copy=restore(json);assert.equal(simulationHash(copy),simulationHash(s));strategy.push({day:s.day,bytes:Buffer.byteLength(json),cities:s.cities.length,operations:s.operations.length,shipments:s.shipments.length,...measure()});}}
assert.equal(s.day,7200);assert.ok(s.ledger.maxGoodsError<1e-6&&s.ledger.maxMoneyError<1e-6);s=null;
const tactical=[];
for(let round=0;round<20;round++){const n=round%5===4?3000:1000;let b=customBattle({seed:123+round,landscape:round%2?'forest':'plain',sides:[0,1].map(side=>({ai:true,offsetX:side?-180:180,units:[{type:2,n:n*.3},{type:4,n:n*.1},{type:7,n:n*.1}]}))});let ticks=0;for(;ticks<300&&b.winner===null;ticks++)battleTick(b,.1);b=null;tactical.push({round,n,ticks,...measure()});}
const delta=(rows,key)=>Math.max(...rows.slice(5).map(q=>q[key]))-Math.min(...rows.slice(5).map(q=>q[key]));
assert.ok(delta(tactical,'heap')<32,'Retained tactical heap must stay bounded after warmup');
assert.ok(strategy.at(-1).heap-strategy[5].heap<32,'Retained strategic heap must stay bounded after warmup');
const report={strategy,tactical,retainedHeapRange:{strategy:delta(strategy,'heap'),tactical:delta(tactical,'heap')}};writeFileSync(join(out,'memory.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
