// Lighting originates from actual modeled Soviet apartment fixtures.
// No arbitrary lamps at sector centers: room shades and hallway opal bulbs
// are the source of the two cheap WebGL1 point lights.
import {SECTOR,TILE} from './rogue-world.mjs';
export const LIGHT_GRID=48;
const cache=new WeakMap();
export function hallFixtureHash(x,z,seed=0,epoch=0){
 return (Math.imul(x+109,73856093)^Math.imul(z+47,19349663)^Math.imul(seed+epoch*29,83492791))>>>0
}
export function hallHasLamp(x,z,seed,epoch){return hallFixtureHash(x,z,seed,epoch)%13===0}
const inRoom=(c,x,z)=>c.rooms.some(r=>x>=r.x0&&x<=r.x1&&z>=r.z0&&z<=r.z1);
export function sectorLightSources(c,seed){
 const cached=cache.get(c);if(cached)return cached;
 const lamps=[];
 for(const room of c.rooms){
  const x=c.cx*SECTOR+(room.x0+room.x1+1)*.5,z=c.cz*SECTOR+(room.z0+room.z1+1)*.5;
  lamps.push({x:(x+.12/TILE)*TILE,y:2.17,z:(z-.10/TILE)*TILE,kind:'room',room:room.type})
 }
 for(let z=0;z<SECTOR;z++)for(let x=0;x<SECTOR;x++){
  if(c.tiles[z*SECTOR+x]!==1||inRoom(c,x,z))continue;
  const wx=c.cx*SECTOR+x,wz=c.cz*SECTOR+z;
  if(!hallHasLamp(wx,wz,seed,c.epoch))continue;
  lamps.push({x:(wx+.5)*TILE,y:2.37,z:(wz+.5)*TILE,kind:'hall'})
 }
 cache.set(c,lamps);return lamps
}
export function selectPracticalLights(world,x,z){
 const nearby=world.nearby(x,z,17),all=[];
 for(const c of nearby){
  for(const source of sectorLightSources(c,world.seed)){
   const dx=source.x/TILE-x,dz=source.z/TILE-z,d2=dx*dx+dz*dz;
   if(d2>20*20)continue;
   // Prefer an actually visible fixture, not a warm bulb behind a solid wall.
   const visible=world.visible(x,z,source.x/TILE,source.z/TILE);
   all.push({source,d2,score:d2+(visible?0:340)})
  }
 }
 all.sort((a,b)=>a.score-b.score||a.d2-b.d2);
 const first=all[0]?.source||{x:x*TILE,y:2.38,z:z*TILE},
       second=all.find(p=>p.source!==first)?.source||first;
 return[first,second]
}
export function occupancyMask(world,x0,z0,size=LIGHT_GRID){
 const rgba=new Uint8Array(size*size*4);
 for(let z=0;z<size;z++)for(let x=0;x<size;x++){
  const xx=x0+x,zz=z0+z,base=(z*size+x)*4,walk=world.pass(xx,zz);
  rgba[base]=rgba[base+1]=rgba[base+2]=walk?255:0;rgba[base+3]=255
 }
 // A closed door must cast a shadow into the next room; an open hinged door
 // should not behave like an opaque wall filling its former threshold cell.
 const x1=x0+size,z1=z0+size;
 for(const c of world.nearby(x0+size*.5,z0+size*.5,size*.72))
  for(const door of c.doors){
   if(door.x<x0||door.x>=x1||door.z<z0||door.z>=z1)continue;
   if(world.legacyDoor(door,c))continue;
   if(world.doorState(door,c).angle<.84){
    const i=((door.z-z0)*size+(door.x-x0))*4;
    rgba[i]=rgba[i+1]=rgba[i+2]=0
   }
  }
 return rgba
}
export function lightingMaskKey(world,x,z,size=LIGHT_GRID){
 const sx=Math.floor(x)-Math.floor(size/2),sz=Math.floor(z)-Math.floor(size/2);
 const doors=[...world.doorStates].map(([id,state])=>id+':'+(state.angle<.84?'c':'o')).sort().join('|');
 return [sx,sz,world.terrainRevision,doors].join(':')
}

/**
 * Compact per-cell practical-light visibility, generated only when the
 * world tile, doors or layout changes. The WebGL1 fragment shader samples
 * this map ONCE instead of ray-marching 12–24 shadow texels per pixel.
 *
 * R/G: visibility of actual lamp A/B. B: solid tile. A: opaque texture.
 * O(48² + lit cells × ray length) per update, not per GPU fragment.
 */
export function practicalLightMap(x0,z0,walkMask,lights,size=LIGHT_GRID){
 const result=new Uint8Array(size*size*4),sample=(x,z)=>{
  const ix=Math.floor(x)-x0,iz=Math.floor(z)-z0;
  return ix>=0&&iz>=0&&ix<size&&iz<size&&walkMask[(iz*size+ix)*4]>0
 };
 for(let z=0;z<size;z++)for(let x=0;x<size;x++){
  const pixel=(z*size+x)*4,walk=walkMask[pixel]>0;
  result[pixel+2]=walk?255:0;result[pixel+3]=255;
  if(!walk)continue;
  const tx=x0+x+.5,tz=z0+z+.5;
  for(let k=0;k<2;k++){
   const lamp=lights[k];if(!lamp)continue;
   const sx=lamp.x/TILE,sz=lamp.z/TILE,dx=tx-sx,dz=tz-sz,d=Math.hypot(dx,dz);
   const maxRange=(k===0?8.7:7.6)/TILE;
   if(d>=maxRange)continue;
   const n=Math.max(1,Math.ceil(d*2.4));
   let visible=true;
   for(let j=1;j<n;j++){
    const t=j/n;
    if(!sample(sx+dx*t,sz+dz*t)){visible=false;break}
   }
   result[pixel+k]=visible?255:0
  }
 }
 return result
}
