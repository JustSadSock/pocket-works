/**
 * SHOV v1.4: spherical-isometry bridge between the 3D two-chart field
 * and the first-person null-geodesic observer.
 *
 * A point is (signed proper l, longitude, latitude) in one exterior chart.
 * Observer integration is performed in a canonical radial frame, then
 * physically ROTATED into the selected chart's celestial directions.
 * The affine separation of chart centres in 3D never enters this transform.
 */
import {geometry} from './spacetime.js';
import {photonTransfer} from './optics.js';
export const BRIDGE_MIN_RADIUS=.2, BRIDGE_MAX_RADIUS=6;
const deg=x=>x*Math.PI/180,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=v=>Math.hypot(...v);
const unit=v=>{const n=norm(v);if(n<1e-12)throw Error('Вырожденный пространственный базис');return v.map(k=>k/n)};
export function normalizeObserverPoint(input={}){
 const {l,longitude,latitude}=input;
 if(![l,longitude,latitude].every(Number.isFinite)||
    l===0||Math.abs(l)<BRIDGE_MIN_RADIUS-1e-9||Math.abs(l)>BRIDGE_MAX_RADIUS+1e-9||
    longitude< -180||longitude>180||latitude<-85||latitude>85)
  throw Error('Точка наблюдения выходит за пределы разрешённой области');
 return {l,longitude,latitude};
}
export function frameAt(point){
 const p=normalizeObserverPoint(point),lon=deg(p.longitude),lat=deg(p.latitude);
 const r=[Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)];
 const east=[-Math.sin(lon),Math.cos(lon),0],side=Math.sign(p.l);
 const x=r.map(v=>v*side),y=east,z=unit(cross(x,y));
 return {x,y,z,radial:r,side,position:p};
}
export function worldDirection(local,frame){
 if(!Array.isArray(local)||local.length!==3||!local.every(Number.isFinite))
  throw Error('Направление света некорректно');
 return unit(frame.x.map((v,k)=>v*local[0]+frame.y[k]*local[1]+frame.z[k]*local[2]));
}
export function localDirection(world,frame){
 if(!Array.isArray(world)||world.length!==3||!world.every(Number.isFinite))
  throw Error('Направление в 3D некорректно');
 const v=unit(world);
 return [dot(v,frame.x),dot(v,frame.y),dot(v,frame.z)];
}
export function chartObserverPosition(metric,point,centres={A:[-4.7,0,0],B:[4.7,0,0]}){
 const p=normalizeObserverPoint(point),f=frameAt(p);
 const radius=geometry(p.l*metric.a,metric).R/metric.a;
 const origin=centres[p.l>=0?'A':'B'];
 return {chart:p.l>=0?'A':'B',radius,
  xyz:origin.map((c,k)=>c+radius*f.radial[k]),radial:f.radial};
}
export function pointFromPhoton(ray,{limit=BRIDGE_MAX_RADIUS}={}){
 if(!ray||!ray.current||!Array.isArray(ray.current.angles))
  throw Error('Сначала запустите фотонный пучок');
 const r=unit(ray.current.angles);
 const actual=ray.current.region==='B'?-Math.abs(ray.l):Math.abs(ray.l);
 if(!Number.isFinite(actual))throw Error('Фотон вышел за пределы координатной карты');
 const selected=Math.sign(actual)*clamp(Math.abs(actual),BRIDGE_MIN_RADIUS,Math.min(limit,BRIDGE_MAX_RADIUS));
 return {point:normalizeObserverPoint({l:selected,
    longitude:Math.atan2(r[1],r[0])*180/Math.PI,
    latitude:Math.asin(clamp(r[2],-1,1))*180/Math.PI}),
  displaced:Math.abs(actual-selected)>1e-8,actualL:actual};
}
export function photonLocalAngle(m,point,localDirectionVector){
 const p=normalizeObserverPoint(point);
 const dir=unit(localDirectionVector),radial=[Math.sign(p.l),0,0];
 return Math.acos(clamp(dot(dir,radial),-1,1));
}
export function inspectObserverRay(metric,point,angle,{step=.085,maxTime=145,outer=22}={}){
 const p=normalizeObserverPoint(point);
 if(!Number.isFinite(angle)||angle<0||angle>Math.PI)
  throw Error('Некорректный угол исследовательского луча');
 const ray=photonTransfer(metric,p.l*metric.a,angle,{step,maxTime,outer});
 const g=geometry(p.l*metric.a,metric);
 const expectedImpact=g.R*Math.sin(angle)/g.N;
 return {point:p,angle,exit:ray.region===0?'A':ray.region===1?'B':'?',
  resolved:ray.resolved,passes:ray.passes,winding:ray.winding,
  impact:ray.impact,expectedImpact,
  impactError:Math.abs(expectedImpact-ray.impact),residual:ray.error,
  sourceRegion:p.l>=0?'A':'B'};
}
export function bridgeSnapshot(point,view={}){
 const p=normalizeObserverPoint(point);
 return {point:p,yaw:Number.isFinite(view.yaw)?clamp(view.yaw,-2.6,2.6):0,
  pitch:Number.isFinite(view.pitch)?clamp(view.pitch,-1.1,1.1):0,
  fov:Number.isFinite(view.fov)?clamp(view.fov,50,110):80,
  quality:view.quality==='fine'?'fine':'balanced'};
}
