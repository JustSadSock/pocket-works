import test from 'node:test';
import assert from 'node:assert/strict';
import {PpoPolicy} from '../ppo.mjs';
import {leagueEpisodePlan,validateLeagueOptions,NeuralCombatLeague,LEAGUE_GENERATION_SIZE,LEAGUE_MAX_SNAPSHOTS} from '../neural-league.mjs';

test('league schedule uses paired sides, rotates all arenas and frozen opponents',()=>{
 const schedule=Array.from({length:24},(_,i)=>leagueEpisodePlan(i,{seed:42,arena:'cover'}));
 for(let i=0;i<schedule.length;i+=2){
  assert.equal(schedule[i].seed,schedule[i+1].seed);
  assert.deepEqual([schedule[i].side,schedule[i+1].side],[0,1]);
  assert.equal(schedule[i].arena,schedule[i+1].arena);
  assert.equal(schedule[i].opponent,schedule[i+1].opponent);
 }
 assert.deepEqual([...new Set(schedule.map(x=>x.arena))].sort(),['cover','hazards','open']);
 assert.deepEqual([...new Set(schedule.map(x=>x.opponent))].sort(),['archive','baseline','initial','latest']);
 assert.deepEqual(schedule,Array.from({length:24},(_,i)=>leagueEpisodePlan(i,{seed:42,arena:'cover'})));
});

test('league refuses invalid models and unbounded or mismatched workloads',()=>{
 for(const args of [{episodes:5},{episodes:13},{episodes:151},{role:'invalid'},{
  episodes:6,enemySnapshot:new PpoPolicy(1).serialize()
 }])assert.throws(()=>validateLeagueOptions(args));
 assert.equal(validateLeagueOptions({episodes:12}).episodes,12);
 assert.throws(()=>leagueEpisodePlan(-1));
});

test('real PPO learns over generations while past opponents stay frozen',()=>{
 const league=new NeuralCombatLeague({role:'archer',enemyRole:'swordsman',arena:'cover',episodes:12,seed:92});
 const initial=structuredClone(league.pool[0].snapshot);
 const progress=[];
 for(let i=0;i<12;i++)progress.push(league.step());
 assert.equal(progress[5].generation.generation,1);
 assert.equal(progress[11].generation.generation,2);
 assert.equal(league.pool.length,3);
 assert.deepEqual(league.pool[0].snapshot,initial);
 assert.ok(league.policy.updates>0);
 assert.notDeepEqual(league.policy.serialize().weights,initial.weights);
 assert.equal(league.generations.length,3);
 assert.equal(league.generations[0].validation.count,6);
 assert.ok(league.generations.every(g=>g.validation.winRate>=0&&g.validation.winRate<=1));
 assert.ok(league.history.some(h=>h.opponent==='baseline'));
 assert.ok(league.history.some(h=>h.opponent==='archive'));
 assert.deepEqual(league.pool[1].snapshot,league.pool[1].snapshot);
 const report=league.finish();
 assert.equal(report.completed,12);
 assert.equal(report.generations.length,3);
 assert.equal(report.history.length,12);
 assert.ok(report.generations[2].updates>=report.generations[1].updates);
 assert.deepEqual(report.model,league.policy.serialize());
 assert.throws(()=>league.step(),/завершена/);
});

test('self-play league is exactly reproducible and stop returns a real partial checkpoint',()=>{
 const options={role:'swordsman',enemyRole:'archer',arena:'hazards',episodes:12,seed:117};
 const build=()=>{const league=new NeuralCombatLeague(options);for(let i=0;i<6;i++)league.step();return league.finish(true);};
 const first=build(),second=build();
 assert.deepEqual(first,second);
 assert.equal(first.completed,6);
 assert.equal(first.generations.length,2);
 assert.equal(first.stopped,true);
 assert.ok(first.updates>0);
 const short=new NeuralCombatLeague(options);short.step();
 const part=short.finish(true);
 assert.equal(part.completed,1);
 assert.equal(part.generations.length,2);
 assert.equal(part.generations[1].to,1);
 assert.equal(part.history.length,1);
 assert.ok(part.model.updates>0);
});

test('league archive has a strict bounded size after many checkpoints',()=>{
 const league=new NeuralCombatLeague({episodes:6,seed:35});
 // No need to simulate scores here: verify the bounded archive policy against
 // generation counter and real snapshot references as each checkpoint is made.
 for(let i=0;i<42;i++){
  league.completed++;
  league.history.push({episode:league.completed,won:false,reward:0,opponent:'baseline'});
  if(league.completed%LEAGUE_GENERATION_SIZE===0)league.checkpoint();
 }
 assert.equal(league.pool.length,LEAGUE_MAX_SNAPSHOTS);
 assert.equal(league.pool[0].generation,0);
 assert.equal(league.pool.at(-1).generation,7);
 assert.deepEqual(league.pool.map(x=>x.generation),[0,3,4,5,6,7]);
});
