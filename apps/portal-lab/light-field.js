/**
 * Three-dimensional light field in a static spherically symmetric spacetime.
 *
 * A geodesic launched with arbitrary polar and azimuthal direction lies in
 * an orbital plane through the symmetry centre (conserved angular momentum
 * direction).  We therefore integrate each orbit using the EXACT SAME
 * Hamiltonian/E,L RK4 system as relativity.js, then rotate the orbital plane
 * into an arbitrary orientation in three physical angular coordinates.
 *
 * The two disjoint exterior charts are displayed at separated centres.
 * This is an ATLAS DRAWING, not a global isometric 3D embedding; the angular
 * coordinate map r=R(l) also does not preserve radial proper distances.
 */
import {geometry} from './spacetime.js';
import {launch,advance,constraint} from './relativity.js';

const TAU=Math.PI*2;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const rad=d=>d*Math.PI/180;
export const FIELD_DEFAULTS=Object.freeze({
  polar:24,azimuth:42,cone:24,count:13,
  source:3.1,yaw:.68,pitch:.33,zoom:1,
  showRays:true,showGrid:true,showConnections:true
});
export const FIELD_CENTRES=Object.freeze({A:[-4.7,0,0],B:[4.7,0,0]});
export const FIELD_ASSUMPTIONS=Object.freeze([
 'Each ray is a null geodesic in the same 3+1D static spherical metric.',
 'Orbital plane orientation is conserved by exact spherical symmetry.',
 'Exterior regions A and B have distinct charts; their drawn separation is arbitrary.',
 'The chart radius R(l) is an areal radius, not the radial proper coordinate l.',
 'Chart rendering is not a global isometric embedding of 3D space.'
]);
const len=v=>Math.hypot(...v);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function unit(v){const n=len(v);if(n<1e-12)throw Error('Нулевое направление фотона');return v.map(x=>x/n);}
export function emissionVector(polarDegrees,azimuthDegrees){
 if(!Number.isFinite(polarDegrees)||polarDegrees<0||polarDegrees>80||
    !Number.isFinite(azimuthDegrees)||azimuthDegrees<0||azimuthDegrees>360)
  throw Error('Направление фотона вне диапазона');
 const a=rad(polarDegrees),b=rad(azimuthDegrees);
 return [-Math.cos(a),Math.sin(a)*Math.cos(b),Math.sin(a)*Math.sin(b)];
}
export function coneDirections({polar=24,azimuth=42,cone=24,count=13}={}){
 if(!Number.isInteger(count)||count<1||count>25||
    !Number.isFinite(cone)||cone<0||cone>75)
  throw Error('Недопустимые параметры 3D-пучка');
 const center=emissionVector(polar,azimuth);
 const reference=Math.abs(center[2])<.9?[0,0,1]:[0,1,0];
 const side=unit(cross(center,reference)),up=cross(side,center);
 const output=[];
 for(let i=0;i<count;i++){
  const radius=count===1?0:Math.sqrt(i/(count-1))*rad(cone);
  const spin=i*2.399963229728653;
  const cs=Math.cos(radius),sn=Math.sin(radius);
  output.push(unit(center.map((v,k)=>v*cs+(side[k]*Math.cos(spin)+up[k]*Math.sin(spin))*sn)));
 }
 return output;
}
export function liftRay(ray){
 if(!ray||!Array.isArray(ray.tangent)||ray.tangent.length!==3)
  throw Error('Отсутствует плоскость орбиты');
 const t=ray.tangent,c=Math.cos(ray.phi),s=Math.sin(ray.phi);
 return [c,s*t[1],s*t[2]];
}
export function chartPoint(m,l,phi,tangent,regionDistance=4.7){
 if(!Number.isFinite(l)||!Number.isFinite(phi)||!Number.isFinite(regionDistance))
  throw Error('Некорректная координата пространства');
 const R=geometry(l,m).R/m.a,side=l>=0?'A':'B';
 const n=[Math.cos(phi),Math.sin(phi)*tangent[1],Math.sin(phi)*tangent[2]];
 const centre=side==='A'?[-regionDistance,0,0]:[regionDistance,0,0];
 return {region:side,position:n.map((v,k)=>centre[k]+R*v),radius:R,angles:n};
}
export function newLightField(m,options={}){
 const q={...FIELD_DEFAULTS,...options};
 if(!Number.isFinite(q.source)||q.source<1.5||q.source>4.5)
  throw Error('Некорректное положение источника');
 const vectors=coneDirections(q);
 const rays=vectors.map((vec,index)=>{
  const transverse=Math.hypot(vec[1],vec[2]);
  const tangent=transverse>1e-12?[0,vec[1]/transverse,vec[2]/transverse]:[0,1,0];
  // The original ray is integrated with alpha from the outward radial axis.
  // Its equatorial azimuth is rotated into the physical orbital plane.
  const alpha=Math.atan2(transverse,vec[0]);
  const ray=launch(m,{kind:'light',l:q.source*m.a,phi:0,alpha});
  return {index,ray,tangent,direction:vec};
 });
 return {options:q,rays,time:0,done:false};
}
export function advanceLightField(field,m,dt){
 if(!Number.isFinite(dt)||dt<0||dt>2)
  throw Error('Недопустимый временной шаг 3D фотонов');
 if(field.done||dt===0)return field;
 for(const r of field.rays){
  if(r.ray.t>=130*m.a||Math.abs(r.ray.l)>=7*m.a)continue;
  advance(r.ray,m,dt);
 }
 field.time+=dt;
 field.done=field.rays.every(r=>r.ray.t>=130*m.a||Math.abs(r.ray.l)>=7*m.a);
 return field;
}
export function fieldStatistics(field,m){
 const out={photons:field.rays.length,escapedA:0,escapedB:0,inFlight:0,
  crossings:0,worstResidual:0,totalAngularMomentum:0,time:field.time,
  distinctOrbitalPlanes:0};
 const planes=[];
 for(const r of field.rays){
  const s=r.ray,terminal=s.t>=130*m.a||Math.abs(s.l)>=7*m.a;
  if(!terminal)out.inFlight++;else if(s.l>=0)out.escapedA++;else out.escapedB++;
  out.crossings+=s.crossings;
  out.worstResidual=Math.max(out.worstResidual,Math.abs(constraint(s,m)));
  out.totalAngularMomentum+=Math.abs(s.L);
  const normal=[0,-r.tangent[2],r.tangent[1]];
  if(!planes.some(p=>Math.abs(dot(p,normal))>1-1e-7))planes.push(normal);
 }
 out.distinctOrbitalPlanes=planes.length;
 return out;
}
export function lightFieldSamples(field,m,{maxPoints=270}={}){
 if(!Number.isInteger(maxPoints)||maxPoints<10||maxPoints>900)
  throw Error('Некорректное ограничение пути');
 return field.rays.map(r=>{
  const path=r.ray.path,step=Math.max(1,Math.ceil(path.length/maxPoints));
  const points=[];
  for(let i=0;i<path.length;i+=step){
   const p=path[i];
   points.push(chartPoint(m,p.l,p.phi,r.tangent));
  }
  if(path.length>1&&(path.length-1)%step!==0){
   const p=path.at(-1);points.push(chartPoint(m,p.l,p.phi,r.tangent));
  }
  // The integrator sparsely records its historic trail, so always close it
  // with the real current phase-space position (no visual extrapolation).
  const current=chartPoint(m,r.ray.l,r.ray.phi,r.tangent);
  points.push(current);
  return {index:r.index,l:r.ray.l/m.a,phi:r.ray.phi,points,current,
   residual:Math.abs(constraint(r.ray,m)),L:r.ray.L,E:r.ray.E,crossings:r.ray.crossings};
 });
}
export function sphereWires({radius=1,center=[0,0,0],longitudes=10,latitudes=5,steps=42}={}){
 if(!Number.isFinite(radius)||radius<=0||longitudes<4||latitudes<2||steps<8)
  throw Error('Неверные геометрические сетки');
 const curves=[];
 const point=(lat,lon)=>[center[0]+radius*Math.cos(lat)*Math.cos(lon),
  center[1]+radius*Math.cos(lat)*Math.sin(lon),center[2]+radius*Math.sin(lat)];
 for(let j=0;j<longitudes;j++){
  const lon=TAU*j/longitudes,curve=[];
  for(let k=0;k<=steps;k++)curve.push(point(-Math.PI/2+Math.PI*k/steps,lon));
  curves.push(curve);
 }
 for(let i=1;i<latitudes;i++){
  const lat=-Math.PI/2+Math.PI*i/latitudes,curve=[];
  for(let j=0;j<=steps;j++)curve.push(point(lat,TAU*j/steps));
  curves.push(curve);
 }
 return curves;
}
export function coordinateConsistency(field,m){
 return field.rays.map(r=>{
  const u=liftRay({...r.ray,tangent:r.tangent});
  return {unitNorm:len(u),radialPosition:r.ray.l,angle:r.ray.phi,
   angularMomentum:r.ray.L,energy:r.ray.E,hamiltonian:constraint(r.ray,m)};
 });
}
