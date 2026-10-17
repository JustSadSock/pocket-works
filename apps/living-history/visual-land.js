// Deterministic, read-only projection of genuine daily work and herd grazing.
// Drawing must never write model state, consume RNG, or create simulated agents.
import {walkPath,pathPosition,nearestLand,walkable} from './navigation.js';
export const LAND_SIZE=160;
const paths=new WeakMap(),TWO_PI=Math.PI*2;
const frac=x=>x-Math.floor(x);
const hash=(a,b,c)=>{let n=Math.imul((a|0)^0x62b5b311,374761393)^Math.imul((b|0)+127,668265263)^Math.imul((c|0)+521,1274126177);n=Math.imul(n^(n>>>13),1274126177);return (n^(n>>>16)>>>0)/4294967296;};
const smooth=t=>{const a=Math.max(0,Math.min(1,t));return a*a*(3-2*a);};
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
function pathFor(s,from,to){
 let memo=paths.get(s);
 const revision=`${s.landRevision||0}:${s.roadRevision||0}:${Math.floor((s.day||0)/30)}`;
 if(!memo||memo.revision!==revision){memo={revision,cache:new Map()};paths.set(s,memo);}
 const key=[Math.round(from.x),Math.round(from.y),Math.round(to.x),Math.round(to.y)].join(',');
 let path=memo.cache.get(key);
 if(!path){path=walkPath(s,from,to);if(memo.cache.size>900)memo.cache.clear();memo.cache.set(key,path);}
 return path;
}
function yardPosition(s,h,id){
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
 const end=nearestLand(s,raw)||{x:p.x,y:p.y};
 const t=Math.max(0,Math.min(1,progress));
 const earlier=previous?.get(p.id);
 const start=earlier?(nearestLand(s,earlier)||end):end;
 if(!active||!previous)return end;
 // The first part of the displayed day follows a real traversable route.
 // During the remaining day, actual jobs involve local unsynchronised motion,
 // rather than a worker teleporting to a plot and freezing in place.
 const moving=start.x!==end.x||start.y!==end.y;
 const travelEnd=moving?.72:0;
 if(moving&&t<travelEnd){
  const eased=smooth(t/travelEnd);
  return pathPosition(pathFor(s,start,end),eased)||end;
 }
 if(t>=1)return end;
 // A standing family at home does not invent a journey to a distant field.
 // Work is animated inside the current walkable tile only.
 const working=p.job!=='home';
 const phase=hash(s.seed,p.id,Math.floor(s.day/3));
 const angle=TWO_PI*(phase+(.21+.44*hash(p.id,s.day,73))*Math.max(0,t-travelEnd));
 const local=working?.35:.14;
 const fade=working?Math.sin(Math.PI*(t-travelEnd)/Math.max(.001,1-travelEnd)):Math.sin(Math.PI*t);
 const amount=Math.max(0,fade)*local;
 return {x:end.x+Math.cos(angle)*amount,y:end.y+Math.sin(angle)*amount};
}
function pastureTile(s,h,origin,x,y){
 if(!walkable(s,x,y))return false;
 const cell=y*LAND_SIZE+x;
 return s.commons?.[cell]===h.communityId&&s.pasture?.[cell]>0;
}
// Select distinct, genuinely accessible grazing cells for each animal.
// Waypoints depend on seed, owner, animal and multi-day phase — not a shared
// synchronized group trajectory. Does not consume forage or move real herds.
function grazingWaypoint(s,h,i,phase,anchor){
 const candidates=[];
 for(let r=0;r<=7;r++){
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
   if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;
   const x=anchor.x+dx,y=anchor.y+dy;
   if(!pastureTile(s,h,anchor,x,y))continue;
   // Favor 2–6 tiles of dispersion, with spatially stable individual preferences.
   const radius=Math.hypot(dx,dy);
   if(radius<1.6&&r!==7)continue;
   candidates.push({x,y,rank:hash(h.id+i*43,phase*7,s.seed+x*29+y*31)+(Math.abs(radius-4)*.021)});
  }
  if(r>=5&&candidates.length>=12)break;
 }
 if(!candidates.length)return anchor;
 candidates.sort((a,b)=>a.rank-b.rank||a.y-b.y||a.x-b.x);
 return {x:candidates[0].x,y:candidates[0].y};
}
export function cattlePosition(h,day,i,s=null){
 const grazing=day%365>=80&&day%365<=300&&Number.isInteger(h.lastPastureCell);
 const goal=grazing?{x:h.lastPastureCell%LAND_SIZE,y:(h.lastPastureCell/LAND_SIZE)|0}:h;
 const anchor=s?(nearestLand(s,goal)||h):goal;
 if(!s)return {x:anchor.x+((i*17+h.id*3)%7-3)*.3,y:anchor.y+((i*11+h.id)%5-2)*.34};
 if(!grazing){
  // In winter the animals remain at the actual farm, with distinct places.
  const at=yardPosition(s,h,h.id+i*31+17);
  return {x:at.x+.17*Math.cos(i*2.39),y:at.y+.17*Math.sin(i*2.39)};
 }
 const duration=3+Math.floor(hash(h.id,i,91)*4);
 const absolute=day+hash(s.seed,h.id+i*17,18)*duration;
 const phase=Math.floor(absolute/duration),t=smooth(frac(absolute/duration));
 const from=grazingWaypoint(s,h,i,phase,anchor);
 const to=grazingWaypoint(s,h,i,phase+1,anchor);
 if(from.x===to.x&&from.y===to.y)return from;
 return pathPosition(pathFor(s,from,to),t)||from;
}
