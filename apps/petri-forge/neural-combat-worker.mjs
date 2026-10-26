// Independent combat training worker; never mutates a saved profile directly.
import {PpoPolicy,PpoTrainer} from './ppo.mjs';
import {combatTrainingOptions,battleNeuralEpisode,runCombatEvaluation,neuralDuel} from './neural-combat.mjs';
let job=null,jobId=0;
const emit=(type,fields={})=>postMessage({type,...fields});
const finish=(stopped=false)=>{
 const current=job;if(!current)return;job=null;
 if(current.trainer.buffer.length)current.lastPpo=current.trainer.optimize();
 const model=current.policy.serialize();
 const validation=runCombatEvaluation(model,{role:current.options.role,enemyRole:current.options.enemyRole,
  arena:current.options.arena,seed:current.options.seed+500061,enemySnapshot:current.options.enemySnapshot,count:6});
 emit(stopped?'stopped':'trained',{model,completed:current.completed,episodes:current.options.episodes,
  wins:current.wins,damage:current.damage,history:current.history,
  baseline:current.baseline,validation,ppo:current.lastPpo});
};
function train(){
 const current=job;if(!current)return;
 try{
  const {options,policy,trainer}=current;
  const index=current.completed;
  if(index>=options.episodes){finish();return;}
  const enemy=options.enemySnapshot?new PpoPolicy(options.seed+97):null;
  if(enemy)enemy.load(options.enemySnapshot);
  const result=battleNeuralEpisode({role:options.role,enemyRole:options.enemyRole,arena:options.arena,
   policy,opponent:enemy,learn:trainer,side:index%2,seed:options.seed+index*907,maxSeconds:18});
  if(trainer.ready)current.lastPpo=trainer.optimize();
  current.completed++;current.wins+=Number(result.won);current.damage+=result.damage;
  current.history.push({episode:current.completed,won:result.won,reward:result.reward,damage:result.damage});
  emit('progress',{completed:current.completed,episodes:options.episodes,wins:current.wins,
   averageDamage:current.damage/current.completed,updates:policy.updates,ppo:current.lastPpo});
  setTimeout(train,0);
 }catch(error){job=null;emit('error',{message:String(error.message||error)});}
}
onmessage=({data})=>{
 const {type,payload={}}=data||{};
 try{
  if(type==='train'){
   if(job)throw Error('Нейробой уже обучается');
   const options=combatTrainingOptions(payload),policy=new PpoPolicy(options.seed+19);
   if(options.snapshot)policy.load(options.snapshot);
   const baseline=runCombatEvaluation(policy.serialize(),{role:options.role,enemyRole:options.enemyRole,
    arena:options.arena,seed:options.seed+500061,enemySnapshot:options.enemySnapshot,count:6});
   job={options,policy,trainer:new PpoTrainer(policy,{seed:options.seed+31,rolloutSteps:256}),
    completed:0,wins:0,damage:0,history:[],baseline,lastPpo:null,id:++jobId};
   emit('started',{episodes:options.episodes,baseline});
   setTimeout(train,0);
  }else if(type==='stop'){if(job)finish(true);}
  else if(type==='duel'){
   if(job)throw Error('Нужно закончить обучение');
   const match=neuralDuel({a:payload.a,b:payload.b,roleA:payload.roleA,roleB:payload.roleB,
    arena:payload.arena,seed:payload.seed??41,legs:payload.legs??4});
   emit('duel',{match});
  }
 }catch(error){emit('error',{message:String(error.message||error)});}
};
