import test from 'node:test';
import assert from 'node:assert/strict';
import {ROUTES,GENES,routeOptions,applyRoute,sanitizeRouteHistory,sanitizeArchive,
 unlockGene,equipGene,applyGene,earnEchoes} from '../runPaths.js';
import {validateRun} from '../stability.js';

test('all 500 seeded organs offer two deterministic routes, one protective and one risky',()=>{
 const kinds=new Set();
 for(let seed=0;seed<500;seed++)for(let wave=2;wave<=5;wave++){
  const a=routeOptions(seed,wave),b=routeOptions(seed,wave);
  assert.deepEqual(a,b);assert.equal(a.length,2);
  assert.equal(a[0].group,'safe');assert.equal(a[1].group,'risk');
  a.forEach(r=>kinds.add(r.id));
 }
 assert.equal(kinds.size,ROUTES.length);
});
test('route choices change real wave pressure, reward, healing, damage and hazard',()=>{
 let found={};
 for(let seed=0;seed<1000;seed++)for(let wave=2;wave<=5;wave++){
  for(const r of routeOptions(seed,wave))if(!found[r.id])found[r.id]={seed,wave};
 }
 for(const r of ROUTES){
  const {seed,wave}=found[r.id];
  const s={seed,wave,hp:50,maxHp:100,immune:{heat:30},toSpawn:10,biomass:1,damageBonus:2,score:5,routeHistory:[]};
  assert.equal(applyRoute(s,r.id,wave),true);
  assert.equal(s.hp,50+r.heal);assert.equal(s.toSpawn,10+r.enemies);
  assert.equal(s.immune.heat,30+r.heat);assert.equal(s.biomass,1+r.biomass);
  assert.equal(s.damageBonus,2+r.damage);assert.equal(s.routeHazard,r.hazard);
  assert.equal(s.routeHistory.length,1);
  assert.equal(applyRoute(s,r.id,wave),false,'repeat cannot farm reward');
  assert.equal(s.routeHistory.length,1);
  assert.equal(applyRoute(s,r.id,wave+1),false,'wrong stage');
 }
});
test('invalid or forged routes cannot alter saves or gain bonuses',()=>{
 const s={seed:413,wave:3,hp:70,maxHp:100,immune:{heat:0},toSpawn:9,biomass:0,routeHistory:[]};
 assert.equal(applyRoute(s,'unknown',3),false);
 assert.deepEqual(s.routeHistory,[]);
 assert.deepEqual(sanitizeRouteHistory([{wave:2,id:'bypass'},{wave:2,id:'rupture'},
  {wave:3,id:'hack'},{wave:5,id:'necrosis'}]),[{wave:2,id:'bypass'},{wave:5,id:'necrosis'}]);
});
test('earned gene archive gates upgrades, equips exactly one and persists',()=>{
 const a=sanitizeArchive({echoes:14,runs:0,unlocked:['hack','ossified','ossified'],equipped:'hack'});
 assert.deepEqual(a.unlocked,['ossified']);assert.equal(a.equipped,null);
 assert.equal(unlockGene(a,'nerve'),true);assert.equal(a.echoes,8);
 assert.equal(unlockGene(a,'nerve'),false);
 assert.equal(equipGene(a,'siphon'),false);
 assert.equal(equipGene(a,'nerve'),true);
 const s={maxHp:100,hp:100,biomass:0,damageBonus:0,immune:{heat:0}};
 assert.equal(applyGene(s,a.equipped),true);
 assert.equal(s.damageBonus,5);assert.equal(s.immune.heat,14);
 assert.deepEqual(sanitizeArchive(a),a);
 assert.equal(earnEchoes(a,{wave:3,kills:25,elapsed:120},false),5);
 assert.equal(a.runs,1);assert.equal(a.echoes,13);
 assert.equal(equipGene(a,null),true);assert.equal(a.equipped,null);
 assert.equal(GENES.length,3);
});
test('existing v5 sessions migrate, and selected route, gene and history survive reload',()=>{
 const base={v:5,seed:413,x:3,z:3,wave:2,hp:75,maxHp:100,
  selectedRoute:routeOptions(413,3)[1].id,pendingDraft:3,
  routeHistory:[{wave:2,id:routeOptions(413,2)[0].id}],
  routeWave:2,routeId:routeOptions(413,2)[0].id,routeHazard:500,gene:'ossified'};
 const run=validateRun(base);
 assert.equal(run.gene,'ossified');
 assert.equal(run.routeHazard,0);
 assert.equal(run.selectedRoute,base.selectedRoute);
 assert.deepEqual(run.routeHistory,base.routeHistory);
 assert.deepEqual(validateRun(run),run);
 const old=validateRun({v:4,seed:413,x:3,z:3,wave:1,hp:100});
 assert.equal(old.selectedRoute,'');assert.deepEqual(old.routeHistory,[]);
});
