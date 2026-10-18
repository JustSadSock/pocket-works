/**
 * Physical-scale linear tidal specimen in a comoving Fermi frame.
 * Background spacetime: ds²=-N(l)²dt²+dl²+R(l)²dΩ² (from relativity.js).
 * Center is radial timelike geodesic. Material consists of a 1-D
 * Kelvin-Voigt mass / spring chain of test masses (weak, no back-reaction).
 *
 * Two sectional tidal eigenvalues for radial motion, in units 1/a²:
 * λ_r=-N''/N
 * λ_t=γ²[β² R''/R - (N'/N)(R'/R)]
 * Computed with radial Lorentz boost of static orthonormal Riemann frame.
 * In local proper time τ: ξ'' = λ ξ + elastic forces per unit mass.
 *
 * Numerical integration: implicit tridiagonal solver for spring velocities.
 * At high stiffness, fast acoustic transients are time-averaged.
 * A <-> SI: a_phys meters; c=299792458 m/s. Sound speed is sqrt(E/ρ).
 * Valid only when specimenLength/a_phys << 1 (Fermi linearization).
 * Strength values below are explicit educational idealizations.
 */
import {geometry,launch,advance,constraint} from './relativity.js';
export const SPEED_OF_LIGHT=299792458;
export const MATERIALS=Object.freeze({
 ceramic:{id:'ceramic',label:'Керамика',E:70e9,density:2650,tension:.002,compression:.012,damping:.09,color:'#dfcaa6',note:'Хрупкая: разрыв и сжатие при малой деформации'},
 steel:{id:'steel',label:'Сталь',E:200e9,density:7850,tension:.16,compression:.42,damping:.07,color:'#97c9c5',note:'Идеализированная упругая сталь без пластической стадии'},
 polymer:{id:'polymer',label:'Полимер',E:2e9,density:1180,tension:.1,compression:.3,damping:.12,color:'#c9acd7',note:'Линейная модель до порога разрушения'},
 elastomer:{id:'elastomer',label:'Эластомер',E:8e6,density:1100,tension:.9,compression:.95,damping:.2,color:'#b8cf92',note:'Линейное приближение не учитывает гиперупругость'}
});
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export function tidalFrame(center,m){
 const l=center.l,a=m.a,r2=l*l+a*a,R=Math.sqrt(r2);
 const q=m.eta*a*l/(r2*R);
 const qp=m.eta*a*(a*a-2*l*l)/(r2*r2*R);
 const N=Math.exp(-m.eta*a/R),gamma=center.E/N;
 const beta2=clamp(1-1/(gamma*gamma),0,.999999999);
 const radial=-(qp+q*q);
 const transverse=gamma*gamma*(beta2*a*a/(r2*r2)-q*l/r2);
 return {radial,transverse,beta:Math.sqrt(beta2),gamma,N,l,R};
}
function materialProps(id){
 const mat=MATERIALS[id];if(!mat)throw Error('Неизвестный материал');
 return mat;
}
export function createSpecimen(m,options={}){
 const material=materialProps(options.material??'ceramic');
 const aMeters=Number(options.aMeters??1000);
 const lengthMeters=Number(options.lengthMeters??2);
 const speed=Number(options.speed??.72);
 const start=Number(options.start??3.25);
 const axis=options.axis??'transverse';
 if(!(aMeters>=100&&aMeters<=1e8&&lengthMeters>.01&&lengthMeters/aMeters<=.08))throw Error('Образец слишком велик для линейной приливной модели');
 if(!(speed>=.05&&speed<=.95))throw Error('Некорректная начальная скорость');
 if(!['radial','transverse'].includes(axis))throw Error('Неизвестная ориентация');
 const count=17,h=lengthMeters/aMeters*m.a/(count-1);
 const nodes=Array.from({length:count},(_,i)=>({x:(i-(count-1)/2)*h,v:0}));
 const links=Array.from({length:count-1},()=>({alive:true,strain:0,peak:0,failedAt:null}));
 const ray=launch(m,{kind:'matter',l:start*m.a,phi:0,alpha:Math.PI,speed});
 const specimen={m:{...m},aMeters,lengthMeters,speed,axis,material:material.id,nodes,links,
  ray,h,initialH:h,phase:'ready',history:[],breakCount:0,peakStrain:0,peakStress:0,
  minL:ray.l,elapsedProper:0,model:'linear-tidal-spring-chain',stopReason:null};
 sample(specimen);
 return specimen;
}
function updateLinks(s){
 const mat=materialProps(s.material);
 let peak=0,maxStress=0;
 for(let i=0;i<s.links.length;i++){
  const link=s.links[i];if(!link.alive)continue;
  const d=s.nodes[i+1].x-s.nodes[i].x;
  const strain=d/s.h-1;
  link.strain=strain;link.peak=Math.max(link.peak,Math.abs(strain));
  peak=Math.max(peak,Math.abs(strain));
  maxStress=Math.max(maxStress,Math.abs(strain)*mat.E);
  if(strain>mat.tension||strain<-mat.compression){
   link.alive=false;link.failedAt=s.ray.tau;s.breakCount++;
  }
 }
 s.peakStrain=Math.max(s.peakStrain,peak);
 s.peakStress=Math.max(s.peakStress,maxStress);
}
function solveTridiagonal(lower,diag,upper,rhs){
 const n=rhs.length,cp=new Float64Array(n),dp=new Float64Array(n),out=new Float64Array(n);
 let pivot=diag[0];if(!(pivot>0))throw Error('Неустойчивое локальное решение');
 cp[0]=upper[0]/pivot;dp[0]=rhs[0]/pivot;
 for(let i=1;i<n;i++){
  pivot=diag[i]-lower[i-1]*cp[i-1];
  if(!(pivot>0))throw Error('Неустойчивое локальное решение');
  cp[i]=i<n-1?upper[i]/pivot:0;
  dp[i]=(rhs[i]-lower[i-1]*dp[i-1])/pivot;
 }
 out[n-1]=dp[n-1];
 for(let i=n-2;i>=0;i--)out[i]=dp[i]-cp[i]*out[i+1];
 return out;
}
function substep(s,dt){
 const prev=s.ray.tau;
 advance(s.ray,s.m,dt,{record:false});
 const dTau=s.ray.tau-prev;
 const frame=tidalFrame(s.ray,s.m),lambda=s.axis==='radial'?frame.radial:frame.transverse;
 updateLinks(s);
 const mat=materialProps(s.material);
 const sound=Math.sqrt(mat.E/mat.density)/SPEED_OF_LIGHT,k=(sound/s.h)**2;
 const damper=2*mat.damping*sound/s.h;
 const n=s.nodes.length;
 const diag=new Float64Array(n),upper=new Float64Array(n-1),lower=new Float64Array(n-1),rhs=new Float64Array(n);
 // Fully implicit linear mass/spring/dashpot update in proper time.
 // A v' = rhs, with A=I-dτ² λI+(dτ² k + dτ c) * graph Laplacian.
 const coeff=dTau*dTau*k+dTau*damper;
 for(let i=0;i<n;i++){
  diag[i]=1-dTau*dTau*lambda;
  rhs[i]=s.nodes[i].v+dTau*lambda*s.nodes[i].x;
 }
 for(let i=0;i<n-1;i++){
  if(!s.links[i].alive)continue;
  diag[i]+=coeff;diag[i+1]+=coeff;upper[i]=-coeff;lower[i]=-coeff;
  const stretch=s.nodes[i+1].x-s.nodes[i].x-s.h;
  rhs[i]+=dTau*k*stretch;rhs[i+1]-=dTau*k*stretch;
 }
 const velocities=solveTridiagonal(lower,diag,upper,rhs);
 for(let i=0;i<n;i++){
  s.nodes[i].v=velocities[i];
  s.nodes[i].x+=dTau*velocities[i];
 }
 s.elapsedProper=s.ray.tau;
 s.minL=Math.min(s.minL,s.ray.l);
 if(Math.abs(s.ray.l)>=4*s.m.a&&s.ray.l<0){
  s.phase='completed';s.stopReason=s.breakCount?'fractured':'passed';
 }
 if(s.ray.t>=45*s.m.a){
  s.phase='completed';s.stopReason='timeout';
 }
 if(s.nodes.some(n=>!Number.isFinite(n.x)||!Number.isFinite(n.v)))throw Error('Численная неустойчивость материала');
}
function sample(s){
 const f=tidalFrame(s.ray,s.m),mat=materialProps(s.material);
 const live=s.links.filter(e=>e.alive),fracture=s.links.length-live.length;
 let strain=0,stress=0;
 for(const link of live){
  strain=Math.max(strain,Math.abs(link.strain));
  stress=Math.max(stress,Math.abs(link.strain)*mat.E);
 }
 const record={t:s.ray.t/s.m.a,proper:s.ray.tau/s.m.a,l:s.ray.l/s.m.a,
  tidal:(s.axis==='radial'?f.radial:f.transverse)*s.m.a*s.m.a,
  beta:f.beta,peakStrain:s.peakStrain,strain,stressMPa:stress/1e6,
  stressPeakMPa:s.peakStress/1e6,broken:fracture,steps:s.nodes.length,
  condition:Math.abs(constraint(s.ray,s.m))};
 if(!s.history.length||s.ray.t/s.m.a-s.history.at(-1).t>.035||s.phase==='completed'){
  s.history.push(record);if(s.history.length>700)s.history.shift();
 }
 return record;
}
export function stepSpecimen(s,dt){
 if(s.phase==='completed')return sample(s);
 if(!(dt>=0&&dt<=3*s.m.a))throw Error('Недопустимый шаг');
 if(dt===0)return sample(s);
 if(s.phase==='ready')s.phase='running';
 let remaining=dt;
 // Numerical resolution is stricter than a/c for material sound traversal.
 const sound=Math.sqrt(materialProps(s.material).E/materialProps(s.material).density)/SPEED_OF_LIGHT;
 const stable=clamp(.25*s.h/sound,.003*s.m.a,.012*s.m.a);
 while(remaining>1e-11&&s.phase==='running'){
  const h=Math.min(remaining,stable);
  substep(s,h);remaining-=h;
 }
 return sample(s);
}
export function specimenStats(s){
 const mat=materialProps(s.material),frame=tidalFrame(s.ray,s.m),record=sample(s);
 const c= SPEED_OF_LIGHT,aMeters=s.aMeters;
 const peakAccel=Math.abs((s.axis==='radial'?frame.radial:frame.transverse)*s.m.a*s.m.a)
  *c*c*s.lengthMeters/aMeters**2;
 return {...record,phase:s.phase,stopReason:s.stopReason,material:mat.label,axis:s.axis,
  broken:s.breakCount,total:s.links.length,actualLengthMeters:s.lengthMeters,
  aMeters:s.aMeters,soundSpeed:Math.sqrt(mat.E/mat.density),
  tidalEndAcceleration:peakAccel,limitTension:mat.tension,limitCompression:mat.compression,
  crosses:s.ray.crossings,pointNorm:Math.abs(constraint(s.ray,s.m))};
}
export function specimenSegments(s){
 const x0=s.nodes[0]?.x||0,dx=s.initialH;
 return s.nodes.map((p,i)=>({x:p.x/dx,v:p.v,brokenBefore:i===0?false:!s.links[i-1].alive,
  brokenAfter:i===s.nodes.length-1?false:!s.links[i].alive}));
}
