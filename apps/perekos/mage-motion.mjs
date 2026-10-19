// PEREKOS / body-language director.
// Client-only critically damped motion. No hitbox, velocity, aim or net packets
// may be derived from these poses; authoritative combat is untouched.
import {mage} from './mages.mjs';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=(now,old,speed,dt)=>old+(now-old)*(1-Math.exp(-speed*dt));
export const RIGS=Object.freeze({
 kindle:Object.freeze({gait:1.07,step:1,weight:.76,coat:.92,flourish:1.0,attack:'lunge'}),
 cinder:Object.freeze({gait:.92,step:.83,weight:1.04,coat:1.28,flourish:1.28,attack:'swing'}),
 wire:Object.freeze({gait:1.43,step:1.2,weight:.5,coat:1.3,flourish:.7,attack:'snap'}),
 coil:Object.freeze({gait:1.16,step:.87,weight:.84,coat:.94,flourish:1,attack:'coil'}),
 pebble:Object.freeze({gait:.78,step:.65,weight:1.62,coat:.68,flourish:1.27,attack:'heave'}),
 slate:Object.freeze({gait:.72,step:.58,weight:1.88,coat:.6,flourish:.84,attack:'brace'})
});
export function basePose(id='kindle'){
 return {move:0,step:0,lean:0,bodyBob:0,cloth:0,headTilt:0,
  footSpread:0,attack:0,guard:0,impact:0,dash:0,headBob:0,
  weight:RIGS[id]?.weight||1,style:RIGS[id]?.attack||'lunge'};
}
export class MageMotion{
 constructor(){this.entries=new Map();this.round=null}
 reset(){this.entries.clear();this.round=null}
 sample(actor,position,time,round=1,reduced=false){
  if(!actor||!position||!Number.isFinite(position.x)||!Number.isFinite(position.y))return basePose();
  const config=RIGS[actor.mageId]||RIGS.kindle,key=actor.id??0;
  if(this.round!==round){this.reset();this.round=round}
  let m=this.entries.get(key);
  if(!m||m.mageId!==actor.mageId||!Number.isFinite(m.time)||time<m.time||time-m.time>1){
   m={time,x:position.x,y:position.y,mageId:actor.mageId,walk:0,
    speed:0,lean:0,cloth:0,wind:0,hit:0,guard:0,attack:0,
    lastCast:0,lastShield:actor.shield||0,lastFlash:0,
    face:actor.face||0};
   this.entries.set(key,m);
  }
  const dt=clamp(time-m.time,0,1/15),dx=position.x-m.x,dy=position.y-m.y;
  const traveled=Math.hypot(dx,dy);
  // Large jumps are teleports or snapshot corrections, never a footstep.
  const velocity=dt>.0001&&traveled<42?traveled/dt:0;
  const targetSpeed=clamp(velocity/126,0,1);
  m.speed=smooth(targetSpeed,m.speed,12,dt);
  if(dt>0)m.walk+=dt*(7+8*m.speed)*config.gait;
  const heading=actor.face||0;
  const forward=dt>.0001&&traveled<42?(dx*Math.cos(heading)+dy*Math.sin(heading))/dt:0;
  const cross=dt>.0001&&traveled<42?(dy*Math.cos(heading)-dx*Math.sin(heading))/dt:0;
  const attackNew=(actor.cast||0)>m.lastCast+.08;
  const guardNew=(actor.shield||0)>m.lastShield+4;
  const hitNew=(actor.flash||0)>m.lastFlash+.035;
  if(attackNew)m.attack=1;
  if(guardNew)m.guard=1;
  if(hitNew)m.hit=1;
  m.attack=Math.max(0,m.attack-dt*3.8);
  m.guard=Math.max(0,m.guard-dt*2.1);
  m.hit=Math.max(0,m.hit-dt*6);
  const dash=clamp((actor.dash||0)/.17,0,1);
  const effort=clamp(forward/160,-1,1);
  const desiredLean=clamp(-cross/70,-3.8,3.8)+(attackNew?0:-effort*.8);
  m.lean=smooth(desiredLean,m.lean,9*config.gait,dt);
  const wind=clamp(-cross/36,-6,6)-dash*3;
  m.wind=smooth(wind,m.wind,6/(config.weight*.65+.35),dt);
  m.cloth=smooth(m.wind,m.cloth,5/config.coat,dt);
  m.time=time;m.x=position.x;m.y=position.y;m.face=heading;
  m.lastCast=actor.cast||0;m.lastShield=actor.shield||0;m.lastFlash=actor.flash||0;
  const gaitWave=Math.sin(m.walk),swing=Math.cos(m.walk);
  const impact=m.hit,guard=Math.max(m.guard,(actor.shield||0)>0?.15:0);
  const stun=clamp((actor.stun||0)/.2,0,1);
  const pose={
   still:!!reduced,
   move:m.speed,step:m.walk,lean:clamp(m.lean+dash*2-impact*2,-5,5),
   bodyBob:-Math.abs(gaitWave)*m.speed*config.step*1.9+impact*3.3+stun*3,
   cloth:clamp(m.cloth+(1-m.speed)*Math.sin(reduced?0:time*1.8)*.4,-8,8),
   headTilt:clamp(swing*m.speed*.027+impact*-.12+guard*.05+dash*.09,-.19,.19),
   headBob:Math.abs(gaitWave)*m.speed*config.step,
   footSpread:clamp(m.speed*config.step*3+guard*1.5+dash*2,0,7),
   attack:m.attack,guard,impact,dash,
   weight:config.weight,style:config.attack
  };
  if(reduced){
   pose.step=0;pose.move=0;pose.lean=0;pose.bodyBob=0;pose.cloth=0;
   pose.headTilt=0;pose.headBob=0;pose.footSpread=0;
   pose.attack=0;pose.impact=0;pose.dash=0;
  }
  return pose;
 }
}
// Dynamic ranges for tooling/tests; distinguish all six art-directed styles.
export function rigSignature(id){
 const r=RIGS[id]||RIGS.kindle;
 return [r.attack,r.weight,r.gait,r.step,r.coat,r.flourish].join('/');
}
