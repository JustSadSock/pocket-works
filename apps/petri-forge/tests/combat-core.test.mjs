import test from 'node:test';
import assert from 'node:assert/strict';
import {ARENAS,LOADOUTS,SKILLS,makePolicy,validPolicy,mutatePolicy,createBattle,stepBattle,simulateBattle,snapshotBattle} from '../combat-core.mjs';

test('all arenas and 1v1/2v2 matches terminate deterministically',()=>{
 for(const arena of ARENAS)for(const teamSize of [1,2]){
  const options={arena:arena.id,teamSize,seed:147,maxSeconds:16,loadouts:['skirmisher','guardian']};
  const a=simulateBattle(options,true),b=simulateBattle(options,true);
  assert.deepEqual(a,b,'seed '+arena.id+'/'+teamSize);
  assert.ok([-1,0,1].includes(a.summary.winner));
  assert.ok(a.frames.length>0);
  assert.ok(a.summary.seconds<=16.1);
  assert.equal(a.frames[0].agents.length,teamSize*2);
 }
});
test('all six skills are real loadout abilities and nonnegative cooldowns',()=>{
 assert.equal(Object.keys(SKILLS).length,6);
 for(const values of Object.values(LOADOUTS)){
  assert.equal(values.length,3);
  assert.equal(new Set(values).size,3);
  for(const name of values)assert.ok(SKILLS[name]);
 }
 for(const arena of ARENAS){
  const game=createBattle({arena:arena.id,teamSize:2,seed:77});
  for(let i=0;i<120&&!game.done;i++)stepBattle(game);
  for(const agent of game.agents)for(const cooldown of Object.values(agent.cd))
   assert.ok(Number.isFinite(cooldown)&&cooldown>=0);
  const state=snapshotBattle(game);assert.ok(state.agents.every(a=>Number.isFinite(a.x)&&Number.isFinite(a.hp)));
 }
});
test('mutations are bounded, diverse and deterministic, invalid brain fails',()=>{
 const base=makePolicy('balanced',48);
 assert.ok(validPolicy(base));
 assert.deepEqual(mutatePolicy(base,35),mutatePolicy(base,35));
 assert.notDeepEqual(mutatePolicy(base,35),base);
 for(let i=0;i<200;i++)assert.ok(validPolicy(mutatePolicy(base,i,1.4)));
 assert.equal(validPolicy({...base,weights:[NaN,1]}),false);
 assert.throws(()=>mutatePolicy({bad:true},2));
});
test('different archetypes and seeded arenas have real consequences',()=>{
 const first=createBattle({arena:'open',teamSize:1,seed:1,loadouts:['skirmisher','guardian']});
 const second=createBattle({arena:'open',teamSize:1,seed:1,loadouts:['guardian','skirmisher']});
 assert.ok(first.agents[0].loadout.includes('dash'));
 assert.ok(second.agents[0].loadout.includes('heal'));
 const dry=simulateBattle({arena:'open',seed:16,maxSeconds:20});
 const dangerous=simulateBattle({arena:'hazards',seed:16,maxSeconds:20});
 assert.notDeepEqual(dry.summary,dangerous.summary);
});
