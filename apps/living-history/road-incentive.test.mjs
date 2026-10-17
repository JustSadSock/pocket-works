import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advanceDays,chooseSettlementSite,normalizeTuning,serialize,deserialize,audit,overview} from './model.js';
import {buildRoadExperiment,geography,currentHouses,delta,ROAD_ARMS} from './qa/road-incentive-study.mjs';
import {summarizeRoadExperiments,verifyRoadExperiment,roadMarkdown} from './qa/road-incentive-summarize.mjs';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('experimental coefficient is bounded, serialized and neutral by default',()=>{
 assert.equal(normalizeTuning().roadAttraction,1);
 for(const w of [0,.5,1,1.5,2])assert.equal(normalizeTuning({roadAttraction:w}).roadAttraction,w);
 for(const w of [-1,2.01,NaN,'2',Infinity])assert.throws(()=>normalizeTuning({roadAttraction:w}),/roadAttraction/);
 const s=createWorld(413);
 const original=serialize(s);
 assert.equal(deserialize(original).tuning.roadAttraction,1);
 assert.equal(serialize(deserialize(original)),original);
 const old=JSON.parse(original);delete old.tuning.roadAttraction;
 assert.equal(deserialize(JSON.stringify(old)).tuning.roadAttraction,1);
 const copy=deserialize(original);
 copy.tuning.roadAttraction=0;
 assert.notEqual(serialize(copy),original);
 assert.equal(serialize(s),original);
});

test('neutral parameter reproduces identical world chronology',()=>{
 const a=createWorld(7777),b=deserialize(serialize(a));
 b.tuning.roadAttraction=1;
 advanceDays(a,365);advanceDays(b,365);
 assert.equal(serialize(a),serialize(b),'original game and neutral experimental arm must remain identical');
 assert.ok(audit(a).ok,audit(a).issues.join('; '));
});

test('road arm interventions do not alter the starting household endowment or terrain',()=>{
 const base=createWorld(43821);
 const start=serialize(base);
 const worlds=ROAD_ARMS.map(arm=>{
  const s=deserialize(start);s.tuning.roadAttraction=arm.weight;return s;
 });
 const canonical=s=>{const clone=deserialize(serialize(s));clone.tuning.roadAttraction=1;return serialize(clone);};
 assert.ok(worlds.every(s=>canonical(s)===start));
 const h=base.households[0],c=base.communities[0];
 assert.deepEqual(chooseSettlementSite(base,c,h,15),chooseSettlementSite(worlds[1],c,h,15));
 assert.equal(serialize(base),start);
});

test('read-only geographic indicators do not consume RNG or change ownership',()=>{
 const world=createWorld(202);advanceDays(world,5);
 const original=serialize(world);
 const one=geography(world,1),two=geography(world,1);
 assert.deepEqual(one,two);
 assert.equal(one.homes,currentHouses(world).length);
 assert.equal(one.population,overview(world).population);
 assert.equal(serialize(world),original);
});

test('CLI executes 3 one-year worlds and records separate audits and snapshots',()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'lh-roads-paired-'));
 try{
  const p=path.join(root,'study.json');
  const run=spawnSync(process.execPath,['apps/living-history/qa/road-incentive-study.mjs',
   '--seed=413','--years=1','--output='+p],{encoding:'utf8',timeout:90000});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const a=JSON.parse(readFileSync(p,'utf8'));
  assert.equal(a.arms.length,3);
  assert.equal(a.initialEqualAcrossArms,true);
  assert.ok(a.arms.every(v=>v.snapshots.length===1&&v.auditedYears.join(',')==='1'));
  assert.equal(a.paired.length,2);
  assert.deepEqual(a.arms.map(v=>v.weight),[0,1,2]);
  const baseline=a.arms[1].snapshots[0];
  for(const [i,pair] of a.paired.entries()){
   assert.deepEqual(pair.checkpoints[0].changes,delta(baseline,a.arms[i===0?0:2].snapshots[0]));
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('full-report verification cannot pass with invented, incomplete or corrupted evidence',()=>{
 const bad={seed:413,snapshots:[]};
 assert.ok(verifyRoadExperiment(bad,{seed:413,years:50,schema:1,arms:[]}).length>0);
 const report=summarizeRoadExperiments([]);
 assert.equal(report.complete,false);
 assert.ok(report.errors.length>0);
 assert.match(roadMarkdown(report),/НЕПОЛНО/);
});
