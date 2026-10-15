/**
 * Continuous, full-turn route timeline.
 *
 * Stage 01 and stage 02 choose the active combat action; their waypoints form
 * ONE uninterrupted course covering all 4.5 seconds of the simultaneous turn.
 * At fixed course length, the outcome is independent of the simulation tick.
 */
export const TURN_SECONDS=4.5;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

export function buildCourse(ship,orders=ship.orders){
 const start={x:ship.x,y:ship.y};
 const legs=[];
 let from=start,total=0;
 for(let stage=0;stage<2;stage++){
  for(const point of orders?.[stage]?.route||[]){
   if(!Number.isFinite(point.x)||!Number.isFinite(point.y))continue;
   const length=distance(from,point);
   if(length<.001)continue;
   legs.push({from:{...from},to:{x:point.x,y:point.y},length,start:total,end:total+length,stage});
   total+=length;from=point;
  }
 }
 return {start,legs,total};
}
export function sampleCourse(course,timeSeconds,duration=TURN_SECONDS){
 const length=course.total;
 if(!length)return {...course.start,angle:null,distance:0};
 const traveled=length*clamp(timeSeconds/duration,0,1);
 const leg=course.legs.find(seg=>traveled<seg.end-1e-7)||course.legs[course.legs.length-1];
 const t=clamp((traveled-leg.start)/leg.length,0,1);
 return {x:leg.from.x+(leg.to.x-leg.from.x)*t,
         y:leg.from.y+(leg.to.y-leg.from.y)*t,
         angle:Math.atan2(leg.to.y-leg.from.y,leg.to.x-leg.from.x),
         distance:traveled};
}
export function courseSpeed(course,duration=TURN_SECONDS){
 return course.total/duration;
}
