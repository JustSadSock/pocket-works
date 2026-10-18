// Deterministic camera targets for automated visual regression and human art review.
// Debug-only module: gameplay does not read or modify these fixtures.
import {SECTOR} from './rogue-world.mjs';
export const VISUAL_SEEDS=Object.freeze([222,413,8787,4,14]);
export const VISUAL_SCENES=Object.freeze(['corridor','living','kitchen','bedroom','bathroom','closet','nursery']);
const sq=(x)=>x*x;
function candidate(world,room,c){
 const ox=c.cx*SECTOR,oz=c.cz*SECTOR;
 const cx=ox+(room.x0+room.x1+1)/2,cz=oz+(room.z0+room.z1+1)/2;
 let best=null,bestDist=Infinity;
 for(let z=room.z0;z<=room.z1;z++)for(let x=room.x0;x<=room.x1;x++){
  const px=ox+x+.5,pz=oz+z+.5;
  if(!world.canStand(px,pz))continue;
  const dist=sq(px-cx)+sq(pz-cz);
  if(dist<bestDist){best={x:px,z:pz,yaw:0,pitch:0,scene:room.type,chunk:c.stamp};bestDist=dist}
 }
 if(best){best.yaw=Math.atan2(cx-best.x,best.z-cz||-0.0001)}
 return best
}
export function visualBookmark(world,scene){
 if(scene==='corridor')return {x:9.5,z:9.5,yaw:0,pitch:0,scene,chunk:'0,0'};
 if(!VISUAL_SCENES.includes(scene))return null;
 const candidates=[];
 for(let cz=-1;cz<=1;cz++)for(let cx=-1;cx<=1;cx++){
  const chunk=world.chunk(cx,cz);
  for(const room of chunk.rooms){
   if(room.type!==scene)continue;
   const a=candidate(world,room,chunk);if(a)candidates.push(a)
  }
 }
 // Stable nearest room makes screenshots comparable and prevents excessive loading.
 candidates.sort((a,b)=>sq(a.x-9.5)+sq(a.z-9.5)-sq(b.x-9.5)-sq(b.z-9.5));
 return candidates[0]||null
}
export function visualCoverage(world,renderer){
 const chunks=world.nearby(9.5,9.5,18);
 const kinds=new Set(),rooms=new Set();
 for(const c of chunks){
  for(const prop of c.props)kinds.add(prop.type);
  for(const room of c.rooms)rooms.add(room.type)
 }
 return {
  seed:world.seed,roomTypes:[...rooms].sort(),propTypes:[...kinds].sort(),
  renderer:renderer?.visualMetrics?{...renderer.visualMetrics}:null
 }
}
