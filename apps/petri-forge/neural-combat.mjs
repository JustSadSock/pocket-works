// Neurocombat: real Combat Forge physics controlled by PPO-generated macro actions.
// The heuristic combat policy is retained as a baseline/opponent.
import {createBattle,stepBattle,snapshotBattle,battleSummary,NEURAL_COMBAT_CLASSES,neuralBattleObservation,neuralBattleControl} from './combat-core.mjs';
import {PpoPolicy,PpoTrainer,validatePpoPolicy} from './ppo.mjs';

export const NEURAL_ROLES=Object.freeze(['archer','swordsman']);
export const NEURAL_ARENAS=Object.freeze(['open','cover','hazards']);
const validateRole=r=>{if(!NEURAL_ROLES.includes(r))throw Error('Неизвестный класс нейробойца');return r;};
const validateArena=a=>{if(!NEURAL_ARENAS.includes(a))throw Error('Неизвестная арена');return a;};
const classes=r=>NEURAL_COMBAT_CLASSES[validateRole(r)].loadout;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function combatTrainingOptions(options={}){
 const role=validateRole(options.role??'archer'),enemyRole=validateRole(options.enemyRole??'swordsman');
 const arena=validateArena(options.arena??'cover');
 const episodes=options.episodes??12,seed=options.seed??411;
 if(!Number.isSafeInteger(episodes)||episodes<1||episodes>150||!Number.isSafeInteger(seed)||seed<1||seed>1e9)
  throw Error('Некорректное число боёв или начальное число');
 if(options.snapshot&&!validatePpoPolicy(options.snapshot))throw Error('Повреждённый PPO-боец');
 if(options.enemySnapshot&&!validatePpoPolicy(options.enemySnapshot))throw Error('Повреждённый мозг соперника');
 return {role,enemyRole,arena,episodes,seed,
  snapshot:options.snapshot??null,enemySnapshot:options.enemySnapshot??null};
}
export function battleNeuralEpisode({role='archer',enemyRole='swordsman',arena='cover',seed=41,
 policy,opponent=null,learn=null,side=0,maxSeconds=20,record=false,stochastic=true}={}){
 validateRole(role);validateRole(enemyRole);validateArena(arena);
 if(!(policy instanceof PpoPolicy)||opponent&&!(opponent instanceof PpoPolicy)||![0,1].includes(side))
  throw Error('Ошибка нейросетевого боя');
 const loadouts=side===0?[classes(role),classes(enemyRole)]:[classes(enemyRole),classes(role)];
 const state=createBattle({arena,seed,teamSize:1,loadouts,maxSeconds});
 const hero=state.agents[side],foe=state.agents[1-side];
 let moves=0,damage=0,taken=0,rewardTotal=0,lastAction=0;
 const frames=[];
 while(!state.done){
  const observation=neuralBattleObservation(state,hero);
  const oldDamage=state.scores[side],oldHealth=hero.hp;
  const oldDistance=Math.hypot(hero.x-foe.x,hero.y-foe.y);
  const choice=learn?policy.sample(observation):stochastic?policy.sample(observation):null;
  const actionIndex=choice?choice.actionIndex:
    policy.forward(observation).probabilities.indexOf(Math.max(...policy.forward(observation).probabilities));
  const theirObs=opponent?neuralBattleObservation(state,foe):null;
  const rivalChoice=opponent?
    (stochastic?opponent.sample(theirObs).actionIndex:
     opponent.forward(theirObs).probabilities.indexOf(Math.max(...opponent.forward(theirObs).probabilities))):null;
  const controllers={};
  controllers[hero.id]=(s,a,t,walls)=>{return neuralBattleControl(s,a,t,walls,actionIndex);};
  if(opponent)controllers[foe.id]=(s,a,t,walls)=>neuralBattleControl(s,a,t,walls,rivalChoice);
  for(let i=0;i<6&&!state.done;i++){
   stepBattle(state,controllers);
   if(record&&state.ticks%3===0)frames.push(snapshotBattle(state));
  }
  const newDistance=Math.hypot(hero.x-foe.x,hero.y-foe.y);
  const damageDelta=state.scores[side]-oldDamage,damageTaken=Math.max(0,oldHealth-hero.hp);
  // Reward only from actual game events, plus a small dense navigation signal.
  // The role determines its desired engagement distance, not a scripted attack.
  const preferred=role==='archer'?225:55;
  const beforeGap=Math.abs(oldDistance-preferred),afterGap=Math.abs(newDistance-preferred);
  const reward=damageDelta*.045-damageTaken*.055+
    clamp((beforeGap-afterGap)*.003,-.15,.15)-.008+
    (state.done?(state.winner===side?7:state.winner===-1?0:-7):0);
  if(learn)learn.add(observation,{reward,done:state.done},actionIndex,choice.logProb,choice.value);
  moves++;damage+=damageDelta;taken+=damageTaken;rewardTotal+=reward;lastAction=actionIndex;
 }
 return {winner:state.winner,won:state.winner===side,draw:state.winner===-1,
  reward:rewardTotal,damage,taken,moves,lastAction,summary:battleSummary(state),frames};
}
export function runCombatEvaluation(snapshot,{role,enemyRole,arena,seed,enemySnapshot=null,count=6}){
 if(!validatePpoPolicy(snapshot))throw Error('Нет обученного нейробойца');
 if(!Number.isInteger(count)||count<1||count>40)throw Error('Неверная выборка оценки');
 const fighter=new PpoPolicy(seed+711);fighter.load(snapshot);
 const rival=enemySnapshot?new PpoPolicy(seed+93):null;if(rival)rival.load(enemySnapshot);
 let wins=0,draws=0,damage=0,taken=0;
 for(let i=0;i<count;i++){
  const episode=battleNeuralEpisode({role,enemyRole,arena,policy:fighter,opponent:rival,
   side:i%2,seed:seed+i*1009,maxSeconds:18,stochastic:true});
  wins+=Number(episode.won);draws+=Number(episode.draw);
  damage+=episode.damage;taken+=episode.taken;
 }
 return {count,wins,draws,winRate:wins/count,damage:damage/count,taken:taken/count};
}
export function neuralDuel({a,b,roleA='archer',roleB='swordsman',arena='cover',seed=41,legs=4}){
 if(!validatePpoPolicy(a)||!validatePpoPolicy(b))throw Error('Оба бойца должны иметь обученный PPO-мозг');
 validateRole(roleA);validateRole(roleB);validateArena(arena);
 if(!Number.isInteger(legs)||legs<2||legs>12||legs%2)throw Error('Число боёв должно быть чётным');
 const fighter=new PpoPolicy(seed+27),rival=new PpoPolicy(seed+65);fighter.load(a);rival.load(b);
 const matches=[],points=[0,0];
 for(let i=0;i<legs;i++){
  const side=i%2;
  const episode=battleNeuralEpisode({role:roleA,enemyRole:roleB,arena,seed:seed+Math.floor(i/2)*977,
   policy:fighter,opponent:rival,side,maxSeconds:22,record:i===0,stochastic:true});
  const winner=episode.summary.winner<0?-1:episode.summary.winner===side?0:1;
  points[winner<0?0:winner]+=winner<0?.5:1;
  if(winner<0)points[1]+=.5;
  matches.push({winner,seconds:episode.summary.seconds,damage:episode.damage,taken:episode.taken,
   summary:episode.summary,frames:i===0?episode.frames:[]});
 }
 return {type:'neural-duel',points,matches,arena,roleA,roleB,
  winner:points[0]===points[1]?-1:points[0]>points[1]?0:1};
}
