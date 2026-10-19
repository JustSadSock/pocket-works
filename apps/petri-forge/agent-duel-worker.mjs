// Headless contest of TWO SAVED user agents using Combat Forge physics, never a fake result.
import {simulateBattle,validPolicy,LOADOUTS} from './combat-core.mjs';
const known=['open','cover','hazards'];
self.onmessage=({data})=>{
 const {a,b,arena='cover',seed=41,teamSize=1,loadoutA='skirmisher',loadoutB='guardian'}=data||{};
 try{
  if(!validPolicy(a)||!validPolicy(b))throw Error('У обоих агентов должен быть боевой мозг. Сначала обучите каждого на арене.');
  if(!known.includes(arena)||![1,2].includes(teamSize)||!LOADOUTS[loadoutA]||!LOADOUTS[loadoutB])throw Error('Неверные настройки боя');
  const legs=[];
  for(let leg=0;leg<2;leg++){
   const reversed=leg===1;
   const sidePolicies=reversed?[b,a]:[a,b];
   const sideLoadouts=reversed?[loadoutB,loadoutA]:[loadoutA,loadoutB];
   const sim=simulateBattle({arena,seed:seed+leg*1031,teamSize,
    maxSeconds:35,loadouts:sideLoadouts,policies:sidePolicies},leg===0);
   const winner=sim.summary.winner<0?-1:sim.summary.winner===(reversed?1:0)?0:1;
   legs.push({winner,seconds:sim.summary.seconds,damage:reversed?sim.summary.damage.slice().reverse():sim.summary.damage,
     hp:reversed?sim.summary.hp.slice().reverse():sim.summary.hp,
     kills:reversed?sim.summary.kills.slice().reverse():sim.summary.kills,
     summary:sim.summary,frames:leg===0?sim.frames:[]});
  }
  const points=[0,0];for(const leg of legs)if(leg.winner>=0)points[leg.winner]++;else{points[0]+=.5;points[1]+=.5;}
  postMessage({type:'duel-result',points,legs,winner:points[0]===points[1]?-1:points[0]>points[1]?0:1,arena});
 }catch(error){postMessage({type:'duel-error',message:String(error.message||error)});}
};