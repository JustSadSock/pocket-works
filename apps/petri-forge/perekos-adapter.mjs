// Pocket Intelligence Env Adapter v1 for PEREKOS.
// Uses the *real* fixed-step game state, not a second approximate spell simulator.
import {W,H,STEP,makeMatch,tick,chooseRune,beginRound,validState} from '../perekos/core.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const PEREKOS_ENVIRONMENT={
 id:'perekos',version:1,engine:'perekos-core-v4',orientation:'portrait',
 observation:{kind:'structured',fields:['self','opponent','shots','cover','arena','phase','offers']},
 actions:{movement:'unit-vector',aim:'arena-coordinate',buttons:['attack','dash','shield'],draft:'rune-id'},
 supports:['reset','observe','step','snapshot','restore','seeded-evaluation']
};
export function validPerekosAction(a){
 return !!a&&typeof a==='object'&&
  (a.x===undefined||Number.isFinite(a.x)&&Math.abs(a.x)<=1)&&
  (a.y===undefined||Number.isFinite(a.y)&&Math.abs(a.y)<=1)&&
  (a.aim===undefined||a.aim&&Number.isFinite(a.aim.x)&&Number.isFinite(a.aim.y)&&a.aim.x>=0&&a.aim.x<=W&&a.aim.y>=0&&a.aim.y<=H)&&
  ['attack','dash','shield'].every(key=>a[key]===undefined||typeof a[key]==='boolean');
}
const projection=a=>({
 x:a.x/W,y:a.y/H,vx:a.vx,vy:a.vy,
 hp:a.hp/100,shield:a.shield/80,heat:a.heat/100,
 mageId:a.mageId,cast:a.cast,dashReady:a.dashReady,shieldReady:a.shieldReady,
 stunned:a.stun>0,runes:a.runes.slice()
});
export class PerekosEnvironment{
 constructor({seed=1,first='kindle',second='pebble',limitTicks=30000}={}){
  this.cfg={seed,first,second,limitTicks};this.reset(seed);
 }
 reset(seed=this.cfg.seed){
  this.state=makeMatch(seed>>>0||1,this.cfg.first,this.cfg.second);
  this.steps=0;this.lastScore=[0,0];
  return this.observe();
 }
 observe(player=0){
  if(player!==0&&player!==1)throw Error('Неизвестная сторона');
  const s=this.state,a=s.actors[player],b=s.actors[1-player];
  const self=projection(a),opponent=projection(b);
  // Opponent runes are not included in the sensor data by default.
  delete opponent.runes;
  return {phase:s.phase,round:s.round,remaining:s.remaining,score:s.score.slice(),self,opponent,
   shots:s.shots.map(p=>({x:p.x/W,y:p.y/H,vx:p.vx,vy:p.vy,owner:p.owner,r:p.r})),
   arena:{width:W,height:H,ring:s.remaining>=10?230:Math.max(80,80+15*s.remaining)},
   offers:player===0&&s.phase==='draft'?s.pick.slice():[]};
 }
 step(input={},opponentInput=null){
  if(!validPerekosAction(input)||opponentInput!==null&&!validPerekosAction(opponentInput))throw Error('Недопустимая команда');
  const s=this.state;
  if(s.phase==='result')return {observation:this.observe(),reward:0,terminated:true,truncated:false,info:{champion:s.champion}};
  const prevHp=s.actors.map(a=>a.hp),prevScore=s.score.slice(),draft=s.phase==='draft';
  if(draft){
   // Preserves the original rune selection rules and the built-in rival draft.
   const proposed=s.pick.includes(input.draft)?input.draft:s.pick[0];
   if(!proposed||!chooseRune(s,proposed,s.actors[0].runes.length===9?8:null))throw Error('Не удалось выбрать руну');
   if(!beginRound(s))throw Error('Не удалось продолжить раунд');
  }else if(s.phase==='build'){
   if(!beginRound(s))throw Error('Не удалось продолжить раунд');
  }else{
   const move=a=>({x:clamp(Number(a?.x)||0,-1,1),y:clamp(Number(a?.y)||0,-1,1),
    attack:a?.attack===true,dash:a?.dash===true,shield:a?.shield===true,
    aim:a?.aim||undefined});
   tick(s,move(input),STEP,opponentInput===null?null:move(opponentInput));
  }
  this.steps++;
  const damage=(prevHp[1]-s.actors[1].hp)-(prevHp[0]-s.actors[0].hp);
  const roundWins=(s.score[0]-prevScore[0])-(s.score[1]-prevScore[1]);
  const reward=damage*.015+roundWins*3+(s.phase==='result'?(s.champion===0?20:-20):0);
  return {observation:this.observe(),reward,terminated:s.phase==='result',truncated:this.steps>=this.cfg.limitTicks,
   info:{round:s.round,score:s.score.slice(),draws:s.draws,phase:s.phase,engineTicks:s.ticks}};
 }
 snapshot(){return JSON.parse(JSON.stringify({version:1,steps:this.steps,state:this.state}));}
 restore(saved){
  if(!saved||saved.version!==1||!validState(saved.state)||!Number.isInteger(saved.steps)||saved.steps<0||saved.steps>1e7)throw Error('Неверный чекпоинт Перекоса');
  this.steps=saved.steps;this.state=JSON.parse(JSON.stringify(saved.state));
  return this.observe();
 }
}
