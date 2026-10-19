import {ACTIONS,RandomAgent,createScenario,GridEnvironment,makeAgent,playEpisode,seeded,validateScene} from './lab-core.mjs';

let agent=makeAgent('qlearning',17),kind='qlearning',active=null,jobId=0;
const emit=(type,data={})=>postMessage({type,...data});
function trainBatch(){
  const job=active;
  if(!job)return;
  try{
    for(let j=0;j<14&&job.complete<job.episodes;j++){
      if(active!==job)return;
      const episode=job.complete;
      const spawn=episode===0?null:pickSpawn(job.scene,job.random);
      const episodeOptions={learn:true,maxSteps:job.maxSteps,spawn,trace:episode%25===0};
      // First episode tests the authored spawn, the rest train on varied feasible starts.
      const result=playEpisode(agent,job.scene,episodeOptions);
      job.complete++;job.successes+=Number(result.success);job.totalReward+=result.reward;job.totalSteps+=result.steps;
      job.window.push(Number(result.success));if(job.window.length>80)job.window.shift();
      if(result.trace){
        const candidate={trace:result.trace,scene:job.scene,episode:job.complete,success:result.success,reward:result.reward};
        if(!job.best||result.reward>job.best.reward)job.best=candidate;
        if(!job.worst||result.reward<job.worst.reward)job.worst=candidate;
        for(const p of result.trace)job.heat[p.y*job.scene.grid[0].length+p.x]++;
      }
    }
    if(job.complete%42<14||job.complete===job.episodes){
      job.history.push({episode:job.complete,rate:Math.round(100*job.window.reduce((a,b)=>a+b,0)/job.window.length),average:job.totalReward/job.complete});
      if(job.history.length>160)job.history.shift();
      emit('progress',{complete:job.complete,episodes:job.episodes,success:job.successes/job.complete,average:job.totalReward/job.complete,steps:job.totalSteps/job.complete,history:job.history,heat:job.heat});
    }
    if(job.complete>=job.episodes){
      active=null;
      emit('trained',{complete:job.complete,episodes:job.episodes,success:job.successes/job.complete,average:job.totalReward/job.complete,steps:job.totalSteps/job.complete,history:job.history,heat:job.heat,best:job.best,worst:job.worst,snapshot:agent.serialize()});
    }else setTimeout(trainBatch,0);
  }catch(error){active=null;emit('error',{message:String(error.message||error)});}
}
function pickSpawn(scene,r){
  for(let i=0;i<80;i++){
    const x=1+Math.floor(r()*(scene.grid[0].length-2));
    const y=1+Math.floor(r()*(scene.grid.length-2));
    if(scene.grid[y][x]!==1 && (Math.abs(x-scene.goal[0])+Math.abs(y-scene.goal[1])>3))return [x,y];
  }
  return scene.spawn;
}
function metrics(results){return {count:results.length,success:results.filter(x=>x.success).length/results.length,average:results.reduce((n,x)=>n+x.reward,0)/results.length,steps:results.reduce((n,x)=>n+x.steps,0)/results.length};}
function testAgent(scene,seed,count,snapshot){
  const evaluator=makeAgent(kind,seed+932);if(kind==='qlearning')evaluator.load(snapshot);
  const r=seeded(seed),results=[];
  for(let i=0;i<count;i++)results.push(playEpisode(evaluator,scene,{spawn:i===0?undefined:pickSpawn(scene,r),learn:false,trace:i===0}));
  return {metrics:metrics(results),replay:{scene,trace:results[0].trace,success:results[0].success,reward:results[0].reward}};
}
onmessage=event=>{
  const {type,payload={}}=event.data||{};
  try{
    if(type==='loadAgent'){
      if(active)throw Error('Остановите обучение перед сменой модели');
      kind=payload.name==='random'?'random':'qlearning';
      agent=makeAgent(kind,Number(payload.seed)||17);
      if(payload.snapshot&&kind==='qlearning')agent.load(payload.snapshot);
      emit('loaded',{kind,states:agent.q?.size||0});
    }else if(type==='act'){
      if(active)return;
      const action=agent.act(payload.obs,false);
      emit('action',{action});
    }else if(type==='learn'){
      if(active)return;
      agent.learn?.(payload.tr.s,payload.tr.a,payload.tr.r,payload.tr.s2,payload.tr.done);
    }else if(type==='train'){
      if(active)throw Error('Обучение уже выполняется');
      if(kind==='random')throw Error('Random не обучается: выберите Q-learning');
      const scene=validateScene(payload.scene);
      const episodes=Math.min(5000,Math.max(1,Math.floor(Number(payload.episodes)||400)));
      const maxSteps=Math.min(800,Math.max(30,Math.floor(Number(payload.maxSteps)||320)));
      const random=seeded(Number(payload.seed)||41);
      active={scene,episodes,maxSteps,random,complete:0,successes:0,totalReward:0,totalSteps:0,window:[],history:[],heat:Array(scene.grid.length*scene.grid[0].length).fill(0),best:null,worst:null};
      emit('training',{episodes});
      setTimeout(trainBatch,0);
    }else if(type==='stop'){
      if(active){const job=active;active=null;emit('stopped',{complete:job.complete,episodes:job.episodes,success:job.complete?job.successes/job.complete:0,average:job.complete?job.totalReward/job.complete:0,steps:job.complete?job.totalSteps/job.complete:0,history:job.history,heat:job.heat,best:job.best,worst:job.worst,snapshot:agent.serialize()});}
    }else if(type==='snapshot'){
      emit('snapshot',{snapshot:agent.serialize()});
    }else if(type==='evaluate'){
      if(active)throw Error('Сначала остановите обучение');
      const scene=validateScene(payload.scene),seed=(Number(payload.seed)||9101)>>>0;
      const snapshot=agent.serialize(),base=testAgent(scene,seed,20,snapshot);
      const scenarioId=payload.scenarioId||'corridor';
      const holdouts=[];
      for(let i=0;i<10;i++){
        const unseen=createScenario(scenarioId,seed+101+i*37);
        holdouts.push(testAgent(unseen,seed+200+i*19,3,snapshot).metrics);
      }
      emit('evaluated',{train:base.metrics,holdout:{count:30,success:holdouts.reduce((n,m)=>n+m.success*m.count,0)/30,average:holdouts.reduce((n,m)=>n+m.average*m.count,0)/30,steps:holdouts.reduce((n,m)=>n+m.steps*m.count,0)/30},replay:base.replay});
    }
  }catch(error){emit('error',{message:String(error.message||error)});}
};
