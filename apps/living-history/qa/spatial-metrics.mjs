// Read-only spatial diagnostics for Living History. No simulation rules or RNG.
export const TRACK_WEAR=12;
export const MAIN_WEAR=55;
export const NEAR_ROAD_TILES=2;

export function median(values){
 const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
 const n=sorted.length;
 return n?(n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2):null;
}
export function share(values){
 return values.length?values.filter(Boolean).length/values.length:null;
}
export function networkDistances(traffic,side,minimum=TRACK_WEAR){
 if(!Number.isInteger(side)||side<1||!traffic||traffic.length!==side*side)throw Error('Invalid road raster');
 const d=new Int16Array(side*side).fill(-1),q=new Int32Array(side*side);
 let head=0,tail=0;
 for(let i=0;i<traffic.length;i++)if(traffic[i]>=minimum){d[i]=0;q[tail++]=i;}
 while(head<tail){
  const i=q[head++],x=i%side,y=(i/side)|0;
  const adjacent=[x>0?i-1:-1,x+1<side?i+1:-1,y>0?i-side:-1,y+1<side?i+side:-1];
  for(const ni of adjacent)if(ni>=0&&d[ni]<0){d[ni]=d[i]+1;q[tail++]=ni;}
 }
 return d;
}
// A genuine junction has 3+ independently traversable, sufficiently worn
// orthogonal branches. A house's single access track does not count.
export function roadJunctions(traffic,side,minimum=MAIN_WEAR){
 if(traffic.length!==side*side)throw Error('Invalid junction raster');
 const mask=new Uint8Array(traffic.length);
 for(let i=0;i<traffic.length;i++){
  if(traffic[i]<minimum)continue;
  const x=i%side,y=(i/side)|0;
  const degree=(x>0&&traffic[i-1]>=minimum)+(x+1<side&&traffic[i+1]>=minimum)
   +(y>0&&traffic[i-side]>=minimum)+(y+1<side&&traffic[i+side]>=minimum);
  if(degree>=3)mask[i]=1;
 }
 return mask;
}
export function homeRoadMetrics(traffic,side,homes){
 const worn=networkDistances(traffic,side,TRACK_WEAR);
 const main=networkDistances(traffic,side,MAIN_WEAR);
 const junctionMask=roadJunctions(traffic,side);
 const junction=networkDistances(junctionMask,side,1);
 const at=(d,h)=>Number.isInteger(h.x)&&Number.isInteger(h.y)
  &&h.x>=0&&h.y>=0&&h.x<side&&h.y<side?d[h.y*side+h.x]:-1;
 const wornDistances=homes.map(h=>at(worn,h)),mainDistances=homes.map(h=>at(main,h)),junctionDistances=homes.map(h=>at(junction,h));
 const reachable=values=>values.filter(x=>x>=0);
 return {
  trackDistanceTilesMedian:median(reachable(wornDistances)),
  mainRoadDistanceTilesMedian:median(reachable(mainDistances)),
  junctionDistanceTilesMedian:median(reachable(junctionDistances)),
  mainRoadWithinTwoTilesShare:share(mainDistances.map(d=>d>=0&&d<=NEAR_ROAD_TILES)),
  junctionWithinSixTilesShare:share(junctionDistances.map(d=>d>=0&&d<=6)),
  junctionCount:junctionMask.reduce((n,x)=>n+x,0),
  homesWithoutMainRoad:mainDistances.filter(d=>d<0).length,
  homesWithoutJunction: junctionDistances.filter(d=>d<0).length,
 };
}
// Controlled instantaneous road ablation: the same frozen settlement and site
// choice, but no road-wear signal. Never advance either world; not a forecast.
export function siteSelectionAblation(world,siteSelector,maxHomesPerCommunity=2){
 const without={...world,traffic:new Array(world.traffic.length).fill(0),roadRevision:(world.roadRevision||0)+1};
 const live=new Set(world.people.filter(p=>p.alive).map(p=>p.id));
 const results=[];
 for(const c of world.communities){
  const homes=world.households.filter(h=>h.communityId===c.id&&h.members.some(id=>live.has(id)))
   .sort((a,b)=>a.id-b.id).slice(0,maxHomesPerCommunity);
  for(const h of homes){
   const actual=siteSelector(world,c,h,15),ablated=siteSelector(without,c,h,15);
   results.push({communityId:c.id,homeId:h.id,actual,ablated,changed:Boolean(actual&&ablated&&(actual.x!==ablated.x||actual.y!==ablated.y)),comparable:Boolean(actual&&ablated)});
  }
 }
 return results;
}
