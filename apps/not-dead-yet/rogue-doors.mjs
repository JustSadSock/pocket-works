// Shared collision + geometry contract for the endless apartment's interior doors.
// Units are 1.27m world tiles, not WebGL metres. A single hinged panel spans
// almost the full doorway and swings INTO the room (not into the narrow hall).
export const DOOR_SWING=Math.PI*0.48;
export const DOOR_LENGTH=0.88;
export const DOOR_THICKNESS=0.065;
export const DOOR_SPEED=2.7;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export const doorKey=(door,epoch=0)=>`${door.id}:${door.x},${door.z}:${door.side}:${epoch}`;
export function doorSegment(door,angle=0){
 const t=clamp(Number.isFinite(angle)?angle:0,0,DOOR_SWING),sin=Math.sin(t),cos=Math.cos(t);
 if(door.side==='left'||door.side==='right'){
  const a={x:door.x+.5,z:door.z+.06},sgn=door.side==='left'?-1:1;
  return{a,b:{x:a.x+sgn*DOOR_LENGTH*sin,z:a.z+DOOR_LENGTH*cos}};
 }
 const a={x:door.x+.06,z:door.z+.5},sgn=door.side==='south'?-1:1;
 return{a,b:{x:a.x+DOOR_LENGTH*cos,z:a.z+sgn*DOOR_LENGTH*sin}}
}
export function pointSegmentDistance(x,z,a,b){
 const dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz||1e-12;
 const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/len,0,1);
 return Math.hypot(x-a.x-t*dx,z-a.z-t*dz)
}
export function leafBlocksPoint(door,angle,x,z,radius=.20){
 const segment=doorSegment(door,angle);
 return pointSegmentDistance(x,z,segment.a,segment.b)<radius+DOOR_THICKNESS*.5
}
export function leafIntersectsRay(door,angle,ax,az,bx,bz){
 const {a,b}=doorSegment(door,angle);
 const ux=bx-ax,uz=bz-az,vx=b.x-a.x,vz=b.z-a.z;
 const cross=ux*vz-uz*vx;
 if(Math.abs(cross)<1e-9)return false;
 const wx=a.x-ax,wz=a.z-az;
 const t=(wx*vz-wz*vx)/cross,u=(wx*uz-wz*ux)/cross;
 // Touches at the beginning/end are not an occluding wall.
 return t>1e-4&&t<1-1e-4&&u>=0&&u<=1
}
export function advanceLeaf(current,target,dt){
 const step=DOOR_SPEED*Math.max(0,Math.min(.12,dt));
 return current<target?Math.min(target,current+step):Math.max(target,current-step)
}
export function sweptLeafSafe(door,from,to,actors,radius=.22){
 // Check the *whole* hinge sweep, not just the final open/closed endpoint.
 // Never close a panel over the protagonist or an enemy.
 const n=Math.max(1,Math.ceil(Math.abs(to-from)/.085));
 for(let i=1;i<=n;i++){
  const angle=from+(to-from)*i/n;
  for(const actor of actors||[]){
   if(actor&&Number.isFinite(actor.x)&&Number.isFinite(actor.z)&&
      leafBlocksPoint(door,angle,actor.x,actor.z,radius))return false
  }
 }
 return true
}
export function defaultDoorOpen(seed,chunk,door,hash){
 // New rooms begin with mixed door states, not a solid bank of shut doors.
 // Old saved runs retain the pre-door state (all interior doors open).
 return (hash(seed,chunk.cx,chunk.cz,chunk.epoch,door.x,door.z,door.side.length)%5)===0
}
