/**
 * PocketWorks ШОВ v0.8 — an explicitly *prescribed* two-mouth causal model.
 *
 * Lab frame (c = 1), mouth A x=0; B makes a smooth round trip,
 * x_B(t)=D + β T/(2π) [1-cos(2πt/T)], 0≤t≤T,
 * v_B(t)=β sin(2πt/T). Endpoints have v=0.
 * dτ_B/dt=sqrt(1-v_B²); τ_A=t. Worldline clock integrals computed
 * numerically and monotonically inverted.
 *
 * A hypothetical interior identification is then IMPOSED:
 * τ_destination(exit)=τ_source(entry)+δ.
 * Neither that identification nor the absence of horizons follows from
 * SR or Einstein field equations. It is a toy spacetime gluing rule.
 *
 * Outside signals travel at c=1. For moving B, the external
 * interception event is determined by solving t-t0=|x_B(t)−x_A(t0)|.
 * A loop witness is a full B→A tunnel / A→B external itinerary,
 * closing after waiting on B, when arrival on B precedes departure.
 */
export const LIGHT=1;
export const DEFAULT_CAUSALITY=Object.freeze({
 distance:3,speed:.85,duration:34,throatTime:.55
});
export const CAUSAL_PRESETS=Object.freeze({
 synced:{distance:3.5,speed:0,duration:30,throatTime:.6},
 lag:{distance:6,speed:.68,duration:24,throatTime:.6},
 boundary:{distance:3,speed:.85,duration:null,throatTime:.55},
 loop:{distance:3,speed:.85,duration:34,throatTime:.55},
 deep:{distance:2,speed:.94,duration:48,throatTime:.35}
});
const GRID=1024,TAU_EPS=1e-10;
function valid(x,min,max,label){
 if(!Number.isFinite(x)||x<min||x>max)throw Error('Недопустимый параметр: '+label);
 return x;
}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function speedPhase(z,beta){return beta*Math.sin(2*Math.PI*z);}
function clockFactor(z,beta){
 const v=speedPhase(z,beta);
 return Math.sqrt(Math.max(0,1-v*v));
}
function ageingFraction(beta){
 // Simpson's rule integrated over one smooth cycle.
 let s=clockFactor(0,beta)+clockFactor(1,beta);
 for(let i=1;i<GRID;i++)s+=(i%2?4:2)*clockFactor(i/GRID,beta);
 return s/(3*GRID);
}
export function presetParameters(name){
 const p=CAUSAL_PRESETS[name];
 if(!p)throw Error('Неизвестная причинная предустановка');
 const v={...p};
 if(v.duration===null){
  const lagFactor=1-ageingFraction(v.speed);
  v.duration=(v.distance+v.throatTime)/lagFactor;
 }
 return v;
}
export function createCausality(args={}){
 const p={
  distance:valid(Number(args.distance??DEFAULT_CAUSALITY.distance),.3,12,'расстояние'),
  speed:valid(Number(args.speed??DEFAULT_CAUSALITY.speed),0,.98,'скорость'),
  duration:valid(Number(args.duration??DEFAULT_CAUSALITY.duration),4,160,'длительность рейса'),
  throatTime:valid(Number(args.throatTime??DEFAULT_CAUSALITY.throatTime),0,5,'время внутри')
 };
 const tau=new Float64Array(GRID+1);
 // Cumulative proper time using a 2nd-order symmetric quadrature,
 // improved to Simpson's rule separately on even indices.
 const h=1/GRID;
 for(let k=1;k<=GRID;k++){
  const mid=(k-.5)*h;
  tau[k]=tau[k-1]+h*clockFactor(mid,p.speed);
 }
 // Correct the overall integral to 4th-order Simpson without
 // changing monotonicity of the interpolated cumulative clock.
 const target=ageingFraction(p.speed),correction=target/tau[GRID];
 for(let k=1;k<=GRID;k++)tau[k]*=correction*p.duration;
 const age=tau[GRID],offset=p.duration-age;
 const maximumDistance=p.distance+p.speed*p.duration/Math.PI;
 const model={...p,tau,age,offset,maximumDistance,
  conditionMargin:offset-p.distance-p.throatTime,
  clockAfterTrip:'A(t)=t, B(t)=t−Δ',
  throatRule:'τ_exit=τ_entry+δ',
  source:'special-relativistic mouth kinematics + imposed two-mouth identification'};
 return model;
}
export function mouthA(s,t){
 return {x:0,t,tau:t,v:0,gamma:1};
}
export function mouthB(s,t){
 if(!Number.isFinite(t))throw Error('Некорректное лабораторное время');
 const {distance,speed,duration,tau,age,offset}=s;
 if(t<=0)return {x:distance,t,tau:t,v:0,gamma:1};
 if(t>=duration)return {x:distance,t,tau:t-offset,v:0,gamma:1};
 const z=t/duration,velocity=speedPhase(z,speed),
  u=z*GRID,i=Math.min(GRID-1,Math.floor(u)),fraction=u-i;
 return {
  x:distance+(speed*duration/(2*Math.PI))*(1-Math.cos(2*Math.PI*z)),
  t,tau:tau[i]+fraction*(tau[i+1]-tau[i]),
  v:velocity,gamma:1/Math.sqrt(1-velocity*velocity)
 };
}
export function inverseBClock(s,proper){
 if(!Number.isFinite(proper))throw Error('Некорректное собственное время');
 if(proper<=0)return proper;
 if(proper>=s.age)return s.duration+proper-s.age;
 const t=s.tau;
 let lo=0,hi=GRID;
 while(hi-lo>1){
  const mid=(lo+hi)>>1;
  if(t[mid]<proper)lo=mid;else hi=mid;
 }
 return (lo+(proper-t[lo])/(t[hi]-t[lo]))*s.duration/GRID;
}
export function tunnelArrival(s,origin,entryTime){
 if(origin!=='A'&&origin!=='B')throw Error('Неизвестное устье');
 valid(entryTime,0,100000,'момент запуска');
 const sourceAge=origin==='A'?mouthA(s,entryTime).tau:mouthB(s,entryTime).tau;
 const requestedAge=sourceAge+s.throatTime;
 return origin==='A'?inverseBClock(s,requestedAge):requestedAge;
}
export function externalArrival(s,origin,entryTime){
 if(origin!=='A'&&origin!=='B')throw Error('Неизвестное устье');
 if(!Number.isFinite(entryTime))throw Error('Некорректное время');
 if(origin==='B')return entryTime+mouthB(s,entryTime).x;
 // Unique future intersection: speed B(t) is strictly below c,
 // hence [t−t0−x_B(t)] increases monotonically.
 let lo=entryTime,hi=entryTime+s.maximumDistance+2;
 for(let i=0;i<56;i++){
  const mid=(lo+hi)/2;
  if(mid-entryTime>=mouthB(s,mid).x)hi=mid;else lo=mid;
 }
 return (lo+hi)/2;
}
function event(s,mouth,t,action){
 return {mouth,t,tau:mouth==='A'?mouthA(s,t).tau:mouthB(s,t).tau,
  x:mouth==='A'?0:mouthB(s,t).x,action};
}
export function sendSignal(s,{origin='B',first='tunnel',time=s.duration+8}={}){
 if(origin!=='A'&&origin!=='B')throw Error('Неверное устье отправления');
 if(first!=='tunnel'&&first!=='exterior')throw Error('Неверный первый маршрут');
 valid(time,0,100000,'момент отправки');
 const opposite=origin==='A'?'B':'A',other=first==='tunnel'?'exterior':'tunnel';
 const firstArrival=first==='tunnel'?tunnelArrival(s,origin,time):externalArrival(s,origin,time);
 const secondArrival=other==='tunnel'?tunnelArrival(s,opposite,firstArrival):externalArrival(s,opposite,firstArrival);
 const itinerary=[
  event(s,origin,time,'отправление'),
  event(s,opposite,firstArrival,first==='tunnel'?'выход из горловины':'приём снаружи'),
  event(s,origin,secondArrival,other==='tunnel'?'выход из горловины':'приём снаружи')
 ];
 return {origin,first,second:other,departure:time,
  firstArrival,returnTime:secondArrival,
  chronologyMargin:time-secondArrival,
  loop:secondArrival<time-1e-8,
  itinerary,segments:[
   {type:first,from:itinerary[0],to:itinerary[1]},
   {type:other,from:itinerary[1],to:itinerary[2]}
  ],waitingTime:Math.max(0,time-secondArrival)};
}
export function audit(s){
 const reunion=s.duration,lag=s.offset;
 const standard=sendSignal(s,{origin:'B',first:'tunnel',time:reunion+Math.max(12,s.maximumDistance+2)});
 return {distance:s.distance,maxDistance:s.maximumDistance,
  tripTime:reunion,ageA:reunion,ageB:s.age,lag,
  lagFraction:lag/reunion,clockRateEnd:1,
  threshold:s.distance+s.throatTime,
  analyticMargin:s.conditionMargin,
  chronologyPossible:standard.loop,
  witness:standard,
  simModel:'two worldlines in 1+1 flat background; prescribed traversable throat',
  exactRelativity:'special relativistic aging and null exterior signals',
  notModelled:'self-consistent Einstein solution, stability, quantum chronology protection, wormhole field source'};
}
export function sampleWorldlines(s,n=241){
 if(!Number.isInteger(n)||n<21||n>2001)throw Error('Неверная выборка');
 const max=s.duration+14,lines=[];
 for(let i=0;i<n;i++){
  const t=i*max/(n-1),b=mouthB(s,t);
  lines.push({t,xa:0,xb:b.x,taua:t,taub:b.tau,
   lag:t-b.tau,beta:b.v});
 }
 return lines;
}
