/**
 * v1.2. True isometric embedding of the equatorial spatial section:
 * dl² + R(l)² dφ² -> (R(l) cosφ, R(l) sinφ, z(l)).
 * A real Euclidean embedding exists locally iff |R'(l)| <= 1.
 * z'(l)=sqrt(1-R'(l)²) with z(0)=0 and antisymmetric branches.
 * This is a 2D spatial SECTION of a 3+1D metric, not a 3D
 * depiction of full spacetime; N(l) does NOT enter the embedding,
 * but DOES enter the light geodesics.
 */
import {geometry} from './spacetime.js';
import {launch,advance,constraint} from './relativity.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const TAU=Math.PI*2;
export const VOLUME_DEFAULTS=Object.freeze({
 yaw:.68,pitch:.40,zoom:1,span:4.6,angle:Math.PI,
 spread:.44,count:7,source:3.3,mesh:true,showPaths:true
});
export function spatialEmbedding(m,{span=4.6,steps=240}={}){
 if(!Number.isFinite(span)||span<2||span>9||
    !Number.isInteger(steps)||steps<40||steps>720||steps%2!==0)
  throw Error('Некорректное разрешение пространственного вложения');
 const dx=span/(steps/2),half=steps/2,radial=new Float64Array(half+1);
 const data=new Array(steps+1);
 let bad=null;
 const slope=l=>{
  const g=geometry(l*m.a,m),p=g.Rp;
  if(Math.abs(p)>1+1e-7&&bad===null)bad=l;
  return Math.sqrt(Math.max(0,1-p*p));
 };
 radial[0]=0;
 for(let i=1;i<=half;i++){
  const prev=(i-1)*dx,mid=(i-.5)*dx,next=i*dx;
  radial[i]=radial[i-1]+(dx/6)*(slope(prev)+4*slope(mid)+slope(next));
 }
 for(let i=0;i<=steps;i++){
  const signed=i-half,lv=signed*dx,g=geometry(lv*m.a,m);
  if(Math.abs(g.Rp)>1+1e-7&&bad===null)bad=lv;
  data[i]={l:lv,R:g.R/m.a,z:Math.sign(signed)*radial[Math.abs(signed)],Rp:g.Rp,N:g.N};
 }
 return {m,span,steps,samples:data,valid:bad===null,invalidAt:bad,
  condition:"|dR/dl|≤1",meaning:"Euclidean isometric embedding of equatorial spatial 2D slice"};
}
export function surfacePoint(profile,l,phi){
 if(!profile.valid||!Number.isFinite(l)||!Number.isFinite(phi)||Math.abs(l)>profile.span+1e-8)return null;
 const t=clamp((l+profile.span)/(2*profile.span)*profile.steps,0,profile.steps);
 const i=Math.min(profile.steps-1,Math.floor(t)),w=t-i;
 const z=profile.samples[i].z*(1-w)+profile.samples[i+1].z*w;
 const R=geometry(l*profile.m.a,profile.m).R/profile.m.a;
 return [R*Math.cos(phi),R*Math.sin(phi),z];
}
export function spatialMetricCheck(profile,i=1){
 if(!profile.valid)throw Error('Глобальное вложение отсутствует');
 const s=profile.samples[clamp(i,1,profile.steps-1)];
 const slope=geometry(s.l*profile.m.a,profile.m).Rp;
 return {l:s.l,radius:s.R,radiusSlope:slope,
  heightSlope:Math.sqrt(Math.max(0,1-slope*slope)),
  inducedRadialMetric:slope*slope+Math.max(0,1-slope*slope)};
}
export function embeddedGrid(profile,{meridians=20,ringStep=12}={}){
 if(!profile.valid)return [];
 if(!Number.isInteger(meridians)||meridians<8||meridians>48||
    !Number.isInteger(ringStep)||ringStep<4||ringStep>48)throw Error('Неверная сетка');
 const segments=[],samples=profile.samples.length-1;
 const add=(l0,a0,l1,a1,ring)=>{
  const A=surfacePoint(profile,l0,a0),B=surfacePoint(profile,l1,a1);
  if(A&&B)segments.push({a:A,b:B,region:(l0+l1)<0?'B':'A',ring,
   throat:Math.abs(l0)<1e-8&&Math.abs(l1)<1e-8});
 };
 for(let j=0;j<meridians;j++){
  const phi=TAU*j/meridians;
  for(let k=0;k<samples;k+=3){
   const end=Math.min(k+3,samples);
   add(profile.samples[k].l,phi,profile.samples[end].l,phi,false);
  }
 }
 for(let i=0;i<=samples;i+=ringStep){
  const l=profile.samples[i].l;
  for(let j=0;j<meridians*3;j++)
   add(l,TAU*j/(meridians*3),l,TAU*(j+1)/(meridians*3),true);
 }
 if(samples%ringStep!==0){
  for(let j=0;j<meridians*3;j++)
   add(profile.samples[samples].l,TAU*j/(meridians*3),
    profile.samples[samples].l,TAU*(j+1)/(meridians*3),true);
 }
 return segments;
}
export function project3D(p,camera,w,h){
 if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))return null;
 const yaw=camera.yaw,pitch=camera.pitch,zoom=camera.zoom;
 if(![yaw,pitch,zoom,w,h].every(Number.isFinite)||w<1||h<1||zoom<=0)throw Error('Камера вне диапазона');
 const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
 const depth=p[0]*cy*cp+p[1]*sy*cp+p[2]*sp;
 const dist=12.7,divisor=Math.max(3,dist-depth);
 const focal=Math.min(w,h)*1.28*zoom;
 return {x:w*.5+(-p[0]*sy+p[1]*cy)*focal/divisor,
  y:h*.51-(-p[0]*cy*sp-p[1]*sy*sp+p[2]*cp)*focal/divisor,
  depth,scale:focal/divisor};
}
export function createSpatialBeam(m,{angle=Math.PI,spread=.44,count=7,source=3.3}={}){
 if(!Number.isFinite(angle)||angle<Math.PI-1.35||angle>Math.PI+1.35||
    !Number.isFinite(spread)||spread<0||spread>1.28||
    !Number.isInteger(count)||count<1||count>15||
    !Number.isFinite(source)||source<2||source>4.4)
   throw Error('Недопустимая подготовка фотонов');
 const rays=[];
 for(let i=0;i<count;i++){
  const alpha=angle+(count===1?0:(i/(count-1)-.5)*spread);
  rays.push(launch(m,{kind:'light',l:source*m.a,alpha,phi:Math.PI}));
 }
 return {rays,source,angle,spread,time:0,done:false,steps:0};
}
export function stepSpatialBeam(bundle,m,dt){
 if(!Number.isFinite(dt)||dt<0||dt>2)throw Error('Неверный шаг лучевого опыта');
 if(bundle.done||dt===0)return bundle;
 const h=Math.min(dt,.07*m.a);
 for(const ray of bundle.rays){
  if(ray.t>135*m.a||Math.abs(ray.l)>7*m.a)continue;
  advance(ray,m,h);
 }
 bundle.time+=h;bundle.steps++;
 bundle.done=bundle.rays.every(ray=>ray.t>135*m.a||Math.abs(ray.l)>7*m.a);
 return bundle;
}
export function spatialBeamStats(bundle,m){
 const counts={A:0,B:0,open:0,crossings:0,worstResidual:0};
 for(const ray of bundle.rays){
  counts.crossings+=ray.crossings;
  counts.worstResidual=Math.max(counts.worstResidual,Math.abs(constraint(ray,m)));
  if(Math.abs(ray.l)>7*m.a||ray.t>135*m.a){
   if(ray.l<0)counts.B++;else counts.A++;
  }else counts.open++;
 }
 return {...counts,time:bundle.time,photons:bundle.rays.length};
}
