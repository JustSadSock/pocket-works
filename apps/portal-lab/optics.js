/**
 * Optical transfer function for a static, spherically symmetric wormhole.
 *
 * Each photon is an actual null geodesic of the SAME spacetime as relativity.js.
 * By spherical symmetry all the pixel rays lie in radial planes, and their
 * exit region / azimuth depend only on the local angle to the radial axis.
 * Precomputing this 1-D transfer function makes accurate 2-D imaging practical.
 * Both asymptotic skies are prescribed boundary conditions, not astrophysical data.
 */
import {launch,advance,geometry,constraint} from './relativity.js';

export const OUTER_RADIUS=24;
export function photonTransfer(m,l0,theta,{outer=OUTER_RADIUS,maxTime=145,step=.065}={}){
 const side=Math.sign(l0)||1;
 const ray=launch(m,{kind:'light',l:l0,phi:0,alpha:theta});
 const dt=step*m.a,cutoff=maxTime*m.a,exit=outer*m.a;
 let steps=0,most=0;
 while(ray.t<cutoff&&steps<Math.ceil(maxTime/step)+2){
   if(Math.abs(ray.l)>=exit&&Math.sign(ray.l)*ray.p>0)break;
   advance(ray,m,dt,{record:false});
   steps++;most=Math.max(most,Math.abs(constraint(ray,m)));
 }
 const resolved=Math.abs(ray.l)>=exit&&Math.sign(ray.l)*ray.p>0;
 return {
  region:resolved?(ray.l>0?0:1):-1,
  angle:ray.phi,passes:ray.crossings,
  winding:Math.abs(ray.phi)/(2*Math.PI),
  error:most,steps,resolved,
  impact:Math.abs(ray.L/ray.E),
  side
 };
}
export function criticalAngle(m,l0){
 const g=geometry(l0,m);
 const ratio=m.a/g.R*g.N/geometry(0,m).N;
 return ratio<1?Math.PI-Math.asin(ratio):Math.PI/2;
}
export function buildTransfer(m,l0,count=640,{onProgress,signal}={}){
 if(!Number.isInteger(count)||count<16||count>4096)throw Error('Неверное число угловых выборок');
 const table=new Array(count+1);
 for(let i=0;i<=count;i++){
  if(signal?.aborted)throw Error('Отменено');
  table[i]=photonTransfer(m,l0,Math.PI*i/count);
  if(onProgress&&i%64===0)onProgress(i/count);
 }
 onProgress?.(1);
 return table;
}
export function lookup(table,theta){
 if(!table||table.length<2)return null;
 const x=Math.max(0,Math.min(table.length-1,theta/Math.PI*(table.length-1)));
 const i=Math.min(table.length-2,Math.floor(x)),w=x-i,a=table[i],b=table[i+1];
 // Do not blend across a topological separatrix. Nearest sample is safer
 // than mixing paths landing in disconnected asymptotic regions.
 if(a.region!==b.region)return w<.5?a:b;
 if(!a.resolved||!b.resolved)return w<.5?a:b;
 return {...a,angle:a.angle+(b.angle-a.angle)*w,impact:a.impact+(b.impact-a.impact)*w,
  winding:a.winding+(b.winding-a.winding)*w,error:Math.max(a.error,b.error)};
}
export function vec(x,y,z){return [x,y,z];}
export const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function normalize(a){const k=Math.hypot(...a)||1;return a.map(v=>v/k);}
export function cameraBasis(yaw=0,pitch=0,side=1){
 // Spherical radial direction of the static observer; +x is the radial
 // direction of either asymptotic chart.
 const radial=[1,0,0],h=normalize([0,1,0]),up=[0,0,1];
 const inward=side>0?-1:1;
 const f=normalize([inward*Math.cos(yaw)*Math.cos(pitch),Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch)]);
 const right=normalize(cross(f,up));
 const vertical=normalize(cross(right,f));
 return {radial,forward:f,right,up:vertical};
}
export function pixelDirection(nx,ny,basis,fovDeg=80,aspect=1){
 const focal=1/Math.tan(fovDeg*Math.PI/360);
 return normalize([
  basis.forward[0]*focal+basis.right[0]*nx*aspect+basis.up[0]*ny,
  basis.forward[1]*focal+basis.right[1]*nx*aspect+basis.up[1]*ny,
  basis.forward[2]*focal+basis.right[2]*nx*aspect+basis.up[2]*ny
 ]);
}
export function outgoingDirection(incoming,transfer){
 const n=[1,0,0],c=dot(n,incoming);
 const perpendicular=[incoming[0]-c,incoming[1],incoming[2]];
 const p=normalize(perpendicular);
 return normalize([Math.cos(transfer.angle),Math.sin(transfer.angle)*p[1],Math.sin(transfer.angle)*p[2]]);
}
export function backgroundDirection(pixel,basis,table){
 const theta=Math.acos(Math.max(-1,Math.min(1,dot(basis.radial,pixel))));
 const transfer=lookup(table,theta);
 if(!transfer)return null;
 return {region:transfer.region,direction:outgoingDirection(pixel,transfer),transfer};
}
export function originRay(m,l0){return photonTransfer(m,l0,Math.PI);}
