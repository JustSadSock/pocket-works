import test from 'node:test';
import assert from 'node:assert/strict';
import {liveSchedulingHistory} from './live-scheduling.mjs';
import {fullPlan} from './full-lab.mjs';
import {assertParity} from './sharding.mjs';
import {canonical,taskDigest} from './verified-results.mjs';
const tasks=Array.from({length:6},(_,seed)=>({app:'crown-and-marches',suite:'balance-experiments',kind:'node',seed,install:false,key:'crown-and-marches-balance-experiments-'+seed}));
const light={app:'crown-and-marches',suite:'regression',kind:'node-test',seed:null,install:false,key:'crown-and-marches-regression'};
const other={...tasks[0],app:'another-app',key:'another-app-balance-experiments-0'};
const all=[...tasks,light,other];
const raw='cpu_matrix='+JSON.stringify({include:all})+'\nbrowser_matrix={"include":[]}\nexpected='+JSON.stringify(all.map(t=>t.key));
test('observed long simulation family gets individual shards without changing task identity',()=>{
 const history=liveSchedulingHistory(all);
 assert.equal(Object.keys(history).length,6);
 assert.equal(history[light.key],undefined);
 assert.equal(history[other.key],undefined);
 const old=fullPlan(raw),next=fullPlan(raw,{history});
 assert.equal(assertParity(all,next.shards),true);
 assert.equal(canonical(old.tasks.map(taskDigest).sort()),canonical(next.tasks.map(taskDigest).sort()));
 for(const t of tasks){
  const shard=next.shards.find(s=>s.tasks.some(x=>x.key===t.key));
  assert.equal(shard.estimatedMs,t.seed===3?1200000:900000);
  assert.equal(shard.tasks.length,1);
 }
 assert.ok(next.shardJobs>old.shardJobs);
 assert.deepEqual(next,fullPlan(raw,{history:liveSchedulingHistory([...all].reverse())}));
});

test('eight Banners completion seeds isolated, longest known Crown shard ordered first',()=>{
 const banners=Array.from({length:8},(_,seed)=>({app:'banners-of-war',suite:'completion-lab',kind:'node',seed,install:false,key:'banners-of-war-completion-lab-'+seed}));
 const mixed=[...all,...banners];
 const history=liveSchedulingHistory(mixed);
 const raw='cpu_matrix='+JSON.stringify({include:mixed})+'\nbrowser_matrix={"include":[]}\nexpected='+JSON.stringify(mixed.map(t=>t.key));
 const p=fullPlan(raw,{history});
 assert.equal(assertParity(mixed,p.shards),true);
 assert.equal(p.cpu.include[0].tasks[0].key,'crown-and-marches-balance-experiments-3');
 for(const task of banners){
  const shard=p.shards.find(s=>s.tasks.some(t=>t.key===task.key));
  assert.deepEqual(shard.tasks,[task]);assert.equal(shard.estimatedMs,900000);
 }
 assert.equal(liveSchedulingHistory([{...banners[0],seed:99},{...banners[0],install:true},{...banners[0],key:'other'}])['banners-of-war-completion-lab-0'],undefined);
});
