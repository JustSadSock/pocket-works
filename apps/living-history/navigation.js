// Land-only movement shared by model and renderer. One tile is approximately 25 metres
// (0.0625 ha). No diagonal corner-cutting through rivers or hills.
export const MAP_SIDE = 160;
const CELLS=MAP_SIDE*MAP_SIDE;
const idx=(x,y)=>y*MAP_SIDE+x;
const pass=(s,x,y)=>x>=0&&y>=0&&x<MAP_SIDE&&y<MAP_SIDE&&s.terrain[idx(x,y)]===0;
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
// A* searches a local path only when a person's actual destination changes.
// A* on four-connected traversable ground. Terrain is static between saves, so
// paths are cacheable; cost is in walked tiles and cannot shortcut a river.
export function walkPath(s,from,to){const a=nearestLand(s,from),b=nearestLand(s,to);if(!a||!b)return [];
 const start=idx(a.x,a.y),end=idx(b.x,b.y);if(start===end)return [a];
 let cache=routeCache.get(s);if(!cache){cache=new Map();routeCache.set(s,cache);}
 const key=`${start}:${end}`;if(cache.has(key))return cache.get(key);
 const previous=new Int32Array(CELLS).fill(-1),distance=new Int32Array(CELLS).fill(2147483647),heap=[];
 const push=(node,score)=>{let n=heap.length;heap.push({node,score});while(n>0){const parent=(n-1)>>1;if(heap[parent].score<=score)break;heap[n]=heap[parent];n=parent;}heap[n]={node,score};};
 const pop=()=>{const best=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){let child=i*2+1;if(child>=heap.length)break;
    if(child+1<heap.length&&heap[child+1].score<heap[child].score)child++;
    if(last.score<=heap[child].score)break;heap[i]=heap[child];i=child;}heap[i]=last;}
  return best;};
 const heuristic=(node)=>Math.abs(node%MAP_SIDE-b.x)+Math.abs(((node/MAP_SIDE)|0)-b.y);
 distance[start]=0;previous[start]=start;push(start,heuristic(start));
 while(heap.length){const {node:cur,score}=pop();if(cur===end)break;
  if(score>distance[cur]+heuristic(cur))continue;
  const x=cur%MAP_SIDE,y=(cur/MAP_SIDE)|0;
  for(let d=0;d<4;d++){const nx=x+dirs[d],ny=y+dirs[d+1];if(!pass(s,nx,ny))continue;
   const ni=idx(nx,ny),next=distance[cur]+1;if(next>=distance[ni])continue;
   distance[ni]=next;previous[ni]=cur;push(ni,next+heuristic(ni));}
 }
 if(previous[end]<0)return [];
 const path=[];for(let i=end;i!==start;i=previous[i])path.push({x:i%MAP_SIDE,y:(i/MAP_SIDE)|0});path.push(a);path.reverse();
 if(cache.size>1200)cache.clear();cache.set(key,path);return path;
}
export function pathPosition(path,t){if(!path?.length)return null;if(path.length===1)return path[0];
 const n=(path.length-1)*Math.max(0,Math.min(1,t)),i=Math.min(path.length-2,Math.floor(n)),f=n-i;
 return {x:path[i].x+(path[i+1].x-path[i].x)*f,y:path[i].y+(path[i+1].y-path[i].y)*f};}
export function workdayFraction(steps){if(steps<0)return 0;
 // Round trip: 25 metres per cell, 4 km/h walking, 8.5h workday.
 return Math.max(.2,1-(2*steps*.025/4)/8.5);
}