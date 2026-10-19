// Curriculum self-play on the native Perekos engine. Both train and holdout use real physics.
import {createPerekosPolicy,validatePerekosPolicy,mutatePerekosPolicy,MAGE_CHOICES} from './perekos-policy.mjs';
import {trainingSettings,runPerekosEpisode,trainingCases,holdoutCases,evaluatePerekosPolicy} from './perekos-training.mjs';
let policy=createPerekosPolicy(41),job=null;
const emit=(type,data={})=>postMessage({type,...data});
const clone=value=>structuredClone(value);
function finish(j){
 if(job!==j)return;
 job=null;
 const rounds=holdoutCases(j.cfg,'round'),matches=holdoutCases(j.cfg,'match');
 const roundBaseline=evaluatePerekosPolicy(j.initial,rounds,j.cfg);
 let selected=j.best,roundValidation=evaluatePerekosPolicy(selected,rounds,j.cfg);
 const rolledBack=roundValidation.fitness<roundBaseline.fitness-.5;
 if(rolledBack){selected=j.initial;roundValidation=roundBaseline;}
 const baseline=evaluatePerekosPolicy(j.initial,matches,j.cfg);
 const validation=rolledBack?baseline:evaluatePerekosPolicy(selected,matches,j.cfg);
 policy=clone(selected);
 const replay=runPerekosEpisode(policy,{seed:(600101+j.cfg.seed)>>>0,mage:j.cfg.mage,opponent:j.cfg.opponent,rival:'native',mode:'match',limitTicks:9000,record:true});
 emit('perekos-trained',{policy,accepted:j.accepted,history:j.history,baseline,validation,roundBaseline,roundValidation,rolledBack,leagueSize:j.league.length,replay});
}
function iterate(){
 const j=job;if(!j)return;
 try{
  const index=j.done,seed=(j.cfg.seed+index*1409+10)>>>0;
  const cases=trainingCases(j.cfg,index,j.total,j.league);
  const challenger=mutatePerekosPolicy(j.best,seed+79,Math.max(.07,.32*(1-index/j.total)));
  const candidate=evaluatePerekosPolicy(challenger,cases,j.cfg,j.league);
  const incumbent=evaluatePerekosPolicy(j.best,cases,j.cfg,j.league);
  const accepted=candidate.fitness>incumbent.fitness+.04;
  if(accepted){j.league.push(clone(j.best));if(j.league.length>8)j.league.shift();j.best=challenger;j.accepted++;}
  j.done++;const best=accepted?candidate:incumbent;
  j.history.push({generation:j.done,fitness:best.fitness,accepted:j.accepted,roundWinRate:best.roundWinRate,rival:cases.map(x=>x.rival).join(' / '),damageMargin:best.damageMargin});
  emit('perekos-progress',{complete:j.done,total:j.total,accepted:j.accepted,fitness:best.fitness,rival:cases.map(x=>x.rival).join(' + '),roundWinRate:best.roundWinRate,damageMargin:best.damageMargin,history:j.history});
  if(j.done>=j.total)finish(j);else if(job===j)setTimeout(iterate,0);
 }catch(e){job=null;emit('perekos-error',{message:String(e.message||e)});}
}
onmessage=({data})=>{
 const {type,payload={}}=data||{};
 try{
  if(type==='perekos-train'){
   if(job)throw Error('Тренировка уже идёт');
   const cfg=trainingSettings(payload),total=Math.max(1,Math.min(30,Math.floor(Number(payload.generations)||4)));
   const initial=validatePerekosPolicy(payload.policy)?clone(payload.policy):clone(policy);
   job={cfg,total,done:0,accepted:0,initial,best:clone(initial),league:[clone(initial)],history:[]};
   emit('perekos-started',{total,curriculum:cfg.curriculum});setTimeout(iterate,0);
  }else if(type==='perekos-stop'){
   if(job){const j=job;job=null;policy=clone(j.best);emit('perekos-stopped',{policy,complete:j.done,total:j.total,accepted:j.accepted,history:j.history,leagueSize:j.league.length});}
  }else if(type==='perekos-test'){
   if(job)throw Error('Сначала остановите тренировку');
   const cfg=trainingSettings(payload);if(validatePerekosPolicy(payload.policy))policy=clone(payload.policy);
   const rival=['native','dummy','charger','balanced','aggressive','evasive','defensive'].includes(payload.rivalStyle)?payload.rivalStyle:'native';
   const replay=runPerekosEpisode(policy,{seed:cfg.seed,mage:cfg.mage,opponent:cfg.opponent,rival,mode:'match',record:true,limitTicks:9000});
   emit('perekos-tested',{policy,replay});
  }else if(type==='perekos-tournament'){
   if(job)throw Error('Сначала остановите тренировку');
   const cfg=trainingSettings(payload);
   const table=['native','aggressive','evasive','defensive'].map((style,i)=>{
    const cases=Array.from({length:3},(_,j)=>({seed:(cfg.seed+50001+i*1501+j*31)>>>0,rival:style,opponent:MAGE_CHOICES[(i+j)%MAGE_CHOICES.length].id,mode:'round'}));
    const x=evaluatePerekosPolicy(policy,cases,cfg);
    return {style,wins:x.roundWins,losses:x.roundLosses,draws:x.roundDraws,completed:x.completedRounds,total:3,fitness:x.fitness,damageMargin:x.damageMargin};
   });
   emit('perekos-tournament',{table});
  }else if(type==='perekos-compare'){
   if(job)throw Error('Остановите обучение');
   if(!validatePerekosPolicy(payload.other))throw Error('Некорректная сравниваемая модель');
   const cfg=trainingSettings(payload),cases=holdoutCases(cfg,'round');
   emit('perekos-compared',{mine:evaluatePerekosPolicy(policy,cases,cfg),other:evaluatePerekosPolicy(payload.other,cases,cfg)});
  }else if(type==='perekos-load'){
   if(job)throw Error('Нельзя менять модель во время обучения');
   if(!validatePerekosPolicy(payload.policy))throw Error('Некорректный мозг Перекоса');
   policy=clone(payload.policy);emit('perekos-loaded',{policy});
  }else if(type==='perekos-reset'){
   if(job)throw Error('Остановите обучение');
   policy=createPerekosPolicy(41);emit('perekos-loaded',{policy});
  }else if(type==='perekos-snapshot')emit('perekos-snapshot',{policy});
 }catch(e){emit('perekos-error',{message:String(e.message||e)});}
};