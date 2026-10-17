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
// A visible citizen moves only for a committed work shift or a real trip.
// Idle families remain home. There is no sinusoidal household wandering.
export function planSubday(world){
 const households=new Map(world.households.map(h=>[h.id,h]));
 const plans=new Map();
 const counters={home:0,farm:0,wood:0,build:0,herd:0,haul:0,other:0,travel:0};
 for(const p of world.people){
  if(!p.alive)continue;
  const home=nearestLand(world,households.get(p.houseId)||p)||{x:p.x,y:p.y};
  const shift=p.dailyShift?.day===world.day?p.dailyShift:null;
  const trip=p.travel&&p.travel.start<=world.day&&p.travel.end>world.day?p.travel:null;
  const job=shift?.kind|| (trip?'haul':p.job||'home');
  // Actual multi-day transport and migration have explicit endpoints and dates.
  const from=shift?.from||trip?.from||home;
  const to=shift?.to||trip?.to||home;
  const route=shift?.routeCells?.length
   ?shift.routeCells.map(cell=>({x:cell%160,y:Math.floor(cell/160)}))
   :trip?.points?.length>1?trip.points:
    (!same(from,to)?walkPath(world,from,to):[from]);
  const safeRoute=route.length?route:[from];
  const length=Math.max(0,safeRoute.length-1);
  counters[trip?'travel':shift?job in counters?job:'other':'home']++;
  plans.set(p.id,{id:p.id,job,from,to,route:safeRoute,shift,trip,length,
   departure:shift?shift.depart/24:0,
   arrival:shift?shift.arrive/24:0,
   returnStart:shift?shift.returnStart/24:0,
   returnEnd:shift?shift.end/24:0,
   phase:h32(p.id,world.seed,world.day)});
 }
 return {day:world.day,seed:world.seed,plans,counters,kind:'subday'};
}
const inactive=point=>({...point,activity:'home',pose:0});
// Real farm work happens on a measured strip. A small straight furrow motion
// represents handling the currently assigned tile; no circles, no trips
// to fictional fields and no actor motion in idle households.
function workPose(p,t){
 if(p.job==='farm'){
  const travel=(t*2+p.phase)%2;
  const furrow=travel<1?travel:2-travel;
  const lateral=(furrow-.5)*.36;
  const axis=p.to.x%2===0;
  return {x:p.to.x+(axis?lateral:0),y:p.to.y+(axis?0:lateral),
   activity:p.job,pose:Math.floor(t*14)%2};
 }
 // Builders and woodcutters can swing tools without translating their feet.
 return {...p.to,activity:p.job,pose:Math.floor(t*14)%2};
}
function sampleJourney(p,day,t){
 const trip=p.trip;
 const outbound=Math.max(1,trip.arrival-trip.start);
 if(trip.end<=trip.arrival){
  const progress=clamp((day+t-trip.start)/outbound);
  return {...(pathPosition(p.route,progress)||p.to),activity:'haul',pose:1};
 }
 if(day+t<=trip.arrival){
  const progress=clamp((day+t-trip.start)/outbound);
  return {...(pathPosition(p.route,progress)||p.to),activity:'haul',pose:1};
 }
 const returnDays=Math.max(1,trip.end-trip.arrival);
 const progress=clamp((day+t-trip.arrival)/returnDays);
 return {...(pathPosition(p.route,1-progress)||p.from),activity:'return',pose:1};
}
export function sampleSubday(person,dayPlan,time){
 if(!dayPlan||!dayPlan.plans.has(person.id))return {x:person.x,y:person.y,activity:'absent',pose:0};
 const p=dayPlan.plans.get(person.id),t=clamp(time);
 if(p.shift){
  const phase=timeAt(p.shift,t);
  if(phase.phase==='home')return inactive(p.from);
  if(phase.phase==='travel'||phase.phase==='return'){
   const progress=phase.phase==='travel'?phase.part:1-phase.part;
   // Route pace derives from actual work/commute hours, not an arbitrary
   // slow visual curve. Every intermediate point lies on the traversed path.
   return {...(pathPosition(p.route,progress)||p.to),activity:phase.phase,pose:1};
  }
  return workPose(p,phase.part);
 }
 if(p.trip)return sampleJourney(p,dayPlan.day,t);
 // Historic saves without a current shift and residents who are not
 // employed must never be forced to stroll around their houses.
 return inactive(p.from);
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
