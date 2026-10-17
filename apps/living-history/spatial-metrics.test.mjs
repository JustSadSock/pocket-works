import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createWorld,chooseSettlementSite,serialize,audit,advanceDays} from './model.js';
import {median,share,networkDistances,roadJunctions,homeRoadMetrics,coreRoadRaster,siteSelectionAblation} from './qa/spatial-metrics.mjs';

test('road-distance flood-fill is Manhattan, bounded and does not invent roads',()=>{
 const s=7,traffic=new Uint8Array(s*s);
 let d=networkDistances(traffic,s,12);
 assert.ok(d.every(v=>v===-1));
 traffic[3*s+3]=90;
 d=networkDistances(traffic,s,55);
 assert.equal(d[3*s+3],0);
 assert.equal(d[3*s+5],2);
 assert.equal(d[1*s+1],4);
 assert.equal(d[0],6);
 assert.equal(median([null,8,2,4,Infinity]),4);
 assert.equal(median([]),null);
 assert.equal(share([]),null);
 assert.equal(share([true,false,true]),2/3);
});

test('fixed-rank core reflects strongest road and breaks wear ties by cell',()=>{
 const t=Uint8Array.from([12,22,0,90,90,12,0,0,0,0]);
 const core=coreRoadRaster(t,10,.25);
 assert.equal(core.reduce((n,v)=>n+v,0),2);
 assert.equal(core[3],1);
 assert.equal(core[4],1);
 assert.equal(core[1],0);
 assert.ok(coreRoadRaster(new Uint8Array(10),10).every(v=>v===0));
});
test('through-junction is not confused with private access or roadless map',()=>{
 const s=9,t=new Uint8Array(s*s);
 for(let x=2;x<=6;x++)t[4*s+x]=85;
 assert.equal(roadJunctions(t,s).reduce((a,b)=>a+b,0),0);
 for(let y=2;y<=4;y++)t[y*s+4]=85;
 const junctions=roadJunctions(t,s);
 assert.equal(junctions[4*s+4],1);
 assert.equal(junctions.reduce((a,b)=>a+b,0),1);
 const homes=[{x:4,y:5},{x:0,y:0}];
 const m=homeRoadMetrics(t,s,homes);
 assert.equal(m.junctionCount,1);
 assert.equal(m.coreRoadCells,1);
 assert.equal(m.coreRoadWithinTwoTilesShare,0.5);
 assert.equal(m.coreRoadDistanceTilesMedian,4.5);
 assert.equal(m.mainRoadWithinTwoTilesShare,0.5);
 assert.equal(m.junctionWithinSixTilesShare,0.5);
 assert.equal(m.mainRoadDistanceTilesMedian,3.5);
});

test('road-ablation selector probes retain the full serialized world',()=>{
 const s=createWorld(413);
 const before=serialize(s);
 const first=siteSelectionAblation(s,chooseSettlementSite,2);
 assert.equal(first.length,8);
 assert.ok(first.every(x=>x.comparable&&x.actual&&x.ablated));
 assert.deepEqual(siteSelectionAblation(s,chooseSettlementSite,2),first);
 assert.equal(serialize(s),before);
 advanceDays(s,60);
 assert.ok(audit(s).ok,audit(s).issues.join(';'));
 const next=siteSelectionAblation(s,chooseSettlementSite,1);
 assert.equal(next.length,4);
 assert.equal(next[0].actual!==undefined,true);
});

test('1-year audit emits geometry, ablation and balanced construction evidence',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lh-spatial-'));
 try{
  const run=spawnSync(process.execPath,['apps/living-history/qa/spatial-audit.mjs','--seed=413','--years=1','--output='+root],{encoding:'utf8',timeout:90000});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const result=JSON.parse(fs.readFileSync(path.join(root,'metrics.json'),'utf8'));
  assert.equal(result.schema,2);
  assert.equal(result.snapshots.length,1);
  assert.deepEqual(result.auditPassedYears,[1]);
  assert.ok(Array.isArray(result.constructionObservations));
  const snap=result.snapshots[0];
  assert.equal(snap.roadAblation.attempts,8);
  assert.ok(snap.communities.every(c=>c.mainRoadDistanceTilesMedian!==undefined&&c.junctionCount>=0&&c.coreRoadCells>0));
  assert.ok(fs.readFileSync(path.join(root,'maps.svg'),'utf8').startsWith('<svg'));
 }finally{fs.rmSync(root,{force:true,recursive:true});}
});

test('summary fails closed without 24 complete reports',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lh-spatial-empty-'));
 try{
  const result=spawnSync(process.execPath,['apps/living-history/qa/spatial-summarize.mjs','--input='+root,'--output='+path.join(root,'summary')],{encoding:'utf8',timeout:15000});
  assert.equal(result.status,1);
  const json=JSON.parse(fs.readFileSync(path.join(root,'summary','summary.json'),'utf8'));
  assert.equal(json.complete,false);
  assert.equal(json.errors.length,24);
 }finally{fs.rmSync(root,{force:true,recursive:true});}
});
