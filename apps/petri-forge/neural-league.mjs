// PPO self-play league for Combat Forge. The learner evolves, opponents never do:
// archive snapshots are deep copies, so each generation tests new tactics against
// the strategies that earlier versions used. The evaluation seeds never enter training.
import {PpoPolicy,PpoTrainer,validatePpoPolicy} from './ppo.mjs';
import {combatTrainingOptions,battleNeuralEpisode,runCombatEvaluation,NEURAL_ARENAS} from './neural-combat.mjs';

export const LEAGUE_GENERATION_SIZE=6;
export const LEAGUE_MAX_SNAPSHOTS=6;
const labels=Object.freeze({baseline:'Обычный ИИ',initial:'Первое поколение',
 latest:'Последнее поколение',archive:'Архив тактик'});
const copy=value=>structuredClone(value);
export function leagueEpisodePlan(index,{seed=411,arena='cover'}={}){
 if(!Number.isSafeInteger(index)||index<0||index>150)throw Error('Неверный номер боя');
 const arenas=[arena,...NEURAL_ARENAS.filter(name=>name!==arena)];
 const opponent=['baseline','initial','latest','archive'][Math.floor(index/2)%4];
 return {episode:index+1,side:index%2,seed:seed+Math.floor(index/2)*907,
  arena:arenas[Math.floor(index/2)%arenas.length],opponent,label:labels[opponent]};
}
export function validateLeagueOptions(input={}){
 const options=combatTrainingOptions(input);
 if(options.episodes<6||options.episodes%LEAGUE_GENERATION_SIZE!==0)
  throw Error('Лига требует число боёв, кратное шести');
 if(options.enemySnapshot)throw Error('Лига использует архив собственных поколений, а не внешнего противника');
 return options;
}
function frozenPolicy(snapshot,seed){
 const p=new PpoPolicy(seed);p.load(snapshot);return p;
}
export class NeuralCombatLeague {
 constructor(input={}){
  const options=validateLeagueOptions(input);
  this.options=options;
  this.policy=new PpoPolicy(options.seed+19);
  if(options.snapshot)this.policy.load(options.snapshot);
  this.trainer=new PpoTrainer(this.policy,{seed:options.seed+31,rolloutSteps:256});
  this.initial=copy(this.policy.serialize());
  this.pool=[{generation:0,snapshot:copy(this.initial)}];
  this.completed=0;this.wins=0;this.damage=0;this.history=[];this.generations=[];
  this.finished=false;this.lastPpo=null;
  this.baseline=this.evaluate(this.initial);
  this.generations.push({generation:0,episodes:0,from:0,to:0,wins:0,
   opponents:{baseline:0,initial:0,latest:0,archive:0},
   validation:this.baseline,updates:this.policy.updates});
 }
 evaluate(snapshot){
  const o=this.options;
  const byArena={},count=2;
  for(let i=0;i<NEURAL_ARENAS.length;i++){
   const arena=NEURAL_ARENAS[i];
   byArena[arena]=runCombatEvaluation(snapshot,{role:o.role,enemyRole:o.enemyRole,
    arena,seed:o.seed+500061+i*3001,count});
  }
  const total=Object.values(byArena);
  return {count:total.reduce((n,x)=>n+x.count,0),
   wins:total.reduce((n,x)=>n+x.wins,0),
   winRate:total.reduce((n,x)=>n+x.wins,0)/6,
   damage:total.reduce((n,x)=>n+x.damage,0)/3,
   taken:total.reduce((n,x)=>n+x.taken,0)/3,
   byArena:Object.fromEntries(NEURAL_ARENAS.map(name=>[name,{
    wins:byArena[name].wins,count:byArena[name].count,winRate:byArena[name].winRate}]))};
 }
 chooseOpponent(index){
  const spec=leagueEpisodePlan(index,this.options);
  if(spec.opponent==='baseline')return {...spec,snapshot:null,generation:null};
  if(spec.opponent==='initial')return {...spec,snapshot:this.pool[0].snapshot,generation:0};
  if(spec.opponent==='latest'){
   const last=this.pool.at(-1);
   return {...spec,snapshot:last.snapshot,generation:last.generation};
  }
  // The archive rotates through earlier strategies, not always the newest one.
  const older=this.pool.slice(0,-1),chosen=older[Math.floor(index/8)%older.length]||this.pool[0];
  return {...spec,snapshot:chosen.snapshot,generation:chosen.generation};
 }
 checkpoint(){
  if(this.trainer.buffer.length)this.lastPpo=this.trainer.optimize();
  const generation=this.generations.length;
  const snapshot=copy(this.policy.serialize());
  this.pool.push({generation,snapshot});
  if(this.pool.length>LEAGUE_MAX_SNAPSHOTS)this.pool.splice(1,1); // Retain initial baseline.
  const from=this.generations.at(-1).episodes,to=this.completed,segment=this.history.slice(from,to);
  const validation=this.evaluate(snapshot);
  const opponents={baseline:0,initial:0,latest:0,archive:0};
  for(const step of segment)opponents[step.opponent]++;
  const row={generation,episodes:this.completed,from:from+1,to,
   wins:segment.filter(x=>x.won).length,opponents,validation,updates:this.policy.updates,
   meanReward:segment.reduce((n,x)=>n+x.reward,0)/segment.length};
  this.generations.push(row);
  return row;
 }
 step(){
  if(this.finished||this.completed>=this.options.episodes)throw Error('Лига уже завершена');
  const spec=this.chooseOpponent(this.completed);
  const opponent=spec.snapshot?frozenPolicy(spec.snapshot,this.options.seed+93+this.completed):null;
  const o=this.options;
  const result=battleNeuralEpisode({role:o.role,enemyRole:o.enemyRole,arena:spec.arena,
   seed:spec.seed,side:spec.side,policy:this.policy,opponent,learn:this.trainer,maxSeconds:18});
  this.completed++;this.wins+=Number(result.won);this.damage+=result.damage;
  const record={episode:this.completed,arena:spec.arena,opponent:spec.opponent,
   opponentGeneration:spec.generation,won:result.won,draw:result.draw,
   reward:result.reward,damage:result.damage};
  this.history.push(record);
  if(this.trainer.ready)this.lastPpo=this.trainer.optimize();
  const generation=this.completed%LEAGUE_GENERATION_SIZE===0?this.checkpoint():null;
  return {completed:this.completed,total:o.episodes,wins:this.wins,updates:this.policy.updates,
   record,generation};
 }
 finish(stopped=false){
  if(this.finished)throw Error('Лига уже завершена');
  if(this.completed>this.generations.at(-1).episodes)this.checkpoint();
  this.finished=true;
  const after=this.generations.at(-1).validation;
  return {type:'neural-combat-league',schema:1,stopped:!!stopped,
   completed:this.completed,total:this.options.episodes,
   role:this.options.role,enemyRole:this.options.enemyRole,
   arena:this.options.arena,seed:this.options.seed,initial:this.baseline,after,
   wins:this.wins,damage:this.damage,updates:this.policy.updates,
   generations:copy(this.generations),history:copy(this.history),
   model:this.policy.serialize(),ppo:this.lastPpo,
   protocol:{generationSize:LEAGUE_GENERATION_SIZE,
    archivesAreFrozen:true,trainingArenas:'open, cover, hazards',
    validation:'6 frozen games on 3 arenas with fixed, non-training seeds',
    note:'A small holdout is illustrative, not proof of statistically significant improvement.'}};
 }
}
