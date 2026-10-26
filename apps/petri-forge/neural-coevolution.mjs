// Two distinct PPO policies co-evolve inside the SAME Combat Forge battle.
// Both policies record their own on-policy transitions before either optimizer
// is updated. Frozen snapshots are used only in generation evaluations.
import {PpoPolicy,PpoTrainer,validatePpoPolicy} from './ppo.mjs';
import {NEURAL_ARENAS,battleNeuralEpisode,runCombatEvaluation} from './neural-combat.mjs';

export const COEVOLUTION_GENERATION_SIZE=6;
export const COEVOLUTION_MAX_SNAPSHOTS=6;
const roles=['archer','swordsman'];
const clone=x=>structuredClone(x);
function roleIsValid(role){return roles.includes(role);}
export function validateCoevolution(input={}){
 const episodes=input.episodes??12,seed=input.seed??411;
 if(!Number.isInteger(episodes)||episodes<6||episodes>150||episodes%6!==0)
  throw Error('Для совместной эволюции выберите 6–150 боёв, кратно шести');
 if(!Number.isSafeInteger(seed)||seed<1||seed>1e9)throw Error('Некорректный seed');
 const roleA=input.roleA??'archer',roleB=input.roleB??'swordsman',arena=input.arena??'cover';
 if(!roleIsValid(roleA)||!roleIsValid(roleB)||roleA===roleB)
  throw Error('Для совместного обучения нужны два разных класса');
 if(!NEURAL_ARENAS.includes(arena))throw Error('Неизвестная арена');
 if(input.snapshotA!=null&&!validatePpoPolicy(input.snapshotA))throw Error('Неверная модель первого бойца');
 if(input.snapshotB!=null&&!validatePpoPolicy(input.snapshotB))throw Error('Неверная модель второго бойца');
 return {episodes,seed,roleA,roleB,arena,snapshotA:input.snapshotA??null,snapshotB:input.snapshotB??null};
}
export function coevolutionPlan(index,opts){
 if(!Number.isInteger(index)||index<0||index>=opts.episodes)throw Error('Некорректный номер матча');
 const arenas=[opts.arena,...NEURAL_ARENAS.filter(a=>a!==opts.arena)];
 return {episode:index+1,side:index%2,arena:arenas[Math.floor(index/2)%3],
  seed:opts.seed+Math.floor(index/2)*907};
}
function snapshotPolicy(model,seed){const p=new PpoPolicy(seed);p.load(model);return p;}
export function evaluateCoevolution(a,b,opts){
 const first=snapshotPolicy(a,opts.seed+9001),second=snapshotPolicy(b,opts.seed+9002);
 const arenas={},all=[];
 for(let i=0;i<3;i++){
  const arena=NEURAL_ARENAS[i],legs=[];
  for(let side=0;side<2;side++){
   const e=battleNeuralEpisode({role:opts.roleA,enemyRole:opts.roleB,
    arena,seed:opts.seed+700001+i*3301,side,policy:first,opponent:second,
    maxSeconds:18,stochastic:false});
   legs.push({winA:Number(e.won),winB:Number(e.winner===1-side),
    draw:Number(e.draw),damageA:e.damage,damageB:e.taken});
  }
  arenas[arena]={winsA:legs.reduce((n,e)=>n+e.winA,0),
   winsB:legs.reduce((n,e)=>n+e.winB,0),
   draws:legs.reduce((n,e)=>n+e.draw,0),count:2};
  all.push(...legs);
 }
 // Independent fixed-seed checks against the old heuristic rather than
 // claiming two co-evolving policies' zero-sum win rates are absolute gains.
 const fixed={};
 for(const role of [opts.roleA,opts.roleB]){
  const model=role===opts.roleA?a:b,enemyRole=role===opts.roleA?opts.roleB:opts.roleA;
  const values=NEURAL_ARENAS.map((arena,i)=>runCombatEvaluation(model,
   {role,enemyRole,arena,seed:opts.seed+820001+i*1501,count:2}));
  fixed[role]={winRate:values.reduce((n,v)=>n+v.wins,0)/6,
   wins:values.reduce((n,v)=>n+v.wins,0),count:6,
   damage:values.reduce((n,v)=>n+v.damage,0)/3};
 }
 return {count:6,winRateA:all.reduce((n,e)=>n+e.winA,0)/6,
  winRateB:all.reduce((n,e)=>n+e.winB,0)/6,
  draws:all.reduce((n,e)=>n+e.draw,0),arenas,fixed};
}
export class NeuralCoevolution {
 constructor(options={}){
  this.options=validateCoevolution(options);
  const o=this.options;
  this.a=new PpoPolicy(o.seed+17);this.b=new PpoPolicy(o.seed+71);
  if(o.snapshotA)this.a.load(o.snapshotA);
  if(o.snapshotB)this.b.load(o.snapshotB);
  this.trainerA=new PpoTrainer(this.a,{seed:o.seed+131,rolloutSteps:256});
  this.trainerB=new PpoTrainer(this.b,{seed:o.seed+173,rolloutSteps:256});
  this.completed=0;this.finished=false;this.history=[];this.generations=[];
  this.pool=[];
  this.lastMetricsA=null;this.lastMetricsB=null;
  this.initial=evaluateCoevolution(this.a.serialize(),this.b.serialize(),o);
  this.generations.push({generation:0,episodes:0,updatesA:this.a.updates,
   updatesB:this.b.updates,evaluation:this.initial});
  this.pool.push({generation:0,a:clone(this.a.serialize()),b:clone(this.b.serialize())});
 }
 checkpoint(){
  if(this.trainerA.buffer.length)this.lastMetricsA=this.trainerA.optimize();
  if(this.trainerB.buffer.length)this.lastMetricsB=this.trainerB.optimize();
  const generation=this.generations.length;
  const snapA=clone(this.a.serialize()),snapB=clone(this.b.serialize());
  const evaluation=evaluateCoevolution(snapA,snapB,this.options);
  this.generations.push({generation,episodes:this.completed,
   updatesA:this.a.updates,updatesB:this.b.updates,evaluation});
  this.pool.push({generation,a:snapA,b:snapB});
  if(this.pool.length>COEVOLUTION_MAX_SNAPSHOTS)this.pool.splice(1,1);
  return this.generations.at(-1);
 }
 step(){
  if(this.finished||this.completed>=this.options.episodes)throw Error('Совместное обучение уже завершено');
  const o=this.options,p=coevolutionPlan(this.completed,o);
  const battle=battleNeuralEpisode({role:o.roleA,enemyRole:o.roleB,arena:p.arena,
   seed:p.seed,side:p.side,policy:this.a,opponent:this.b,
   learn:this.trainerA,learnOpponent:this.trainerB,maxSeconds:18});
  this.completed++;
  const winner=battle.draw?'draw':battle.won?'a':'b';
  this.history.push({episode:this.completed,arena:p.arena,side:p.side,
   winner,damageA:battle.damage,damageB:battle.taken,rewardA:battle.reward});
  if(this.trainerA.ready)this.lastMetricsA=this.trainerA.optimize();
  if(this.trainerB.ready)this.lastMetricsB=this.trainerB.optimize();
  const generation=this.completed%COEVOLUTION_GENERATION_SIZE===0?this.checkpoint():null;
  return {completed:this.completed,total:o.episodes,winner,arena:p.arena,
   updatesA:this.a.updates,updatesB:this.b.updates,generation};
 }
 finish(stopped=false){
  if(this.finished)throw Error('Совместное обучение уже завершено');
  if(this.completed>this.generations.at(-1).episodes)this.checkpoint();
  this.finished=true;
  return {schema:1,type:'neural-combat-coevolution',stopped:!!stopped,
   completed:this.completed,total:this.options.episodes,
   roleA:this.options.roleA,roleB:this.options.roleB,seed:this.options.seed,
   arena:this.options.arena,initial:this.initial,
   after:this.generations.at(-1).evaluation,
   modelA:this.a.serialize(),modelB:this.b.serialize(),
   generations:clone(this.generations),history:clone(this.history),
   ppoA:this.lastMetricsA,ppoB:this.lastMetricsB,
   protocol:{bothSidesLearn:true,pairedSides:true,generationSize:6,
    fixedValidationSeeds:true,modelArchiveBound:COEVOLUTION_MAX_SNAPSHOTS,
    caveat:'Mutual win rates are zero-sum; fixed baseline evaluations better indicate absolute improvement, but six holdout games are not statistically conclusive.'}};
 }
}
