// Intersect a screen picking ray with actual furniture top planes. Targeting a
// table's visible surface is independent of where its shadow hits the floor.
export function findSurfaceTarget(ray,supports,ignoreId=null,margin=.08){
 if(!ray||Math.abs(ray.direction?.y||0)<1e-6)return null;
 let found=null;
 for(const support of supports){
  if(support.id===ignoreId||!(support.top>0))continue;
  const t=(support.top-ray.origin.y)/ray.direction.y;
  if(!Number.isFinite(t)||t<0)continue;
  const x=ray.origin.x+ray.direction.x*t,z=ray.origin.z+ray.direction.z*t;
  const [width,depth]=support.size;
  if(Math.abs(x-support.x)>width/2+margin||Math.abs(z-support.z)>depth/2+margin)continue;
  if(!found||t<found.distance)found={x,z,y:support.top,support:support.id,distance:t};
 }
 return found;
}
