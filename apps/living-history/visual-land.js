// A purely visual projection of daily work. No invented dance loops, no RNG changes.
import {walkPath,pathPosition,nearestLand,walkable} from './navigation.js';
export const LAND_SIZE=160;
const paths=new WeakMap();
export function fieldAppearance(s){
 const stages=new Uint8Array(LAND_SIZE*LAND_SIZE),doy=s.day%365,year=Math.floor((s.day-1)/365);
 for(const h of s.households){
  const crop=h.farmYear?.year===year?h.farmYear:null;
  const active=crop?.active||h.fields.filter((_,i)=>(i+year)%3!==0);
  const sown=crop?Math.min(active.length,Math.ceil(crop.sownArea/.0625)):0;
  const harvested=crop?Math.min(active.length,Math.floor(crop.harvestedArea/.0625)):0;
  for(const cell of h.fields)stages[cell]=1;
  for(let i=0;i<sown;i++)stages[active[i]]=doy>=145?3:2;
  for(let i=0;i<harvested;i++)stages[active[i]]=4;
 }
 return stages;
}
function pathFor(s,from,to){let memo=paths.get(s);if(!memo){memo=new Map();paths.set(s,memo);}
 const key=[Math.round(from.x),Math.round(from.y),Math.round(to.x),Math.round(to.y)].join(',');
 let path=memo.get(key);if(!path){path=walkPath(s,from,to);if(memo.size>1400)memo.clear();memo.set(key,path);}
 return path;
}
function yardPosition(s,h,id){
 // A stable spot in the actual courtyard. Residents do not orbit or bounce.
 const candidates=[[1,1],[2,1],[-1,2],[-2,1],[1,2],[2,-1],[-2,-1],[0,2],[1,-2],[-1,-2]];
 const first=id%candidates.length;
 for(let n=0;n<candidates.length;n++){const [dx,dy]=candidates[(first+n)%candidates.length];
  if(walkable(s,h.x+dx,h.y+dy))return {x:h.x+dx,y:h.y+dy};
 }
 return nearestLand(s,h)||{x:h.x,y:h.y};
}
export function personPosition(p,s,previous,progress,active=true){
 const h=s.households.find(h=>h.id===p.houseId);
 const raw=(p.job==='home'&&h)?yardPosition(s,h,p.id):{x:p.x,y:p.y};
 const end=nearestLand(s,raw);if(!end)return {x:p.x,y:p.y};
 const from=previous?.get(p.id)||end,start=nearestLand(s,from)||end;
 if(p.job==='home'&&h&&from.x===h.x&&from.y===h.y)return end;
 if(!active||!previous||Math.abs(start.x-end.x)+Math.abs(start.y-end.y)===0)return end;
 const t=Math.max(0,Math.min(1,progress));
 // Up to 72% of the displayed day is transit. After arrival they work or rest.
 return pathPosition(pathFor(s,start,end),Math.min(1,t/.72))||end;
}
export function cattlePosition(h,day,i,s=null){
 const grazing=day%365>=80&&day%365<=300&&Number.isInteger(h.lastPastureCell);
 const goal=grazing?{x:h.lastPastureCell%LAND_SIZE,y:(h.lastPastureCell/LAND_SIZE)|0}:h;
 let anchor={x:goal.x,y:goal.y};
 if(s&&grazing&&Number.isInteger(h.prevPastureCell)&&h.pastureMovedDay===Math.floor(day)){
  const start={x:h.prevPastureCell%LAND_SIZE,y:(h.prevPastureCell/LAND_SIZE)|0};
  const route=pathFor(s,start,goal);
  anchor=pathPosition(route,Math.min(1,Math.max(0,day-Math.floor(day))))||goal;
 }
 // Different animals stand at distinct positions, with infrequent small grazing steps.
 // There is no periodic orbit around their owner's house.
 const dx=((i*17+h.id*3)%7-3)*.30,dy=((i*11+h.id)%5-2)*.34;
 let candidate={x:anchor.x+dx,y:anchor.y+dy};
 if(s&&!walkable(s,candidate.x,candidate.y))candidate=anchor;
 return candidate;
}