import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattle,stepBattle,NEURAL_COMBAT_CLASSES,neuralBattleObservation,neuralBattleControl} from '../combat-core.mjs';
import {PpoPolicy,PpoTrainer,validatePpoPolicy} from '../ppo.mjs';
import {battleNeuralEpisode,combatTrainingOptions,runCombatEvaluation,neuralDuel} from '../neural-combat.mjs';
test('neural combat observes actual moving cover, traps, opponent and world coordinates',()=>{
 const state=createBattle({arena:'hazards',seed:17,teamSize:1,loadouts:[NEURAL_COMBAT_CLASSES.archer.loadout,NEURAL_COMBAT_CLASSES.swordsman.loadout]});
 const a=state.agents[0],obs=neuralBattleObservation(state,a);
 assert.equal(obs.tiles.length,7);
 assert.equal(obs.tiles[0].length,7);
 assert.ok(obs.tiles.flat().every(n=>Number.isInteger(n)&&n>=0&&n<=4));
 assert.ok(obs.pos.every(Number.isFinite));
 assert.ok(obs.goalVec[0]>0);
 for(let i=0;i<12;i++)stepBattle(state);
 assert.ok(neuralBattleObservation(state,a).tiles.length===7);
});
test('a sampled movement/attack action drives real Combat Forge state, with class-specific weapons',()=>{
 const state=createBattle({arena:'open',seed:8,loadouts:[NEURAL_COMBAT_CLASSES.archer.loadout,NEURAL_COMBAT_CLASSES.swordsman.loadout]});
 const before=state.agents[0].x;
 for(let i=0;i<6;i++)stepBattle(state,{0:(s,a,t,w)=>neuralBattleControl(s,a,t,w,1)});
 assert.ok(state.agents[0].x>before,'learned approach should move a real fighter');
 for(let i=0;i<2;i++)stepBattle(state,{0:(s,a,t,w)=>neuralBattleControl(s,a,t,w,0)});
 assert.ok(state.agents[0].cd.bolt>0,'archer attacks using real projectile cooldown');
 const sword=createBattle({arena:'open',seed:9,loadouts:[NEURAL_COMBAT_CLASSES.swordsman.loadout,NEURAL_COMBAT_CLASSES.archer.loadout]});
 sword.agents[1].x=160;
 const health=sword.agents[1].hp;
 stepBattle(sword,{0:(s,a,t,w)=>neuralBattleControl(s,a,t,w,0)});
 assert.ok(sword.agents[1].hp<health,'sword hit comes from real physics melee range');
 assert.ok(sword.agents[0].cd.strike>0);
});
test('headless PPO trains against frozen bot and on own prior neural version',()=>{
 const p=new PpoPolicy(13),initial=p.serialize();
 const trainer=new PpoTrainer(p,{seed:12,rolloutSteps:40,epochs:1,minibatchSize:20});
 for(let ep=0;ep<3;ep++){
  const result=battleNeuralEpisode({role:'archer',enemyRole:'swordsman',arena:ep===0?'open':'cover',
   seed:ep+31,policy:p,learn:trainer,maxSeconds:3});
  assert.ok(result.moves>0&&Number.isFinite(result.reward));
  if(trainer.ready)trainer.optimize();
 }
 if(trainer.buffer.length)trainer.optimize();
 assert.ok(p.updates>0);
 assert.notDeepEqual(p.serialize().weights,initial.weights);
 assert.ok(validatePpoPolicy(p.serialize()));
 const frozen=new PpoPolicy(14);frozen.load(initial);
 const saved=frozen.serialize();
 const result=battleNeuralEpisode({role:'swordsman',enemyRole:'archer',arena:'hazards',seed:14,
  policy:p,opponent:frozen,maxSeconds:3,record:true});
 assert.ok(result.frames.length>0);
 assert.deepEqual(frozen.serialize(),saved,'enemy weights must remain frozen');
});
test('fair four-leg frozen duel swaps positions, returns physical frames and never mutates brains',()=>{
 const a=new PpoPolicy(17).serialize(),b=new PpoPolicy(29).serialize();
 const opts={a,b,roleA:'archer',roleB:'swordsman',arena:'cover',legs:4,seed:30};
 const first=neuralDuel(opts),second=neuralDuel(opts);
 assert.deepEqual(first,second);
 assert.equal(first.matches.length,4);
 assert.ok(first.matches[0].frames.length>0);
 assert.equal(first.points.reduce((x,y)=>x+y,0),4);
 assert.ok([-1,0,1].includes(first.winner));
 assert.ok(first.matches.every(m=>m.summary.seconds<=22.1));
 assert.deepEqual(a,opts.a);assert.deepEqual(b,opts.b);
 assert.throws(()=>neuralDuel({...opts,roleA:'ghost'}),/класс/);
});
test('training options reject corrupt models, invalid arena, overlong loops',()=>{
 assert.equal(combatTrainingOptions({episodes:12}).role,'archer');
 for(const o of [{role:'other'},{arena:'unknown'},{episodes:0},{episodes:10000},{seed:-5},{enemySnapshot:{type:'neural-ppo'}}]){
  assert.throws(()=>combatTrainingOptions(o));
 }
 const model=new PpoPolicy(15).serialize();
 const result=runCombatEvaluation(model,{role:'archer',enemyRole:'swordsman',arena:'open',seed:22,count:2});
 assert.equal(result.count,2);
 assert.ok(result.winRate>=0&&result.winRate<=1);
 assert.ok(Number.isFinite(result.damage));
});
