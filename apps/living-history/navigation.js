// Land-only movement shared by model and renderer. One tile is approximately 25 metres
// (0.0625 ha). No diagonal corner-cutting through rivers or hills.
export const MAP_SIDE = 160;
const CELLS=MAP_SIDE*MAP_SIDE;
const idx=(x,y)=>y*MAP_SIDE+x;
// Crofts are enclosed private land, not public shortcuts. Homes themselves
// remain valid endpoints for journeys to and from their front doors.
const pass=(s,x,y)=>x>=0&&y>=0&&x<MAP_SIDE&&y<MAP_SIDE&&s.terrain[idx(x,y)]===0&&s.usage?.[idx(x,y)]!==3;
const dirs=[1,0,-1,0,1];
const fields = new WeakMap();
const routeCache = new WeakMap();
export function walkable(s,x,y){return pass(s,Math.round(x),Math.round(y));}
export function nearestLand(s,p){const x=Math.round(p.x),y=Math.round(p.y);if(pass(s,x,y))return {x,y};
 for(let r=1;r<=9;r++)for(let dx=-r;dx<=r;dx++)for(const dy of [-r,r])if(pass(s,x+dx,y+dy))return {x:x+dx,y:y+dy};
 for(let r=1;r<=9;r++)for(let dy=-r+1;dy<r;dy++)for(const dx of [-r,r])if(pass(s,x+dx,y+dy))return {x:x+dx,y:y+dy};
 return null;}
export function walkingDistances(s,origin){const start=nearestLand(s,origin);if(!start)return new Int16Array(CELLS).fill(-1);
 let memo=fields.get(s);if(!memo){memo=new Map();fields.set(s,memo);}const key=idx(start.x,start.y);
 if(memo.has(key))return memo.get(key);
 const steps=new Int16Array(CELLS).fill(-1),queue=new Int32Array(CELLS);let head=0,tail=0;queue[tail++]=key;steps[key]=0;
 while(head<tail){const at=queue[head++],x=at%MAP_SIDE,y=(at/MAP_SIDE)|0;
  for(let d=0;d<4;d++){const nx=x+dirs[d],ny=y+dirs[d+1];if(!pass(s,nx,ny))continue;
   const ni=idx(nx,ny);if(steps[ni]>=0)continue;steps[ni]=steps[at]+1;queue[tail++]=ni;}
 }
 if(memo.size>280)memo.clear();memo.set(key,steps);return steps;
}
export function walkingSteps(s,from,to){const end=nearestLand(s,to);return end?walkingDistances(s,from)[idx(end.x,end.y)]:-1;}
// Weather is deterministic by 30-day period and scenario: no random number is
// consumed by navigation. Mud damages unimproved paths more than worn lanes.
export function roadWetness(s){
 const month=Math.floor(Math.max(0,s.day||0)/30);
 const season=(s.day||0)%365;
 const seasonal=season<85||season>275?.57:.27;
 const pulse=Math.sin((s.seed||0)*.00971+month*3.017)*.14;
 return Math.max(.08,Math.min(.9,seasonal+pulse));
}
export function roadCost(s,cell){
 if(!Number.isInteger(cell)||cell<0||cell>=CELLS)return Infinity;
 const used=s.traffic?.[cell]||0;
 const wear=Math.min(1,Math.max(0,used)/90);
 const mud=roadWetness(s);
 // Walking off a path always costs at least a healthy person's travel time.
 // A well-used track cannot be a teleport and at most saves ~28%.
 const surface=1+.22*mud;
 const worn=.76+.075*mud;
 const base=surface*(1-wear)+worn*wear;
 return base+(s.usage?.[cell]===1?.18:0);
}
export function pathEffort(s,path){
 if(!path?.length)return Infinity;
 if(path.length===1)return 0;
 let total=0;
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i];
  const dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);
  if(dx+dy!==1)return Infinity; // no diagonal or disconnected shortcuts
  const at=idx(b.x,b.y);
  if(!pass(s,b.x,b.y))return Infinity;
  total+=roadCost(s,at);
 }
 return Math.round(total*10000)/10000;
}
// Shared A* is based on *time/effort*, not merely distance. Road and weather
// changes make alternative routes worthwhile. Cache invalidation is tied to
// serialized roadRevision and calendar month: saving/loading is deterministic.
export function walkPath(s,from,to){
 const a=nearestLand(s,from),b=nearestLand(s,to);if(!a||!b)return [];
 const start=idx(a.x,a.y),end=idx(b.x,b.y);if(start===end)return [a];
 let cache=routeCache.get(s);if(!cache){cache={key:null,paths:new Map()};routeCache.set(s,cache);}
 const epoch=`${Math.floor((s.day||0)/30)}:${s.roadRevision||0}`;
 if(cache.key!==epoch){cache.key=epoch;cache.paths.clear();}
 const key=`${start}:${end}`;if(cache.paths.has(key))return cache.paths.get(key);
 const previous=new Int32Array(CELLS).fill(-1),distance=new Float64Array(CELLS).fill(Infinity),heap=[];
 const push=(node,score)=>{let n=heap.length;heap.push({node,score});while(n>0){const parent=(n-1)>>1;if(heap[parent].score<=score)break;heap[n]=heap[parent];n=parent;}heap[n]={node,score};};
 const pop=()=>{const best=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){let child=i*2+1;if(child>=heap.length)break;
    if(child+1<heap.length&&heap[child+1].score<heap[child].score)child++;
    if(last.score<=heap[child].score)break;heap[i]=heap[child];i=child;}heap[i]=last;}
  return best;};
 // 0.76 is the minimum possible tile cost; this heuristic never overestimates.
 const heuristic=node=>.76*(Math.abs(node%MAP_SIDE-b.x)+Math.abs(((node/MAP_SIDE)|0)-b.y));
 distance[start]=0;previous[start]=start;push(start,heuristic(start));
 while(heap.length){const {node:cur,score}=pop();
  if(score>distance[cur]+heuristic(cur)+1e-9)continue;
  if(cur===end)break;
  const x=cur%MAP_SIDE,y=(cur/MAP_SIDE)|0;
  for(let d=0;d<4;d++){const nx=x+dirs[d],ny=y+dirs[d+1];if(!pass(s,nx,ny))continue;
   const ni=idx(nx,ny),next=distance[cur]+roadCost(s,ni);if(next>=distance[ni]-1e-9)continue;
   distance[ni]=next;previous[ni]=cur;push(ni,next+heuristic(ni));}
 }
 if(previous[end]<0)return [];
 const path=[];for(let i=end;i!==start;i=previous[i])path.push({x:i%MAP_SIDE,y:(i/MAP_SIDE)|0});path.push(a);path.reverse();
 if(cache.paths.size>1600)cache.paths.clear();
 cache.paths.set(key,path);return path;
}
export function pathPosition(path,t){if(!path?.length)return null;if(path.length===1)return path[0];
 const n=(path.length-1)*Math.max(0,Math.min(1,t)),i=Math.min(path.length-2,Math.floor(n)),f=n-i;
 return {x:path[i].x+(path[i+1].x-path[i].x)*f,y:path[i].y+(path[i+1].y-path[i].y)*f};}
export function workdayFraction(steps){if(steps<0)return 0;
 // Round trip: 25 metres per cell, 4 km/h walking, 8.5h workday.
 return Math.max(.2,1-(2*steps*.025/4)/8.5);
}