// Presentation-only motion. The simulation and saved snapshots remain untouched.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const hash=(x,y=0)=>{let n=Math.imul(x|0,374761393)+Math.imul(y|0,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296};
export const mounted=u=>['knight','lightHorse','guard'].includes(u.type);
export function annotateMotionFrames(frames,prior=new Map()){
 let accum=new Map(prior),last=new Map(),prevTime=null,shots=new Map(),contactEnd=new Map();
 return frames.map(s=>{
  for(let a of s.shots||[])if(a.time<=s.time)shots.set(a.id,Math.max(shots.get(a.id)??-Infinity,a.time));
  let units=s.units.map(u=>{
   let p=last.get(u.id),distance=accum.get(u.id)||0;
   if(p&&s.time>=prevTime)distance+=Math.hypot(u.x-p.x,u.y-p.y);
   if(p?.contact>0&&!(u.contact>0))contactEnd.set(u.id,s.time);accum.set(u.id,distance);last.set(u.id,u);
   return {...u,motionDistance:distance,motionShotTime:shots.get(u.id)??-1e6,motionContactEnd:contactEnd.get(u.id)??-1e6};
  });
  prevTime=s.time;return {...s,units};
 });
}
export function motionPose(u,q,row,rows,s,seed,contact,extended=false){
 const horse=mounted(u),v=Math.abs(u.v||0),coh=clamp((q.cohesion??u.cohesion??100)/100,0,1),disorder=1-coh;
 const phaseOffset=hash(u.id,17)*.35+hash(seed,3)*(.10+.9*disorder);
 const cycle=(length,poses)=>{let distance=u.motionDistance??s.time*v;return poses[Math.floor((distance/length+phaseOffset)*poses.length)%poses.length]};
 const attack=[25,29,33,37],walk=[5,9,13,17],fast=extended?[41,45,49,53]:horse?attack:walk;
 const timeCycle=(period,poses)=>poses[Math.floor((s.time/period+phaseOffset)*poses.length)%poses.length];
 let shotTime=u.motionShotTime??-1e6;
 if(u.type==='archer'){
  for(let a of s.shots||[])if(a.id===u.id&&a.time<=s.time)shotTime=Math.max(shotTime,a.time);
  let age=s.time-shotTime;
  if(!u.rout&&row<Math.max(1,Math.ceil(rows*.65))){
   // A released arrow is shown only after its recorded emission. No prediction of hits.
   if(age>=0&&age<.23)return extended?33:29;
   if(age>=.23&&age<.85)return extended?61:37;
   if(v<.25&&u.ammo>0&&u.order?.kind!=='cease'&&u.order?.kind!=='retreat'&&u.shot>0&&u.shot<1.35)return extended?(u.shot>.85?57:u.shot>.35?25:29):25;
  }
 }
 if(u.rout)return cycle(horse?2.5:.95,fast);
 if(contact&&row<Math.max(1,Math.ceil(rows*.26))){
  if(q.pressure>1.1||u.order?.kind==='brace'||u.order?.kind==='hold')return 21;
  return timeCycle(horse?1.35:1.15,attack);
 }
 if(extended&&s.time-(u.motionContactEnd??-1e6)<.55&&s.time>=(u.motionContactEnd??-1e6)&&v<.3)return 61;
 if(horse&&u.order?.kind==='charge'&&v>2.7)return cycle(u.type==='lightHorse'?3.2:2.75,fast);
 if(horse&&extended&&u.order?.kind==='charge'&&v<.2)return 57;
 if(v>.18){
  if(horse&&v>2.7)return cycle(2.75,fast);
  if(horse&&extended&&v>1.35)return cycle(2.05,[65,69,73,77]);
  if(!horse&&v>1.8)return cycle(.98,fast);
  return cycle(horse?1.65:1.12,walk);
 }
 if(extended&&u.order?.kind==='attack'&&row===0)return 57;
 return 1;
}
