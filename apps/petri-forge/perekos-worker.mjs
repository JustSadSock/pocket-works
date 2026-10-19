import {PerekosEnvironment} from './perekos-adapter.mjs';
import {createPerekosPolicy,validatePerekosPolicy,mutatePerekosPolicy,perekosControl,choosePerekosRune,seeded,MAGE_CHOICES} from './perekos-policy.mjs';
import {WALLS} from '../perekos/core.mjs';
let policy=createPerekosPolicy(41),job=null,settings={mage:'kindle',opponent:'pebble',seed:41};
const reply=(type,data={})=>postMessage({type,...data});
function config(data={}){
 const mage=MAGE_CHOICES.some(m=>m.id===data.mage)?data.mage:'kindle';
 const opponent=MAGE_CHOICES.some(m=>m.id===data.opponent)?data.opponent:'pebble';
 return {mage,opponent,seed:(Number(data.seed)>>>0)||41};
}
function snap(env,decision,enemyDecision){
 const s=env.state;
 return {t:env.steps/60,remaining:s.remaining,round:s.round,score:s.score.slice(),phase:s.phase,draws:s.draws,champion:s.champion,
  actors:s.actors.map(a=>({id:a.id,x:a.x,y:a.y,face:a.face,hp:a.hp,shield:a.shield,heat:a.heat,mageId:a.mageId,cast:a.cast,guard:a.guard,runes:a.runes.slice(),dash:a.dash})),
  shots:s.shots.slice(0,90).map(p=>({x:p.x,y:p.y,r:p.r,owner:p.owner,vx:p.vx,vy:p.vy})),
  mines:s.mines.slice(0,35).map(p=>({x:p.x,y:p.y,r:p.r,owner:p.owner})),
  barriers:s.barriers.slice(0,20).map(b=>({x:b.x,y:b.y,r:b.r})),
  fx:s.fx.slice(-18).map(f=>({x:f.x,y:f.y,k:f.k})),
  decision:decision?{x:decision.x,y:decision.y,attack:decision.attack,dash:decision.dash,shield:decision.shield,aim:decision.aim,meta:decision.meta}:null,
  enemyDecision:enemyDecision?{x:enemyDecision.x,y:enemyDecision.y,attack:enemyDecision.attack,shield:enemyDecision.shield}:null
 };
}
function play(model,seed,options={},record=false){
 const cfg=config(options),env=new PerekosEnvironment({seed,first:cfg.mage,second:cfg.opponent,limitTicks:9600});
 const rival=options.rivalPolicy||null;
 let reward=0,damage=0,frames=[],runePicks=[],fired=0,dodges=0,guarded=0;
 let prevRound=env.state.round,decision=null,enemyDecision=null;
 const maxSteps=Math.max(1000,Math.min(9600,options.limitTicks||8400));
 while(env.steps<maxSteps&&env.state.phase!=='result'){
  const obs=env.observe(0);
  if(obs.phase==='draft'){
   const draft=choosePerekosRune(obs,model);
   if(draft)runePicks.push(draft);
   const result=env.step({draft});reward+=result.reward;
   if(record)frames.push(snap(env,null,null));
  }else if(obs.phase==='build'){
   const result=env.step({});reward+=result.reward;
  }else{
   decision=perekosControl(obs,model,0,env.steps);
   enemyDecision=rival?perekosControl(env.observe(1),rival,1,env.steps):null;
   const result=env.step(decision,enemyDecision);
   reward+=result.reward;
   if(result.reward>0)damage+=result.reward;
   if(decision.attack)fired++;
   if(decision.shield)dodges++;
   if(decision.dash)guarded++;
   if(record&&(env.steps%24===0||env.state.round!==prevRound||env.state.phase!=='fight')&&frames.length<510)frames.push(snap(env,decision,enemyDecision));
   prevRound=env.state.round;
  }
 }
 const s=env.state,score=s.score[0]-s.score[1],health=s.actors[0].hp-s.actors[1].hp;
 const finished=s.phase==='result',won=finished&&s.champion===0;
 // Genuine combat score, no fictitious win bonus when the match was truncated.
 const fitness=score*10+health*.04+reward*.25+(won?18:finished&&s.champion===1?-18:0);
 if(record&&frames.length<512)frames.push(snap(env,decision,enemyDecision));
 return {fitness,won,finished,score:score,rounds:s.round,steps:env.steps,remaining:s.remaining,draws:s.draws,reward,
  hp:[s.actors[0].hp,s.actors[1].hp],draft:runePicks,shots:fired,shields:dodges,dashes:guarded,frames,winner:s.champion};
}
function evaluate(model,base,setting,count=2){
 let fitness=0,wins=0,finished=0,score=0,steps=0;
 const run=[];
 for(let i=0;i<count;i++){
  const enemy=MAGE_CHOICES[(i+base)%MAGE_CHOICES.length].id;
  const rival=i%2===0?createPerekosPolicy(base+i+90,'balanced'):createPerekosPolicy(base+i+29,'evasive');
  const result=play(model,(base+i*1901)>>>0,{...setting,opponent:enemy,rivalPolicy:rival,limitTicks:7200},false);
  fitness+=result.fitness;wins+=Number(result.won);finished+=Number(result.finished);score+=result.score;steps+=result.steps;
  run.push({enemy,fitness:result.fitness,won:result.won,finished:result.finished,score:result.score});
 }
 return {fitness:fitness/count,wins,winRate:wins/count,finishRate:finished/count,score:score/count,steps:steps/count,count,run};
}
function iterate(){
 const current=job;if(!current)return;
 try{
  const i=current.done++,seed=current.cfg.seed+i*1409+10,scale=Math.max(.065,.3*(1-i/current.total));
  const candidate=mutatePerekosPolicy(current.best,seed+79,scale);
  const challenger=evaluate(candidate,seed,current.cfg,2);
  const incumbent=evaluate(current.best,seed,current.cfg,2);
  if(challenger.fitness>incumbent.fitness){current.best=candidate;current.accepted++;}
  current.history.push({generation:current.done,best:Math.max(challenger.fitness,incumbent.fitness),accepted:current.accepted,winRate:challenger.winRate});
  reply('perekos-progress',{complete:current.done,total:current.total,accepted:current.accepted,fitness:Math.max(challenger.fitness,incumbent.fitness),history:current.history});
  if(current.done>=current.total){
   policy=current.best;job=null;settings=current.cfg;
   const baseline=evaluate(current.original,900001+current.cfg.seed,current.cfg,4);
   const validation=evaluate(policy,900001+current.cfg.seed,current.cfg,4);
   const playback=play(policy,600101+current.cfg.seed,{...current.cfg,limitTicks:8400,rivalPolicy:createPerekosPolicy(77,'balanced')},true);
   reply('perekos-trained',{policy,accepted:current.accepted,history:current.history,baseline,validation,replay:playback});
  }else setTimeout(iterate,0);
 }catch(e){job=null;reply('perekos-error',{message:String(e.message||e)});}
}
onmessage=({data})=>{
 const {type,payload={}}=data||{};
 try{
  if(type==='perekos-train'){
   if(job)throw Error('Тренировка уже идёт');
   const cfg=config(payload),total=Math.max(1,Math.min(35,Math.floor(Number(payload.generations)||6)));
   const original=validatePerekosPolicy(payload.policy)?payload.policy:policy;
   job={cfg,total,done:0,accepted:0,original:structuredClone(original),best:structuredClone(original),history:[]};
   reply('perekos-started',{total});setTimeout(iterate,0);
  }else if(type==='perekos-stop'){
   if(job){const x=job;job=null;policy=x.best;reply('perekos-stopped',{policy,complete:x.done,total:x.total,accepted:x.accepted,history:x.history});}
  }else if(type==='perekos-test'){
   if(job)throw Error('Остановите обучение');
   const cfg=config(payload);if(validatePerekosPolicy(payload.policy))policy=payload.policy;
   const rival=createPerekosPolicy(cfg.seed+111,payload.rivalStyle||'balanced');
   const replay=play(policy,cfg.seed,{...cfg,limitTicks:8400,rivalPolicy:rival},true);
   reply('perekos-tested',{policy,replay});
  }else if(type==='perekos-tournament'){
   if(job)throw Error('Остановите обучение');
   const cfg=config(payload);
   const table=['balanced','aggressive','evasive','defensive'].map((style,i)=>{
    const rival=createPerekosPolicy(cfg.seed+i+511,style);
    let wins=0,completed=0,score=0;
    for(let n=0;n<3;n++){const p=play(policy,cfg.seed+50001+i*1501+n*31,{...cfg,opponent:MAGE_CHOICES[(i+n)%MAGE_CHOICES.length].id,limitTicks:7200,rivalPolicy:rival});
      wins+=Number(p.won);completed+=Number(p.finished);score+=p.fitness;}
    return {style,wins,completed,total:3,fitness:score/3};
   });
   reply('perekos-tournament',{table});
  }else if(type==='perekos-load'){
   if(job)throw Error('Сначала завершите обучение');
   if(!validatePerekosPolicy(payload.policy))throw Error('Некорректный мозг Перекоса');
   policy=structuredClone(payload.policy);reply('perekos-loaded',{policy});
  }else if(type==='perekos-reset'){
   if(job)throw Error('Сначала остановите обучение');
   policy=createPerekosPolicy(41);reply('perekos-loaded',{policy});
  }else if(type==='perekos-snapshot')reply('perekos-snapshot',{policy});
 }catch(e){reply('perekos-error',{message:String(e.message||e)});}
};
