// Hinged double leaves in the two-cell interior openings.
// Coordinates and collision volumes are shared by the simulation and WebGL renderer.
export const MAX_SWING = Math.PI * .485;
export const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
export function panels(gate,insideSign,angle){
 const theta=clamp(angle,0,MAX_SWING),dz=insideSign*Math.sin(theta)*.91,dx=Math.cos(theta)*.91;
 return [
  {a:{x:gate.x+.045,z:gate.z+.5},b:{x:gate.x+.045+dx,z:gate.z+.5+dz}},
  {a:{x:gate.x+1.955,z:gate.z+.5},b:{x:gate.x+1.955-dx,z:gate.z+.5+dz}}
 ];
}
export function segmentDistance(x,z,a,b){
 const vx=b.x-a.x,vz=b.z-a.z,l=vx*vx+vz*vz||.00001;
 const t=clamp(((x-a.x)*vx+(z-a.z)*vz)/l,0,1);
 return Math.hypot(x-(a.x+vx*t),z-(a.z+vz*t));
}
export function blockedByPanels(x,z,gate,insideSign,angle,radius=.22){
 return panels(gate,insideSign,angle).some(p=>segmentDistance(x,z,p.a,p.b)<radius+.045);
}
export function easeDoor(t){const k=clamp(t,0,1);return k*k*(3-2*k)}
export function advanceDoor(state,dt){
 const target=state.open?MAX_SWING:0,current=state.angle;
 // Fixed wall-clock animation, safe even on the 20fps mobile renderer.
 state.angle=current+(target-current)*Math.min(1,Math.max(0,dt)*6.7);
 if(Math.abs(state.angle-target)<.008)state.angle=target;
 return Math.abs(state.angle-target)>.001;
}
export function nearestDoor(rooms,doors,px,pz,maxDistance=2){
 let match=null,minimum=maxDistance;
 for(const room of rooms){const gate=room.door,dist=Math.hypot(px-(gate.x+1),pz-(gate.z+.5));
  if(dist<minimum){minimum=dist;match=doors[room.type]}}
 return match
}

export function segmentsIntersect(ax,az,bx,bz,c,d){
 const ux=bx-ax,uz=bz-az,vx=d.x-c.x,vz=d.z-c.z;
 const cross=ux*vz-uz*vx;if(Math.abs(cross)<1e-8)return false;
 const wx=c.x-ax,wz=c.z-az;
 const t=(wx*vz-wz*vx)/cross,u=(wx*uz-wz*ux)/cross;
 return t>0.001&&t<.999&&u>=0&&u<=1
}
export function doorOccludesRay(ax,az,bx,bz,gate,sign,angle){
 return panels(gate,sign,angle).some(p=>segmentsIntersect(ax,az,bx,bz,p.a,p.b))
}
