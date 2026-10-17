// Two levels of time detail for Living History.
// The authoritative economic/demographic model advances exactly in WHOLE days.
// At <=1 day/sec, this read-only subday layer constructs individual work
// schedules with traversable routes. Above 1 day/sec the view uses smoothed
// daily endpoints, never invented fractional transactions or births.
import {walkPath,pathPosition,nearestLand,walkable} from './navigation.js';
import {timeAt} from './work-time.js';

const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,v));
const smooth=v=>{const x=clamp(v);return x*x*(3-2*x);};
const h32=(a,b,c=0)=>{let n=Math.imul((a|0)+0x51ed270b,1597334677)^Math.imul((b|0)+103,3812015801)^Math.imul((c|0)+97,1103515245);n=Math.imul(n^(n>>>16),2246822519);return ((n^(n>>>13))>>>0)/4294967296;};
const move=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const same=(a,b)=>a.x===b.x&&a.y===b.y;
export const FINE_MAX_SPEED=1;
export const SUPPORTED_SPEEDS=Object.freeze([0,.25,.5,1,5,20]);
export function timeMode(speed){if(!SUPPORTED_SPEEDS.includes(speed))throw Error('Unsupported time speed '+speed);return speed===0?'paused':speed<=FINE_MAX_SPEED?'fine':'coarse';}
export function integrateClock(acc,deltaSeconds,speed){
 const mode=timeMode(speed);
 if(mode==='paused')return {days:0,phase:clamp(acc),mode};
 const total=acc+Math.max(0,Math.min(.08,Number.isFinite(deltaSeconds)?deltaSeconds:0))*speed;
 const days=Math.min(40,Math.floor(total+1e-9));
 return {days,phase:clamp(Math.max(0,total-days)),mode};
}
export function dayClock(phase){
 const minutes=Math.min(1439,Math.max(0,Math.floor(clamp(phase)*1440)));
 return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
}
export function dayPhase(phase){
 if(phase<.17)return 'Утро';
 if(phase<.43)return 'Дорога к работе';
 if(phase<.73)return 'Рабочий день';
 if(phase<.91)return 'Возвращение';
 return 'Вечер';
}
// The real model records work per *day*. Do not split grain/wood/cash into
// simulated hourly transfers here. The subday scheduler is a deterministic
// spatial account of the jobs already committed by advanceDays().
export function planSubday(world){
 const households=new Map(world.households.map(h=>[h.id,h]));
 const plans=new Map();
 const counters={home:0,farm:0,wood:0,build:0,herd:0,haul:0,other:0,travel:0};
 for(const p of world.people){
  if(!p.alive)continue;
  const h=households.get(p.houseId);
  const from=nearestLand(world,h||p)||{x:p.x,y:p.y};
  const to=nearestLand(world,p.job==='home'&&h?h:p)||from;
  const traveling=Boolean(p.travel&&p.travel.end>world.day);
  const shift=p.dailyShift?.day===world.day?p.dailyShift:null;
  const job=shift?.kind||p.job||'home';
  counters[traveling?'travel':job in counters?job:'other']++;
  const start=shift?.from||from,end=shift?.to||to;
  const route=(job!=='home'||traveling)&&!same(start,end)?walkPath(world,start,end):[start];
  const length=Math.max(0,route.length-1);
  const offset=h32(world.seed,p.id,world.day);
  const departure=.16+offset*.12;
  const outward=Math.min(.21,Math.max(.05,length*.006));
  const arrival=Math.min(.55,departure+outward);
  const returnStart=.76+h32(p.id,world.day,43)*.07;
  const returnEnd=Math.min(.96,returnStart+outward);
  plans.set(p.id,{id:p.id,job,traveling,from:start,to:end,route,
   departure:shift?shift.depart/24:departure,arrival:shift?shift.arrive/24:arrival,
   returnStart:shift?shift.returnStart/24:returnStart,
   returnEnd:shift?shift.end/24:returnEnd,
   shift,phase:h32(p.id,world.day,11),length});
 }
 return {day:world.day,seed:world.seed,plans,counters,kind:'subday'};
}
function oscillate(phase){
 const cycle=phase*2*Math.PI;
 return {x:Math.cos(cycle),y:Math.sin(cycle)};
}
export function sampleSubday(person,dayPlan,time){
 if(!dayPlan||!dayPlan.plans.has(person.id))return {x:person.x,y:person.y,activity:'absent',pose:0};
 const p=dayPlan.plans.get(person.id),t=clamp(time);
 // Authoritative schedules are committed by the economic engine. The visual
 // projection never chooses independent working hours or invents a job.
 if(p.shift){
  const phase=timeAt(p.shift,t);
  if(phase.phase==='home')return {...p.from,activity:'home',pose:0};
  if(phase.phase==='travel'||phase.phase==='return'){
   const q=phase.phase==='travel'?smooth(phase.part):1-smooth(phase.part);
   const point=pathPosition(p.route,q)||p.to;
   return {...point,activity:phase.phase,pose:1};
  }
  const angle=p.phase+phase.part*(p.job==='farm'?3.2:2.1);
  const swing=Math.sin(Math.PI*phase.part)*.22;
  const wave=oscillate(angle);
  return {x:p.to.x+wave.x*swing,y:p.to.y+wave.y*swing,
   activity:p.job,pose:Math.floor(phase.part*(p.job==='build'?8:6))%2};
 }
 if(p.job==='home'&&!p.traveling){
  const wiggle=oscillate(t*.72+p.phase);
  const scale=Math.sin(Math.PI*t)*.13;
  return {x:p.from.x+wiggle.x*scale,y:p.from.y+wiggle.y*scale,activity:'home',pose:0};
 }
 if(t<=p.departure)return {...p.from,activity:'home',pose:0};
 if(t<p.arrival){
  const point=pathPosition(p.route,smooth((t-p.departure)/Math.max(.001,p.arrival-p.departure)))||p.to;
  return {...point,activity:'travel',pose:1};
 }
 if(p.traveling){
  const point=p.to;
  return {...point,activity:'haul',pose:0};
 }
 if(t<p.returnStart){
  // Real workplace and person-specific, bounded local animation. No invented
  // walks into another field, croft or river.
  const phase=(t-p.arrival)/Math.max(.001,p.returnStart-p.arrival);
  const oscillation=oscillate(p.phase+phase*(p.job==='farm'?3.2:2.1));
  const swing=Math.sin(Math.PI*phase)*.22;
  return {x:p.to.x+oscillation.x*swing,y:p.to.y+oscillation.y*swing,
   activity:p.job,pose:Math.floor(phase*(p.job==='build'?8:6))%2};
 }
 if(t<p.returnEnd){
  const point=pathPosition(p.route,1-smooth((t-p.returnStart)/Math.max(.001,p.returnEnd-p.returnStart)))||p.from;
  return {...point,activity:'return',pose:1};
 }
 return {...p.from,activity:'home',pose:0};
}
export function makeFastView(){return {positions:new Map(),animals:new Map(),kind:'coarse'};}
// Keep actual herds visible at high speed without jumping between weekly pasture sites.
export function fastAnimalPosition(view,key,target,dt){
 const start=view.animals.get(key)||target;
 const factor=1-Math.exp(-Math.max(0,Math.min(.08,dt))*7);
 const next=move(start,target,factor);
 view.animals.set(key,next);
 return next;
}
// Fast mode depicts real end-of-day locations and household counts. An
// exponential screen-space follower prevents unreadable daily teleports.
export function advanceFastView(view,world,dt){
 const factor=1-Math.exp(-Math.max(0,Math.min(.08,dt))*9);
 const seen=new Set();
 const homes=new Map(world.households.map(h=>[h.id,h]));
 for(const p of world.people){
  if(!p.alive)continue;
  seen.add(p.id);
  const h=homes.get(p.houseId);
  const goal=p.job==='home'&&h?h:p;
  const prev=view.positions.get(p.id)||{x:goal.x,y:goal.y};
  view.positions.set(p.id,move(prev,goal,factor));
 }
 for(const id of view.positions.keys())if(!seen.has(id))view.positions.delete(id);
 return view;
}
export function subdayCounts(plan){return plan?{...plan.counters}:{};}
export function activeShiftCounts(plan,time){
 const out={home:0,travel:0,work:0,return:0};
 if(!plan)return out;
 for(const p of plan.plans.values()){
  if(!p.shift)continue;
  const activity=timeAt(p.shift,time).phase;
  out[activity]++;
 }
 return out;
}
