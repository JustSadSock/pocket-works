import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {customNavalBattle,navalBattleTick,navalBattleResult,discoverySandbox,step,materialTotals,economicSnapshot,serialize,restore,simulationHash} from './world.mjs';
const out=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/discovery';mkdirSync(out,{recursive:true});
const naval=[];
for(let i=0;i<20;i++){
 const config={seed:'naval-pair'+i,wind:i*37,weather:i%4===0?'storm':'clear',sides:[[{type:[3,4,5,6,7][i%5],n:3,experience:.45}],[{type:[7,3,6,4,5][i%5],n:4,experience:.45}]]};
 const run=doctrines=>{const b=customNavalBattle({...config,doctrines}),start=performance.now();for(let t=0;t<1300&&b.winner===null;t++)navalBattleTick(b);assert.notEqual(b.winner,null);return {...navalBattleResult(b),ms:performance.now()-start};};
 naval.push({config,engage:run(['engage','engage']),line:run(['line','engage'])});
}
const history=[];
for(const [seed,geography] of [['discovery-pair-coast','world'],['discovery-pair-land','compact']]){
 const base={seed,states:4,geography,population:1500,stockScale:3,cityLimit:4,sea:true,autoExplore:true,fullMap:false,sides:Array.from({length:4},()=>({gold:500}))};
 const run=initial=>{const config={...base,initial},s=discoverySandbox(config),first=materialTotals(s),start=performance.now();for(let day=0;day<1800;day++)step(s);const total=materialTotals(s),goodsError=Math.max(...total.goods.map((q,k)=>Math.abs(q-first.goods[k]-s.ledger.source[k]+s.ledger.sink[k]))),moneyError=Math.abs(total.money-first.money-s.ledger.moneySource+s.ledger.moneySink);assert.ok(goodsError<1e-5&&moneyError<1e-5);assert.equal(simulationHash(s),simulationHash(restore(serialize(s))));return {config,ms:performance.now()-start,population:economicSnapshot(s).population,stats:s.discovery.stats,politics:s.politics.stats,unique:s.discovery.discoveries.map(v=>Object.keys(v).length),cities:s.cities.length,goodsError,moneyError};};
 history.push({seed,baseline:run([]),initial:run([['writing','rotation','coastal-sail','charts','compass','ocean-sail']])});
}
writeFileSync(join(out,'discovery-pairs.json'),JSON.stringify({naval,history},null,2));console.log(JSON.stringify({navalPairs:naval.length,changedWinners:naval.filter(v=>v.engage.winner!==v.line.winner).length,history}));
