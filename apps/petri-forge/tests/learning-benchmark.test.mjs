import test from 'node:test';
import assert from 'node:assert/strict';
import {benchmarkPlan,validateBenchmarkOptions,evaluateFrozen,runBenchmark,BENCHMARK_ALGORITHMS} from '../learning-benchmark.mjs';
import {QAgent} from '../lab-core.mjs';
const compact=report=>report.runs.map(run=>
 BENCHMARK_ALGORITHMS.map(kind=>({
  before:run.results[kind].before,after:run.results[kind].after,
  steps:run.results[kind].trainingSteps,updates:run.results[kind].updates
 })));
test('benchmark enforces supported tasks and finite bounded workloads',()=>{
 for(const input of [{scenario:'hacked'},{episodes:9999},{episodes:0},{runs:2},{maxSteps:1},{seed:0}]){
  assert.throws(()=>validateBenchmarkOptions(input));
 }
 const options=validateBenchmarkOptions({scenario:'hazards',episodes:10,maxSteps:40,runs:3});
 assert.equal(options.runs,3);
 const plan=benchmarkPlan(options);
 assert.equal(plan.runs.length,3);
 assert.deepEqual(plan.runs[0].starts[0],plan.runs[0].trainingScene.spawn);
 assert.equal(plan.runs[0].evaluations.length,18);
 for(const run of plan.runs){
  assert.equal(run.starts.length,10);
  assert.equal(run.evaluations.filter(e=>e.family==='hazards').length,12);
  assert.equal(run.evaluations.filter(e=>e.family==='rooms').length,6);
 }
});
test('same seed gives same train and holdout positions, and holdout excludes the train scene',()=>{
 const a=benchmarkPlan({episodes:10}),b=benchmarkPlan({episodes:10});
 assert.deepEqual(a,b);
 const run=a.runs[0];
 assert.notDeepEqual(run.trainingScene,run.evaluations[0].scene);
 const q=new QAgent(99);
 const original=q.serialize();
 const before=evaluateFrozen('qlearning',original,run.evaluations,40,33);
 const after=evaluateFrozen('qlearning',original,run.evaluations,40,33);
 assert.deepEqual(after,before);
 assert.deepEqual(q.serialize(),original,'frozen evaluation must not mutate the original checkpoint');
 assert.equal(after.count,18);
});
test('fair three-way comparison produces actual pre/post outcomes, steps and reproducible summaries',async()=>{
 const opts={episodes:10,maxSteps:40,scenario:'corridor',seed:7242,runs:1};
 const progress=[];
 const a=await runBenchmark(opts,{now:(()=>{let n=0;return ()=>++n;})(),yield:async()=>{},onProgress:p=>progress.push(p)});
 assert.equal(a.completed,true);
 assert.deepEqual(Object.keys(a.summary),['qlearning','neural','ppo']);
 assert.equal(a.runs.length,1);
 assert.equal(progress.at(-1).completed,30);
 for(const kind of BENCHMARK_ALGORITHMS){
  const entry=a.summary[kind],raw=a.runs[0].results[kind];
  assert.equal(raw.before.count,18);
  assert.equal(raw.after.count,18);
  assert.ok(raw.trainingSteps>0&&raw.trainingSteps<=400);
  assert.ok(raw.trainMs>0&&Number.isFinite(raw.stepsPerSecond));
  assert.ok(entry.after.winRate>=0&&entry.after.winRate<=1);
  assert.ok(Number.isFinite(entry.deltaReward));
 }
 assert.ok(a.runs[0].results.ppo.updates>0);
 assert.ok(a.runs[0].results.neural.updates>0);
 const b=await runBenchmark(opts,{now:(()=>{let n=0;return ()=>++n;})(),yield:async()=>{}});
 assert.deepEqual(compact(b),compact(a),'same seeds and fair evaluation must reproduce learning outcomes');
});
test('cancel prevents partial benchmark from being labelled completed',async()=>{
 let stop=false,events=0;
 await assert.rejects(runBenchmark({episodes:10,maxSteps:40},{yield:async()=>{stop=true;},
  cancelled:()=>stop,onProgress:()=>{events++;}}),/остановлено/);
 assert.ok(events>0);
});
