// Reproducible, side-effect-free learning comparison.
// Q-learning / online actor-critic / PPO train from fresh brains on identical
// maps, starts and episode budgets; only frozen copies are used in evaluation.
import {QAgent,createScenario,playEpisode,seeded} from './lab-core.mjs';
import {NeuralActorCritic} from './neural-policy.mjs';
import {PpoPolicy,PpoTrainer,ppoEpisode} from './ppo.mjs';

export const BENCHMARK_ALGORITHMS=Object.freeze(['qlearning','neural','ppo']);
export const BENCHMARK_OPTIONS=Object.freeze({episodes:40,maxSteps:120,runs:1,scenario:'corridor',seed:4093});
const SCENARIOS=new Set(['corridor','maze','hazards','rewards','switchback','rooms']);

export function validateBenchmarkOptions(options={}){
 const result={...BENCHMARK_OPTIONS,...options};
 if(!SCENARIOS.has(result.scenario))throw Error('Неподдерживаемая карта');
 for(const [key,min,max] of [['episodes',10,200],['maxSteps',40,320],['runs',1,3],['seed',1,2147483647]]){
  if(!Number.isSafeInteger(result[key])||result[key]<min||result[key]>max)
   throw Error('Неверный параметр: '+key);
 }
 if(![1,3].includes(result.runs))throw Error('Доступны 1 или 3 независимых запуска');
 return result;
}
function candidate(scene,rng){
 const w=scene.grid[0].length,h=scene.grid.length;
 for(let n=0;n<120;n++){
  const x=1+Math.floor(rng()*(w-2)),y=1+Math.floor(rng()*(h-2));
  if(scene.grid[y][x]!==1&&Math.abs(x-scene.goal[0])+Math.abs(y-scene.goal[1])>4)
   return [x,y];
 }
 return scene.spawn.slice();
}
export function benchmarkPlan(options={}){
 const p=validateBenchmarkOptions(options),runs=[];
 for(let run=0;run<p.runs;run++){
  const baseSeed=p.seed+run*15427;
  const trainingScene=createScenario(p.scenario,baseSeed);
  const spawnRng=seeded(baseSeed+77);
  const starts=Array.from({length:p.episodes},(_,i)=>i===0?trainingScene.spawn.slice():candidate(trainingScene,spawnRng));
  // Holdout is disjoint from the training scene seed, and includes unfamiliar
  // layouts as well as different unseen maps of the same task family.
  const alternate=p.scenario==='hazards'?'rooms':'hazards',evaluations=[];
  for(const [family,count,offset] of [[p.scenario,12,110001],[alternate,6,210001]]){
   for(let i=0;i<count;i++){
    const scene=createScenario(family,baseSeed+offset+i*71);
    const spawn=i%3===0?scene.spawn.slice():candidate(scene,seeded(baseSeed+offset+i*307));
    evaluations.push({family,scene,spawn});
   }
  }
  runs.push({seed:baseSeed,trainingScene,starts,evaluations});
 }
 return {options:p,runs};
}
function newPolicy(kind,seed){
 if(kind==='ppo')return new PpoPolicy(seed);
 if(kind==='neural')return new NeuralActorCritic(seed);
 return new QAgent(seed);
}
export function evaluateFrozen(kind,snapshot,evaluations,maxSteps,seed=1){
 const policy=newPolicy(kind,seed);policy.load(snapshot);
 let successes=0,reward=0,steps=0;
 const families={};
 for(const item of evaluations){
  const out=playEpisode(policy,item.scene,{learn:false,spawn:item.spawn,maxSteps});
  successes+=Number(out.success);reward+=out.reward;steps+=out.steps;
  const current=families[item.family]??{count:0,wins:0,reward:0};
  current.count++;current.wins+=Number(out.success);current.reward+=out.reward;
  families[item.family]=current;
 }
 const n=evaluations.length;
 return {
  count:n,wins:successes,winRate:successes/n,meanReward:reward/n,meanSteps:steps/n,
  byFamily:Object.fromEntries(Object.entries(families).map(([name,x])=>
   [name,{count:x.count,wins:x.wins,winRate:x.wins/x.count,meanReward:x.reward/x.count}]))
 };
}
const average=(xs,key)=>xs.reduce((sum,x)=>sum+x[key],0)/xs.length;
export function summarizeBenchmark(report){
 const entries={};
 for(const algorithm of BENCHMARK_ALGORITHMS){
  const runs=report.runs.map(run=>run.results[algorithm]);
  entries[algorithm]={
   algorithm,
   before:{winRate:average(runs.map(x=>x.before),'winRate'),meanReward:average(runs.map(x=>x.before),'meanReward')},
   after:{winRate:average(runs.map(x=>x.after),'winRate'),meanReward:average(runs.map(x=>x.after),'meanReward')},
   deltaWinRate:average(runs.map(x=>x.after),'winRate')-average(runs.map(x=>x.before),'winRate'),
   deltaReward:average(runs.map(x=>x.after),'meanReward')-average(runs.map(x=>x.before),'meanReward'),
   meanTrainMs:average(runs,'trainMs'),meanTrainingSteps:average(runs,'trainingSteps'),
   stepsPerSecond:average(runs,'stepsPerSecond'),
   meanUpdates:average(runs,'updates'),
   byFamily:Object.fromEntries(Object.keys(runs[0].after.byFamily).map(f=>[
    f,{winRate:average(runs.map(x=>x.after.byFamily[f]),'winRate'),
       initialRate:average(runs.map(x=>x.before.byFamily[f]),'winRate')}
   ]))
  };
 }
 return entries;
}
export async function runBenchmark(input={},hooks={}){
 const {options,runs}=benchmarkPlan(input),now=hooks.now??(()=>performance.now());
 const aborted=()=>hooks.cancelled?.()===true;
 const tick=hooks.yield??(()=>new Promise(resolve=>setTimeout(resolve,0)));
 const report={schema:1,type:'petri-forge-learning-benchmark',
  options,protocol:{trainSeedDifferentFromHoldout:true,metric:'paired, frozen holdout win-rate and average reward',
   training:'same scene, starting positions and episode count per algorithm',
   note:'Different algorithms may consume different numbers of environment steps; wall time depends on hardware. No guaranteed improvement.'},
  runs:[],completed:false};
 const total=options.runs*BENCHMARK_ALGORITHMS.length*options.episodes;
 let done=0;
 for(const plan of runs){
  const results={};
  for(const kind of BENCHMARK_ALGORITHMS){
   if(aborted())throw Error('Сравнение остановлено');
   const policy=newPolicy(kind,plan.seed+19);
   const before=evaluateFrozen(kind,policy.serialize(),plan.evaluations,options.maxSteps,plan.seed+888);
   const trainer=kind==='ppo'?new PpoTrainer(policy,{seed:plan.seed+81,rolloutSteps:256}):null;
   const start=now();
   let trainingSteps=0,lastPpo=null;
   for(let episode=0;episode<options.episodes;episode++){
    if(aborted())throw Error('Сравнение остановлено');
    const settings={maxSteps:options.maxSteps,spawn:plan.starts[episode],learn:true};
    const result=trainer?ppoEpisode(trainer,plan.trainingScene,settings):playEpisode(policy,plan.trainingScene,settings);
    trainingSteps+=result.steps;
    if(trainer?.ready)lastPpo=trainer.optimize();
    done++;
    if(episode%4===3||episode===options.episodes-1){
     hooks.onProgress?.({completed:done,total,algorithm:kind,run:report.runs.length+1,episode:episode+1});
     await tick();
    }
   }
   if(trainer?.buffer.length)lastPpo=trainer.optimize();
   const trainMs=Math.max(.001,now()-start);
   const after=evaluateFrozen(kind,policy.serialize(),plan.evaluations,options.maxSteps,plan.seed+888);
   results[kind]={before,after,trainMs,trainingSteps,stepsPerSecond:trainingSteps*1000/trainMs,
    updates:policy.updates??0,ppo:lastPpo?{approxKL:lastPpo.approxKL,clipFraction:lastPpo.clipFraction}:null};
   hooks.onResult?.({algorithm:kind,run:report.runs.length+1,results:results[kind]});
   await tick();
  }
  report.runs.push({seed:plan.seed,holdoutCases:plan.evaluations.map(x=>({family:x.family,spawn:x.spawn})),results});
 }
 report.summary=summarizeBenchmark(report);
 report.completed=true;
 return report;
}
