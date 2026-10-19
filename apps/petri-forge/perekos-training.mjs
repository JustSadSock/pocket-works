// PetriForge 0.6: native Perekos curriculum, league and honest round/match metrics.
// Pure simulation: no DOM, no alternative physics.
import {PerekosEnvironment} from './perekos-adapter.mjs';
import {createPerekosPolicy,validatePerekosPolicy,perekosControl,choosePerekosRune,MAGE_CHOICES} from './perekos-policy.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const CURRICULA=['balanced','offense','competitive'];
export const RIVAL_TYPES=['dummy','charger','native','balanced','aggressive','evasive','defensive','league'];
const styles=new Set(['balanced','aggressive','evasive','defensive']);
export function trainingSettings(value={}){
 const mage=MAGE_CHOICES.some(x=>x.id===value.mage)?value.mage:'kindle',
 opponent=MAGE_CHOICES.some(x=>x.id===value.opponent)?value.opponent:'pebble',
 curriculum=CURRICULA.includes(value.curriculum)?value.curriculum:'balanced';
 return {mage,opponent,curriculum,seed:(Number(value.seed)>>>0)||41};
}
function snapshot(env,control=null,rival=null){
 const s=env.state;
 return {t:env.steps/60,remaining:s.remaining,round:s.round,score:s.score.slice(),phase:s.phase,draws:s.draws,champion:s.champion,
  actors:s.actors.map(a=>({id:a.id,x:a.x,y:a.y,face:a.face,hp:a.hp,shield:a.shield,heat:a.heat,mageId:a.mageId,cast:a.cast,guard:a.guard,runes:a.runes.slice(),dash:a.dash})),
  shots:s.shots.slice(0,80).map(p=>({x:p.x,y:p.y,r:p.r,owner:p.owner,vx:p.vx,vy:p.vy})),
  mines:s.mines.slice(0,30).map(m=>({x:m.x,y:m.y,r:m.r,owner:m.owner})),
  barriers:s.barriers.slice(0,25).map(b=>({x:b.x,y:b.y,r:b.r})),
  fx:s.fx.slice(-15).map(f=>({x:f.x,y:f.y,k:f.k})),
  decision:control?{x:control.x,y:control.y,attack:control.attack,dash:control.dash,shield:control.shield,aim:control.aim,meta:control.meta}:null,
  enemyDecision:rival?{x:rival.x,y:rival.y,attack:rival.attack,shield:rival.shield}:null
 };
}
function rivalInput(obs,op,step,mode){
 if(mode==='dummy')return {x:0,y:0,attack:false,dash:false,shield:false};
 if(mode==='charger'){
  const self=obs.self,opponent=obs.opponent;
  const dx=(opponent.x-self.x)*400,dy=(opponent.y-self.y)*620,d=Math.hypot(dx,dy)||1;
  return {x:dx/d,y:dy/d,attack:true,shield:false,dash:false,aim:{x:opponent.x*400,y:opponent.y*620}};
 }
 return perekosControl(obs,op,1,step);
}
export function runPerekosEpisode(model,{seed=1,mage='kindle',opponent='pebble',rival='native',rivalPolicy=null,mode='round',limitTicks,record=false}={}){
 if(!validatePerekosPolicy(model))throw Error('Некорректная обучаемая политика');
 if(!RIVAL_TYPES.includes(rival))throw Error('Неизвестный тип соперника');
 if(!['round','skirmish','match'].includes(mode))throw Error('Неизвестный формат эпизода');
 const startSeed=(Number(seed)>>>0)||1;
 const env=new PerekosEnvironment({seed:startSeed,first:mage,second:opponent,limitTicks:10800});
 const enemyModel=rivalPolicy&&validatePerekosPolicy(rivalPolicy)?rivalPolicy:
  styles.has(rival)?createPerekosPolicy(startSeed+711,rival):createPerekosPolicy(startSeed+711,'balanced');
 const maxSteps=clamp(Math.round(limitTicks|| (mode==='round'?1550:mode==='skirmish'?3150:9200)),100,10800);
 const frames=[],draft=[],records=[];
 let dealt=0,received=0,fireTicks=0,shields=0,dashes=0;
 let lastAction=null,enemyAction=null,prevRound=1,previousPhase='fight';
 while(env.steps<maxSteps&&env.state.phase!=='result'){
  const o=env.observe(0),phase=o.phase;
  if(phase==='draft'){
   if(mode==='round'||mode==='skirmish'&&records.length>=2)break;
   const choice=choosePerekosRune(o,model);if(choice)draft.push(choice);
   env.step({draft:choice});
   if(record&&frames.length<510)frames.push(snapshot(env));
   continue;
  }
  if(phase==='build'){if(mode==='round'||mode==='skirmish'&&records.length>=2)break;env.step({});continue;}
  const player=perekosControl(o,model,0,env.steps);
  let second=null;
  if(rival!=='native')second=rivalInput(env.observe(1),enemyModel,env.steps,rival);
  const hits=env.state.actors.map(x=>x.hit);
  env.step(player,second);
  dealt+=Math.max(0,env.state.actors[0].hit-hits[0]);
  received+=Math.max(0,env.state.actors[1].hit-hits[1]);
  fireTicks+=Number(player.attack);shields+=Number(player.shield);dashes+=Number(player.dash);
  lastAction=player;enemyAction=second;
  if((env.state.phase==='draft'||env.state.phase==='result')&&previousPhase==='fight'){
   records.push({winner:env.state.lastWinner??-1,score:env.state.score.slice(),draw:env.state.lastOutcome==='draw'});
  }
  if(record&&(env.steps%24===0||env.state.phase!=='fight'||env.state.round!==prevRound)&&frames.length<510)frames.push(snapshot(env,player,second));
  prevRound=env.state.round;previousPhase=env.state.phase;
  if((mode==='round'||mode==='skirmish'&&records.length>=2)&&env.state.phase!=='fight')break;
 }
 const s=env.state,roundWin=s.score[0],roundLoss=s.score[1],roundDraw=s.draws;
 const complete=s.phase==='result',won=complete&&s.champion===0;
 const finalHealth=(s.actors[0].hp-s.actors[1].hp),unfinished=mode==='round'&&s.phase==='fight';
 const healthAdvantage=unfinished?finalHealth*.06:0;
 // A single round win is valuable even when a four-win full match cannot fit in a training batch.
 const fitness=roundWin*35-roundLoss*37+(dealt-received)*.12+healthAdvantage+
  (complete?(won?45:-45):0);
 if(record&&frames.length<512)frames.push(snapshot(env,lastAction,enemyAction));
 return {fitness,won,finished:complete,roundWin,roundLoss,roundDraw,rounds:s.round,
  completedRound:records.length>0,draws:s.draws,score:roundWin-roundLoss,steps:env.steps,
  remaining:s.remaining,hp:s.actors.map(a=>a.hp),dealt,received,damageMargin:dealt-received,
  shots:fireTicks,shields,dashes,draft,records,frames,winner:s.champion,mode,rival};
}
export function curriculumRivals(curriculum='balanced',generation=0,total=8,archive=[]){
 const phase=Math.min(2,Math.floor(generation/Math.max(1,total)*3));
 if(curriculum==='offense')return [['dummy','charger'],['charger','native'],['native','aggressive']][phase];
 if(curriculum==='competitive')return ['native',archive.length?'league':'balanced'];
 return [['dummy','charger'],['native','balanced'],['evasive',archive.length?'league':'native']][phase];
}
function episodeCase(caseSpec,settings,league){
 const opponent=caseSpec.opponent||settings.opponent;
 return {seed:caseSpec.seed,mage:settings.mage,opponent,rival:caseSpec.rival,
  rivalPolicy:caseSpec.rival==='league'&&league?.length?league[caseSpec.seed%league.length]:null,
  mode:caseSpec.mode||'round',limitTicks:caseSpec.limitTicks};
}
export function evaluatePerekosPolicy(model,cases,settings,league=[]){
 let fitness=0,dealt=0,received=0,roundWins=0,roundLosses=0,roundDraws=0,completedRounds=0,matchWins=0,completedMatches=0,ticks=0;
 const samples=[];
 for(const scenario of cases){
  const result=runPerekosEpisode(model,episodeCase(scenario,settings,league));
  fitness+=result.fitness;dealt+=result.dealt;received+=result.received;
  roundWins+=result.roundWin;roundLosses+=result.roundLoss;roundDraws+=result.roundDraw;
  completedRounds+=result.records.length;matchWins+=Number(result.won);completedMatches+=Number(result.finished);ticks+=result.steps;
  samples.push({seed:scenario.seed,rival:scenario.rival,opponent:scenario.opponent,mode:scenario.mode||'round',
   won:result.won,finished:result.finished,roundWin:result.roundWin,roundLoss:result.roundLoss,
   draws:result.roundDraw,fitness:result.fitness,damageMargin:result.damageMargin});
 }
 const n=Math.max(1,cases.length),allRounds=roundWins+roundLosses+roundDraws;
 return {fitness:fitness/n,damageMargin:(dealt-received)/n,dealt:dealt/n,received:received/n,
  roundWinRate:allRounds?roundWins/allRounds:0,roundWins,roundLosses,roundDraws,
  completedRounds,matchWins,winRate:matchWins/n,finishRate:completedMatches/n,
  score:(roundWins-roundLosses)/n,steps:ticks/n,count:cases.length,run:samples};
}
export function trainingCases(settings,generation,total,league=[]){
 const types=curriculumRivals(settings.curriculum,generation,total,league);
 return types.map((rival,i)=>({
  seed:(settings.seed+generation*7919+i*2351+119)>>>0,
  opponent:MAGE_CHOICES[(generation+i)%MAGE_CHOICES.length].id,
  rival,mode:(generation%3===2&&i===0)?'skirmish':'round'
 }));
}
export function holdoutCases(settings,level='round'){
 const rivals=['native','aggressive','evasive','balanced','native','defensive'];
 const n=level==='match'?4:6;
 return Array.from({length:n},(_,i)=>({
  seed:(740003+settings.seed*13+i*12011)>>>0,
  opponent:MAGE_CHOICES[(i+2)%MAGE_CHOICES.length].id,
  rival:rivals[i],
  mode:level==='match'?'match':i===2||i===4?'skirmish':'round',
  limitTicks:level==='match'?9000:i===2||i===4?3150:1550
 }));
}
