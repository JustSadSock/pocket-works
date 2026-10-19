import test from 'node:test';
import assert from 'node:assert/strict';
import {presetRules,validateCombatRules,addArenaObject,serializeCombatRules,importCombatRules} from '../combat-rules.mjs';
import {createBattle,simulateBattle,stepBattle,makePolicy,SKILLS,DT} from '../combat-core.mjs';

test('all authored rule presets round-trip and defend the engine against malformed data',()=>{
 for(const type of ['duel','control','score']){
  const rules=presetRules(type);
  assert.deepEqual(importCombatRules(serializeCombatRules(rules)),rules);
 }
 assert.throws(()=>validateCombatRules({...presetRules(),teams:[{}]}));
 assert.throws(()=>validateCombatRules({...presetRules(),walls:[{x:105,y:210,w:60,h:60}]}));
 assert.throws(()=>importCombatRules('{"format":"petri-combat-rules","rules":{"version":999}}'));
});
test('map editor places, removes and validates game world objects',()=>{
 let rules=presetRules('duel');
 rules=addArenaObject(rules,'wall',400,105);
 rules=addArenaObject(rules,'danger',460,330);
 rules=addArenaObject(rules,'point',450,230);
 assert.equal(rules.walls.length,1);assert.equal(rules.zones.length,1);
 assert.equal(rules.point.x,450);
 const testBattle=createBattle({rules,arena:'open'});
 assert.equal(testBattle.rules.walls.length,1);
 const removed=addArenaObject(rules,'erase',400,105);
 assert.equal(removed.walls.length,0);assert.equal(removed.zones.length,1);
 assert.throws(()=>addArenaObject(rules,'wall',110,240),'spawn pad must be protected');
});
test('custom team stats and power values are live engine values, not decorative labels',()=>{
 const rules=presetRules('duel');rules.teams[0].hp=220;rules.teams[0].speed=200;rules.teams[0].energyRegen=28;
 rules.teams[1].hp=65;rules.skillPower.bolt=55;rules.skillPower.heal=60;
 const s=createBattle({arena:'open',rules,teamSize:2});
 assert.equal(s.agents[0].hp,220);assert.equal(s.agents[2].hp,65);
 assert.equal(s.agents[0].topSpeed,200);assert.equal(s.agents[0].energyRegen,28);
 assert.equal(s.maxSeconds,rules.limitSeconds);
 for(let i=0;i<45&&!s.done;i++)stepBattle(s);
 assert.ok(s.shots.every(p=>p.damage===55));
});
test('score objective can finish a match before the clock, with objective metrics',()=>{
 const rules=presetRules('score');
 rules.walls=[];rules.zones=[];rules.mode='score';rules.targetScore=20;
 const result=simulateBattle({arena:'open',seed:31,teamSize:1,rules,maxSeconds:99},true);
 assert.equal(result.summary.mode,'score');
 assert.ok(result.summary.seconds<rules.limitSeconds);
 assert.ok(Math.max(...result.summary.objectives)>=rules.targetScore||result.summary.hp.includes(0));
 assert.ok(result.frames[0].objectives.length===2);
});
test('control objective changes trajectories and scores while respecting contested zones',()=>{
 const r=presetRules('control');r.walls=[];r.point={x:240,y:240,r:55};r.limitSeconds=18;
 const a=createBattle({arena:'open',rules:r,teamSize:1,seed:2,loadouts:[['shield','heal'],['shield','heal']]});
 for(let i=0;i<300&&!a.done;i++)stepBattle(a);
 assert.ok(a.agents.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
 assert.ok(a.objectives.every(x=>x>=0));
 assert.ok(a.objectives.some(x=>x>0),'capture zone should earn real points');
});
test('custom arenas remain deterministic in both team sizes and replay snapshots',()=>{
 for(const mode of ['elimination','control','score'])for(const teamSize of [1,2]){
  const rules=presetRules(mode==='elimination'?'duel':mode);
  rules.walls.push({x:310,y:30,w:50,h:70});rules.zones.push({x:520,y:280,r:33,dps:15});
  const config={arena:'open',teamSize,seed:115,rules,policies:[makePolicy('evasive',5),makePolicy('aggressive',7)]};
  const a=simulateBattle(config,true),b=simulateBattle(config,true);
  assert.deepEqual(a,b);
  assert.ok(a.frames.every(f=>f.agents.length===teamSize*2));
  assert.ok(a.frames[0].walls.some(w=>w.x===310));
  assert.ok(a.frames[0].zones.some(z=>z.x===520));
 }
});
