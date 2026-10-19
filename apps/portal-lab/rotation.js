/**
 * v0.7 stationary equatorial null geodesics in a Teo-inspired,
 * prescribed 3+1 metric (not a solved Einstein matter system):
 *
 * ds² = -N(l)² dt² + dl² + R(l)²[dθ² + sin²θ(dφ-ω(l)dt)²]
 * ω(l)= Ω (a/R(l))³ /a, smooth through a throat at l=0.
 *
 * Restricted to the invariant equatorial plane θ=π/2.
 * p_t=-E, p_φ=L conserved; g_tt=-N²+R²ω².
 * H=1/2[p_l²+L²/R²-(E-ωL)²/N²]=0.
 *
 * Schwarzschild is an EXACT vacuum solution:
 * ds²=-f dt²+f⁻¹dr²+r²dΩ²; f=1-2M/r.
 * Integrate vr=dr/dλ, avoiding Schwarzschild p_r divergence at horizon.
 */
import {geometry} from './spacetime.js';

const finite=n=>Number.isFinite(n);
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
export const SCHEMAS=Object.freeze({
 wormhole:'teo-inspired-stationary-axisymmetric-prescribed',
 blackHole:'schwarzschild-exact-vacuum'
});
export function rotatingMetric(base,{omega=0.42}={}){
 if(!base||!(base.a>0)||!finite(omega)||Math.abs(omega)>.96)throw Error('Недопустимое вращение');
 return {...base,omega};
}
export function rotatingGeometry(l,m){
 const g=geometry(l,m),omega=m.omega/m.a*(m.a/g.R)**3;
 const omegaPrime=-3*omega*g.Rp/g.R;
 const gtt=-g.N*g.N+g.R*g.R*omega*omega;
 return {...g,omega,omegaPrime,gtt,ergoregion:gtt>0,
  zamoAngularVelocity:omega,localFrameSpeed:omega*g.R/g.N};
}
export function ergoSummary(m){
 let outer=0;
 for(let i=0;i<=1500;i++){
  const l=i*m.a*.012;
  if(rotatingGeometry(l,m).ergoregion)outer=l;
 }
 return {present:rotatingGeometry(0,m).ergoregion,extent:outer/m.a,
  omegaThroat:rotatingGeometry(0,m).omega*m.a,
  staticLimitThroat:rotatingGeometry(0,m).gtt};
}
export function schwarzschild(M){
 if(!finite(M)||M<=0)throw Error('Положительная масса обязательна');
 return {M,horizon:2*M,photonSphere:3*M,criticalImpact:3*Math.sqrt(3)*M};
}
export function schwarzschildClock(r,M){
 return r>2*M?Math.sqrt(1-2*M/r):0;
}
export function launchRotating(m,{arealRadius=6,angle=.32,side=1}={}){
 if(!finite(angle)||Math.abs(angle)>=Math.PI/2||arealRadius<1.4)throw Error('Неверное направление фотона');
 // Match the local circumferential radius for Schwarzschild comparison.
 const target=arealRadius*m.a,positive=side>=0;
 let low=0,high=36*m.a;
 for(let i=0;i<90;i++){
  const mid=(low+high)/2;
  if(geometry(mid,m).R<target)low=mid;else high=mid;
 }
 const l=(low+high)/2*(positive?1:-1);
 const g=rotatingGeometry(l,m),p=positive?-Math.cos(angle):Math.cos(angle),
   L=g.R*Math.sin(angle),E=g.N+g.omega*L;
 if(E<=0)throw Error('Запуск внутри эргорегиона не поддерживается в этом эксперименте');
 return {type:'wormhole',l,p,phi:0,t:0,L,E,steps:0,crossings:0,
  status:'flying',side:positive?1:-1,path:[{l,phi:0}],maxResidual:0};
}
export function launchSchwarzschild(s,{arealRadius=6,angle=.32}={}){
 if(!(arealRadius>2.05)||!finite(angle)||Math.abs(angle)>=Math.PI/2)throw Error('Неверный запуск у горизонта');
 const r=arealRadius*s.horizon,f=1-s.horizon/r,
  E=Math.sqrt(f),L=r*Math.sin(angle),vr=-E*Math.cos(angle);
 return {type:'schwarzschild',r,vr,phi:0,t:0,E,L,status:'flying',steps:0,
  path:[{r,phi:0}],maxResidual:0};
}
export function wormholeConstraint(v,m){
 const g=rotatingGeometry(v.l,m),H=v.p*v.p+v.L*v.L/(g.R*g.R)
   -(v.E-g.omega*v.L)**2/(g.N*g.N);
 return H;
}
export function schwarzschildConstraint(v,s){
 const f=1-s.horizon/v.r;
 return v.vr*v.vr+f*v.L*v.L/(v.r*v.r)-v.E*v.E;
}
export function rotatingDerivative(v,m){
 const g=rotatingGeometry(v.l,m),A=v.E-g.omega*v.L;
 const n2=g.N*g.N,r2=g.R*g.R;
 return {
  l:v.p,
  p:v.L*v.L*g.Rp/(r2*g.R)-A*g.omegaPrime*v.L/n2-A*A*g.dlogN/n2,
  phi:v.L/r2+g.omega*A/n2,
  t:A/n2
 };
}
export function schwarzschildDerivative(v,s){
 const r=v.r,M=s.M,f=1-s.horizon/r;
 return {
  r:v.vr,
  vr:v.L*v.L*(1/(r*r*r)-3*M/(r*r*r*r)),
  phi:v.L/(r*r),
  t:v.E/Math.max(.006,f)
 };
}
function rk4(v,fn,dt,keys){
 const one=fn(v);
 const evalAt=(a,b,coef)=>{
  const out={...v};
  for(const k of keys)out[k]=v[k]+coef*dt*b[k];
  return fn(out);
 };
 const two=evalAt(v,one,.5),three=evalAt(v,two,.5),four=evalAt(v,three,1);
 const next={...v};
 for(const k of keys)next[k]=v[k]+dt*(one[k]+2*two[k]+2*three[k]+four[k])/6;
 return next;
}
export function advanceRotating(v,m,dt=.035){
 if(v.status!=='flying')return v;
 if(!(dt>0&&dt<=.2*m.a))throw Error('Некорректный шаг');
 const n=Math.max(1,Math.ceil(dt/(.035*m.a))),h=dt/n;
 for(let i=0;i<n&&v.status==='flying';i++){
  const previous=v.l,prev=v;
  const next=rk4(prev,w=>rotatingDerivative(w,m),h,['l','p','phi','t']);
  Object.assign(v,next);v.steps++;if(previous*v.l<0)v.crossings++;
  v.maxResidual=Math.max(v.maxResidual,Math.abs(wormholeConstraint(v,m)));
  if(![v.l,v.p,v.phi,v.t].every(finite)){v.status='numerical-error';break;}
  if(Math.abs(v.l)>=13*m.a&&v.l*v.p>0)v.status=v.l>0?'escaped-A':'escaped-B';
  if(v.t>200*m.a||v.steps>11000)v.status='unresolved-orbit';
  if(v.steps%2===0||v.status!=='flying')v.path.push({l:v.l,phi:v.phi});
  if(v.path.length>3200)v.path.shift();
 }
 return v;
}
export function advanceSchwarzschild(v,s,dt=.035){
 if(v.status!=='flying')return v;
 if(!(dt>0&&dt<=.2*s.horizon))throw Error('Некорректный шаг');
 const n=Math.max(1,Math.ceil(dt/(.025*s.horizon))),h=dt/n;
 for(let i=0;i<n&&v.status==='flying';i++){
  const next=rk4(v,w=>schwarzschildDerivative(w,s),h,['r','vr','phi','t']);
  Object.assign(v,next);v.steps++;
  if(![v.r,v.vr,v.phi,v.t].every(finite)){v.status='numerical-error';break;}
  if(v.r<=s.horizon*1.012){v.r=s.horizon*1.012;v.status='horizon';}
  if(v.r>=14*s.horizon&&v.vr>0)v.status='escaped';
  if(v.steps>11000||v.t>800*s.horizon)v.status='unresolved-orbit';
  if(v.status==='flying')v.maxResidual=Math.max(v.maxResidual,Math.abs(schwarzschildConstraint(v,s)));
  if(v.steps%2===0||v.status!=='flying')v.path.push({r:v.r,phi:v.phi});
  if(v.path.length>3200)v.path.shift();
 }
 return v;
}
export function runComparison(options={}){
 const base=options.base||{a:1,eta:0,shape:0,shapeWidth:1.45,lapseBump:0,lapseWidth:1.3};
 const omega=options.omega??.42,angle=options.angle??.32,arealRadius=options.arealRadius??6;
 const m=rotatingMetric(base,{omega}),s=schwarzschild(base.a/2);
 const w=launchRotating(m,{angle,arealRadius}),b=launchSchwarzschild(s,{angle,arealRadius});
 let k=0;while((w.status==='flying'||b.status==='flying')&&k++<11000){
  if(w.status==='flying')advanceRotating(w,m,.035*m.a);
  if(b.status==='flying')advanceSchwarzschild(b,s,.035*s.horizon);
 }
 return {wormhole:w,blackHole:b,metric:m,schwarzschild:s,iterations:k};
}
