// Authoritative per-worker daily time budget shared by real production and
// subday animation. Hours are measured, not created by UI frame rate.
// All production still settles in the existing deterministic daily ledger.
import {walkPath,pathEffort} from './navigation.js';

export const WORK_HOURS=8.5;
export const WALK_KM_PER_CELL=.025;
export const WALK_KMH=4;
export const MAX_START_HOUR=8;
const round=x=>Math.round(x*10000)/10000;
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
function hash3(a,b,c){
 let n=Math.imul((a|0)+71,1597334677)^Math.imul((b|0)+13,3812015801)^Math.imul((c|0)+113,1103515245);
 n=Math.imul(n^(n>>>16),2246822519);
 return (n^(n>>>13)>>>0)/4294967296;
}
export function scheduleWork(s,person,kind,destination,home){
 const from=home||s.households.find(h=>h.id===person.houseId)||person;
 const to=destination||from;
 const route=walkPath(s,from,to);
 const effort=pathEffort(s,route);
 const oneWay=Number.isFinite(effort)?effort*WALK_KM_PER_CELL/WALK_KMH:Infinity;
 const travelHours=2*oneWay;
 const hours=clamp(WORK_HOURS-travelHours,0,WORK_HOURS);
 const start=7+hash3(s.seed,person.id,s.day)*.75;
 const arrive=start+oneWay;
 const returnStart=arrive+hours;
 const end=returnStart+oneWay;
 const shift={
  day:s.day,kind,from:{x:from.x,y:from.y},to:{x:to.x,y:to.y},
  depart:round(start),arrive:round(arrive),returnStart:round(returnStart),end:round(end),
  workHours:round(hours),travelHours:round(travelHours),
  fraction:round(hours/WORK_HOURS),pathEffort:round(effort)
 };
 return shift;
}
export function commitWork(s,person,shift){
 if(!shift||shift.day!==s.day||!Number.isFinite(shift.workHours)||shift.workHours<0)throw Error('Invalid daily work schedule');
 if(person.dailyShift?.day===s.day)throw Error('Daily shift assigned twice to person '+person.id);
 person.dailyShift=shift;
 if(shift.workHours>0){
  person.job=shift.kind;
  person.x=shift.to.x;person.y=shift.to.y;
 }
 return shift.fraction;
}
export function timeAt(shift,phase){
 const hour=Math.min(24,Math.max(0,phase*24));
 if(hour<shift.depart)return {phase:'home',part:0};
 if(hour<shift.arrive)return {phase:'travel',part:(hour-shift.depart)/Math.max(.001,shift.arrive-shift.depart)};
 if(hour<shift.returnStart)return {phase:'work',part:(hour-shift.arrive)/Math.max(.001,shift.returnStart-shift.arrive)};
 if(hour<shift.end)return {phase:'return',part:(hour-shift.returnStart)/Math.max(.001,shift.end-shift.returnStart)};
 return {phase:'home',part:1};
}
export function shiftAudit(s){
 const issues=[];for(const p of s.people){
  const q=p.dailyShift;if(!q)continue;
  if(q.day>s.day||q.day<s.day-1)continue;
  if(!Number.isFinite(q.workHours)||q.workHours<0||q.workHours>WORK_HOURS+.001||
   !Number.isFinite(q.travelHours)||q.travelHours<0||
   q.workHours+q.travelHours>WORK_HOURS+.02||
   q.depart<7||q.depart>8||q.arrive<q.depart||q.returnStart<q.arrive||q.end<q.returnStart||
   q.end>24)issues.push('Неверное рабочее время '+p.id+': '+JSON.stringify(q));
 }
 return issues;
}
