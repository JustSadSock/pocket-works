import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {runCampaign} from './marathon-sim.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const root={};root.window=root;
vm.runInNewContext(read('../js/rules-core.js'),{window:root});
vm.runInNewContext(read('../js/fog-controller.js'),{window:root});
const {FogVisibility:fog,FogRuleKernel:kernel}=root;
test('side-private fog and last-known enemy structures work without DOM or hidden-state leaks',()=>{
 const map=Array.from({length:10},()=>Array(15).fill(0));
 const units=[{id:1,owner:1,r:1,c:1},{id:2,owner:2,r:8,c:12}];
 const buildings=[{id:1,owner:1,r:1,c:0,type:'base',hp:4,gen:0},
  {id:2,owner:2,r:8,c:13,type:'base',hp:4,gen:0}];
 const blank=v=>Array.from({length:10},()=>Array(15).fill(v));
 const state={fog:{1:blank(true),2:blank(true)},seen:{1:blank(false),2:blank(false)},
   lastSeen:{1:{},2:{}}};
 assert.equal(fog.project({map:[],units,buildings,state,side:1,kernel}),false);
 assert.equal(fog.project({map,units,buildings,state,side:1,online:true,kernel}),false);
 fog.project({map,units,buildings,state,side:1,kernel});
 assert.equal(state.fog[1][8][13],true,'enemy base should be hidden');
 assert.equal(fog.visible({state,buildings,side:1}).some(b=>b.id===2),false);
 units[0].r=7;units[0].c=12;
 fog.project({map,units,buildings,state,side:1,kernel});
 assert.equal(state.fog[1][8][13],false);
 const oldHP=state.lastSeen[1]['8,13'].hp;
 units[0].r=1;units[0].c=1;
 fog.project({map,units,buildings,state,side:1,kernel});
 buildings[1].hp=1;buildings[1].owner=0;
 const projection=fog.visible({state,buildings,side:1});
 const remembered=projection.find(b=>b.id===2);
 assert.equal(remembered.hp,oldHP);
 assert.equal(remembered.owner,2);
 assert.equal(remembered.stale,true);
 assert.equal(fog.visible({state,buildings,side:2}).some(b=>b.id===1),false);
 // An online client must retain only its server supplied projection.
 const before=JSON.stringify(state);
 fog.project({map,units,buildings,state,side:1,online:true,kernel});
 assert.equal(JSON.stringify(state),before);
});
test('FOG-018: full 7-tier, 20-seed campaigns perform 50+ authentic half-turns or finish naturally',()=>{
 const records=[];
 for(let level=0;level<=6;level++){
  for(let match=0;match<20;match++){
   const size=['tiny','small','medium','large'][(match+level)%4];
   const seed=1000+level*100+match*7;
   const result=runCampaign({level,seed,size,maxHalfTurns:60});
   records.push(result);
   assert.ok(result.turns>0);
   assert.ok(result.winner===null||[1,2].includes(result.winner));
   assert.ok(result.maximumArmy<=140);
   assert.ok(result.accepted>0,'opponent issued no valid orders');
  }
 }
 assert.equal(records.length,140);
 assert.ok(records.every(x=>x.turns===60||x.winner!==null),
   'world stopped without victory before full benchmark horizon');
 assert.ok(records.some(x=>x.aiSpawn>0),'original AI did not recruit at all');
 assert.ok(records.some(x=>x.aiAttack>0),'no AI battles were reached');
 assert.ok(records.some(x=>x.attack>0),'authoritative opponent never attacked');
 assert.ok(records.reduce((s,x)=>s+x.accepted,0)>=1400,'too few real server orders');
 console.log('FOG-MARATHON '+JSON.stringify({
   games:records.length,
   turns:records.reduce((sum,x)=>sum+x.turns,0),
   wins:{one:records.filter(x=>x.winner===1).length,two:records.filter(x=>x.winner===2).length},
   recruitment:records.reduce((s,x)=>s+x.spawn+x.aiSpawn,0),
   attacks:records.reduce((s,x)=>s+x.attack+x.aiAttack,0),
   captureGames:records.filter(x=>x.captures>0).length,
   byLevel:Array.from({length:7},(_,level)=>{
     const rs=records.filter(x=>x.level===level);
     return {level,games:rs.length,turns:rs.reduce((a,b)=>a+b.turns,0),
       aiWins:rs.filter(x=>x.winner===2).length};
   })
 }));
},{timeout:15*60*1000});
