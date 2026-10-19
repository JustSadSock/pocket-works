import {ARENAS,LOADOUTS,SKILLS,makePolicy,validPolicy,mutatePolicy,simulateBattle} from './combat-core.mjs';

let job=null,policy=makePolicy('aggressive',17);
const emit=(type,data={})=>postMessage({type,...data});
const validLoadout=loadout=>LOADOUTS[loadout]||Array.isArray(loadout)&&loadout.length>0&&loadout.length<=4&&loadout.every(k=>Object.hasOwn(SKILLS,k));
const validConfig=config=>ARENAS.some(a=>a.id===config?.arena)&&[1,2].includes(config?.teamSize)&&validLoadout(config?.ownLoadout)&&validLoadout(config?.enemyLoadout);

const evaluate=(policy,config,seed,episodes=4)=>{
 let score=0,wins=0,damage=0;
 for(let i=0;i<episodes;i++){
  const reverse=i%2===1,source=seed+i*1013;
  const opponent=makePolicy(['balanced','evasive','support','aggressive'][i%4],source+71);
  const policies=reverse?[opponent,policy]:[policy,opponent];
  const loadouts=reverse?[config.enemyLoadout,config.ownLoadout]:[config.ownLoadout,config.enemyLoadout];
  const {summary}=simulateBattle({arena:config.arena,teamSize:config.teamSize,seed:source,maxSeconds:config.maxSeconds||23,loadouts,policies});
  const team=reverse?1:0,other=1-team;
  const won=summary.winner===team;
  wins+=Number(won);damage+=summary.damage[team];
  const margin=summary.hp[team]-summary.hp[other];
  score+=(won?5:summary.winner===-1?0:-5)+margin*.026+Math.min(300,summary.damage[team])*.004;
 }
 return {score:score/episodes,winRate:wins/episodes,damage:damage/episodes};
};
function makeReplay(config,current,seed){
 const options={arena:config.arena,teamSize:config.teamSize,seed,maxSeconds:30,
 loadouts:[config.ownLoadout,config.enemyLoadout],policies:[current,makePolicy('balanced',seed+45)]};
 return simulateBattle(options,true);
}
function iterate(){
 const active=job;if(!active)return;
 try{
  for(let i=0;i<2&&active.step<active.iterations;i++){
   const step=active.step++;
   const seed=active.seed+step*3701;
   const candidate=mutatePolicy(active.best,seed+13,Math.max(.045,.28*(1-step/active.iterations)));
   const incumbent=evaluate(active.best,active.config,seed,4),trial=evaluate(candidate,active.config,seed,4);
   if(trial.score>incumbent.score){active.best=candidate;active.accepted++;}
   if(step%3===0||active.step===active.iterations){
    active.history.push({episode:active.step,rate:Math.round((trial.winRate)*100),average:Math.round(trial.score*100)/100});
    emit('combat-progress',{iteration:active.step,total:active.iterations,accepted:active.accepted,current:trial,best:active.best,history:active.history});
   }
  }
  if(active.step>=active.iterations){
   policy=active.best;job=null;
   const validation=evaluate(policy,active.config,490011+active.seed,12);
   const baseline=evaluate(active.original,active.config,490011+active.seed,12);
   emit('combat-trained',{policy,validation,baseline,history:active.history,accepted:active.accepted,
     replay:makeReplay(active.config,policy,active.seed+677)});
  }else setTimeout(iterate,0);
 }catch(error){job=null;emit('combat-error',{message:String(error.message||error)});}
}
onmessage=({data})=>{
 const {type,payload={}}=data||{};
 try{
  if(type==='combat-set'){
   if(job)throw Error('Сначала остановите обучение');
   if(!validPolicy(payload.policy))throw Error('Недопустимый мозг');
   policy=structuredClone(payload.policy);emit('combat-set-done',{policy});
  }else if(type==='combat-train'){
   if(job)throw Error('Обучение уже запущено');
   const config=payload.config;
   if(!validConfig(config))throw Error('Неверные правила боя');
   const iterations=Math.max(1,Math.min(100,Math.floor(Number(payload.iterations)||24)));
   const seed=(Number(payload.seed)>>>0)||1;
   job={config,iterations,seed,best:structuredClone(policy),original:structuredClone(policy),step:0,accepted:0,history:[]};
   emit('combat-started',{iterations});setTimeout(iterate,0);
  }else if(type==='combat-stop'){
   if(job){const current=job;job=null;policy=current.best;
    emit('combat-stopped',{iteration:current.step,total:current.iterations,policy,history:current.history,accepted:current.accepted});}
  }else if(type==='combat-test'){
   if(job)throw Error('Дождитесь завершения обучения');
   const config=payload.config,seed=(Number(payload.seed)>>>0)||1;
   if(!validConfig(config))throw Error('Неверные правила боя');
   const validation=evaluate(policy,config,seed+500000,12);
   emit('combat-tested',{validation,policy,replay:makeReplay(config,policy,seed+37)});
  }else if(type==='combat-tournament'){
   if(job)throw Error('Сначала остановите обучение');
   const config=payload.config,seed=(Number(payload.seed)>>>0)||7301;
   if(!validConfig(config))throw Error('Неверные правила боя');
   const table=['balanced','aggressive','evasive','support'].map((style,index)=>{
     let wins=0,points=0;
     for(let i=0;i<12;i++){
       const reverse=i%2===1,rival=makePolicy(style,seed+index*29+i*301),policies=reverse?[rival,policy]:[policy,rival];
       const loadouts=reverse?[config.enemyLoadout,config.ownLoadout]:[config.ownLoadout,config.enemyLoadout];
       const {summary}=simulateBattle({arena:config.arena,teamSize:config.teamSize,seed:seed+index*10003+Math.floor(i/2)*701,loadouts,policies,maxSeconds:30});
       const team=reverse?1:0;
       wins+=Number(summary.winner===team);
       points+=summary.damage[team]-summary.damage[1-team];
     }
     return {style,wins,total:12,winRate:wins/12,damageMargin:Math.round(points/12)};
   });
   emit('combat-tournament',{table});
  }else if(type==='combat-reset'){
   if(job)throw Error('Сначала остановите обучение');
   policy=makePolicy(payload.style||'aggressive',Number(payload.seed)||17);
   emit('combat-set-done',{policy});
  }else if(type==='combat-snapshot')emit('combat-snapshot',{policy});
 }catch(error){emit('combat-error',{message:String(error.message||error)});}
};
