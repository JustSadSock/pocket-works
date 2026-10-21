import assert from 'node:assert/strict';
import {zoneFor,SHAPE_CORRECTED_ZONE_OFFSET,BALANCED_ZONE_OFFSET,W,H} from '../artworks.js';
const area=points=>Math.abs(points.reduce((sum,[x,y],i)=>{
 const [nx,ny]=points[(i+1)%points.length];return sum+x*ny-nx*y;
},0))*.5;
let checked=0;
for(const art of [1,3,11,45,80,120,135]){
 for(const seed of [0,1,18,1007,0x72adba1]){
  const version=SHAPE_CORRECTED_ZONE_OFFSET+seed;
  for(const aspect of [.35,.5,1,4/3,2,3.5]){
   const zone=zoneFor(art,version,aspect);
   assert.deepEqual(zone,zoneFor(art,version,aspect));
   assert(Math.abs(area(zone.points)/(W*H)-.03)<.0001,'area of corrected shape');
   assert(zone.points.every(([x,y])=>x>=2&&x<=W-2&&y>=2&&y<=H-2),'clipped mask');
   if(zone.kind==='round'){
    const onScreenWidth=zone.w*aspect/(W/H);
    assert(onScreenWidth/zone.h>.72&&onScreenWidth/zone.h<1.35,'stretched circle '+aspect);
   }
   checked++;
  }
 }
}
const old=zoneFor(4,BALANCED_ZONE_OFFSET+112);
assert.deepEqual(old,zoneFor(4,BALANCED_ZONE_OFFSET+112,.45),'pinned masks may not change with aspect');
console.log('ZAMAZKA geometry: '+checked+' ratios/old-mask checks passed without TypeScript dependencies');
