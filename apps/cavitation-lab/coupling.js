// Reduced-order potential-flow model of weakly interacting spherical bubbles.
// All quantities are dimensionless: R/Rref, t/[Rref sqrt(rho/deltaP)].
// The wall is an impermeable plane approximated by same-sign image sources.
// Valid away from contact, strong jetting, shock formation and high-Mach collapse.
import { WATER, sanitize, simulateBubble, sampleAt } from './physics.js';
import { normalizeBubbles, layoutTemplate } from './constructor.js';

const clamp = (v,a,b)=>Math.min(b,Math.max(a,v));
export const CLOUD_LAYOUTS = Object.freeze({
  single: [{x:0,y:0,s:1}],
  pair: [{x:0,y:0,s:1},{x:-2.65,y:0.15,s:0.73}],
  cluster: [
    {x:0,y:0,s:1},{x:-2.65,y:0.25,s:0.73},
    {x:-1.45,y:-2.65,s:0.61},{x:-4.65,y:-2.35,s:0.55},
    {x:-4.8,y:1.45,s:0.63}
  ]
});
export const CLOUD_MODES = [...Object.keys(CLOUD_LAYOUTS),'custom'];
export function sanitizeCloud(raw = {}) {
  const mode = CLOUD_MODES.includes(raw.mode) ? raw.mode : 'single';
  return { mode, wall: raw.wall !== false, ...(mode==='custom'?{bubbles:normalizeBubbles(raw.bubbles||layoutTemplate())}:{}) };
}

export function cloudGeometry(config, cloud) {
  const base = sanitize(config), selected = sanitizeCloud(cloud);
  return (selected.mode==='custom'?selected.bubbles:CLOUD_LAYOUTS[selected.mode]).map((b,i)=>({
    id:i, x:b.x, y:b.y, r0:b.s,
    // The wall location is x = standOff, measured in reference bubble radii.
    wallDistance:base.standOff-b.x
  }));
}

function solveLinear(matrix, vector) {
  const n=vector.length;
  const a=matrix.map((row,i)=>[...row,vector[i]]);
  for(let k=0;k<n;k++){
    let pivot=k;
    for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[pivot][k]))pivot=i;
    if(Math.abs(a[pivot][k])<1e-10)throw Error('Singular coupling matrix');
    if(pivot!==k)[a[k],a[pivot]]=[a[pivot],a[k]];
    const diag=a[k][k];
    for(let j=k;j<=n;j++)a[k][j]/=diag;
    for(let i=0;i<n;i++)if(i!==k){
      const coeff=a[i][k];if(coeff===0)continue;
      for(let j=k;j<=n;j++)a[i][j]-=coeff*a[k][j];
    }
  }
  return a.map(row=>row[n]);
}

// This is a radial Rayleigh-Plesset equation coupled by monopole-pressure fields.
// The image bubble enforces a zero-normal-flow *far-field approximation* at wall.
export function coupledAcceleration(q,v,geo,config,withWall=true,frozen=[]) {
 const n=geo.length,rho=WATER.density,ref=config.radiusMm*.001,dp=config.pressureBar*1e5;
 const m=Array.from({length:n},()=>new Array(n).fill(0)),rhs=new Array(n).fill(0);
 for(let i=0;i<n;i++){
   if(frozen[i]){m[i][i]=1;rhs[i]=0;continue}
   const r=Math.max(0.020,q[i]),dr=v[i];
   const pg=(config.gasPressurePa??5000)*Math.pow(geo[i].r0/r,4.2);
   rhs[i]=(pg-dp-2*WATER.surfaceTension/(ref*r))/dp
     -4*WATER.viscosity*dr/(ref*Math.sqrt(rho*dp)*r)
     -1.5*dr*dr;
   m[i][i]=r;
   for(let j=0;j<n;j++){
     if(frozen[j])continue;
     if(i!==j){
       const dx=geo[i].x-geo[j].x,dy=geo[i].y-geo[j].y;
       const distance=Math.hypot(dx,dy);
       const coefficient=1/distance;
       m[i][j]+=q[j]*q[j]*coefficient;
       rhs[i]-=2*q[j]*v[j]*v[j]*coefficient;
     }
     if(withWall){
       const imageX=2*config.standOff-geo[j].x;
       const d=Math.hypot(geo[i].x-imageX,geo[i].y-geo[j].y);
       const coefficient=1/d;
       m[i][j]+=q[j]*q[j]*coefficient;
       rhs[i]-=2*q[j]*v[j]*v[j]*coefficient;
     }
   }
 }
 return solveLinear(m,rhs);
}

function derivatives(state,geo,config,wall,frozen=[]) {
 const n=geo.length;
 const q=state.slice(0,n),v=state.slice(n);
 return [...v,...coupledAcceleration(q,v,geo,config,wall,frozen)];
}
function rk4(state,dt,geo,config,wall,frozen=[]) {
 const f=(s)=>derivatives(s,geo,config,wall,frozen);
 const a=f(state),b=f(state.map((s,i)=>s+a[i]*dt*.5));
 const c=f(state.map((s,i)=>s+b[i]*dt*.5)),d=f(state.map((s,i)=>s+c[i]*dt));
 return state.map((s,i)=>s+dt*(a[i]+2*b[i]+2*c[i]+d[i])/6);
}

// Dimensionless monopole-pressure perturbation p' / deltaP.
// Incompressible, instantaneous approximation, NOT a propagating sound wave.
export function pressureAt(solution, point, x, y) {
 if(!point?.bubbles)return 0;
 let p=0;
 for(let j=0;j<point.bubbles.length;j++){
   const b=point.bubbles[j],g=solution.geometry[j];
   const source=(2*b.radius*b.velocity*b.velocity+b.radius*b.radius*b.acceleration);
   const d=Math.max(b.radius*1.1,Math.hypot(x-g.x,y-g.y));
   p+=source/d;
   if(solution.cloud.wall){
     const mirror=2*solution.config.standOff-g.x;
     const dm=Math.max(b.radius*1.1,Math.hypot(x-mirror,y-g.y));
     p+=source/dm;
   }
 }
 return clamp(p,-30,30);
}
export function simulateCloud(raw={}, cloudRaw={}) {
 const cloud=sanitizeCloud(cloudRaw);
 // A slightly larger specified trapped-gas cushion keeps editor configurations
 // inside the first-rebound regime across the supported pressure range.
 const config={...sanitize(raw),...(cloud.mode==='custom'?{gasPressurePa:6500}:{})};
 if(cloud.mode==='single'){
   const s=simulateBubble(config);
   return {...s,kind:'single',cloud,geometry:cloudGeometry(config,cloud)};
 }
 const geometry=cloudGeometry(config,cloud),n=geometry.length;
 const dp=config.pressureBar*1e5,reference=config.radiusMm*.001;
 const scaleUs=1e6*reference*Math.sqrt(WATER.density/dp);
 let state=[...geometry.map(g=>g.r0),...geometry.map(()=>0)],t=0,lastSaved=0;
 const firstMin=Array(n).fill(null),minimum=geometry.map(g=>g.r0);
 const frozen=Array(n).fill(false);
 const samples=[],horizon=4.2;
 const emit=()=>{
    const accelerations=coupledAcceleration(state.slice(0,n),state.slice(n),geometry,config,cloud.wall,frozen);
    samples.push({t,bubbles:geometry.map((g,i)=>({
      radius:state[i],velocity:state[n+i],acceleration:accelerations[i]
    }))});
 };
 emit();
 let truncated=false;
 for(let step=0;step<180000&&t<horizon;step++){
   // Beyond the first rebound, the potential-flow model cannot safely predict
   // secondary collapses. Hold a bubble after its primary rebound; other bubbles
   // still evolve and continue to interact with the remaining active sources.
   if(cloud.mode==='custom')for(let i=0;i<n;i++){
     if(!frozen[i]&&firstMin[i]!==null&&t-firstMin[i]>=0.12){
       frozen[i]=true;state[n+i]=0;
     }
   }
   const q=state.slice(0,n),v=state.slice(n);
   const a=coupledAcceleration(q,v,geometry,config,cloud.wall,frozen);
   let dt=0.002;
   for(let i=0;i<n;i++){
      dt=Math.min(dt,0.006*q[i]/(Math.abs(v[i])+.35),
        0.045*Math.sqrt(q[i]/(Math.abs(a[i])+1)));
   }
   dt=clamp(dt,1e-7,.002);
   dt=Math.min(dt,horizon-t);
   if(dt<=0)break;
   let next=rk4(state,dt,geometry,config,cloud.wall,frozen);
   // Never integrate into an unresolvable zero-radius, high-Mach singularity.
   if(next.some(x=>!Number.isFinite(x))||next.slice(0,n).some(x=>x<0.020)) {
     truncated=true;break;
   }
   for(let i=0;i<n;i++){
     minimum[i]=Math.min(minimum[i],next[i]);
     if(firstMin[i]===null&&v[i]<0&&next[n+i]>=0)firstMin[i]=t+dt;
   }
   state=next;t+=dt;
   if(t-lastSaved>=0.0035||t>=horizon-1e-8){emit();lastSaved=t}
   // This laboratory studies the FIRST implosion/rebound; later oscillations require
   // compressible and thermal physics and can diverge in the reduced-order model.
   if(firstMin.every(value=>value!==null)&&t>Math.max(...firstMin)+.30)break;
 }
 if(samples[samples.length-1].t!==t)emit();
 const first=firstMin.map((x,i)=>x===null?t:x);
 return {
   kind:'cloud', config,cloud,geometry,samples,scaleUs,
   durationTau:t, firstMinimumTau:Math.min(...first),
   individualCollapseUs:first.map(x=>x*scaleUs),
   collapseTimeUs:Math.min(...first)*scaleUs,
   minRadiusMm:Math.min(...minimum)*config.radiusMm,
   minRatios:minimum.map((r,i)=>r/geometry[i].r0),
   jetFactor:cloud.wall?clamp((2.8-config.standOff)/1.65,0,1):0,
   truncated:truncated||firstMin.some(x=>x===null),
   assumptions:'Coupled spherical Rayleigh-Plesset with point-source potential fields and rigid-wall images. No resolved nonspherical jet, acoustic shock or bubble translation.'
 };
}
export function cloudAt(solution,tau) {
 if(solution.kind==='single') {
   const s=sampleAt(solution,tau);
   return {t:s.t,bubbles:[{radius:s.radius,velocity:s.velocity,acceleration:0}]};
 }
 const arr=solution.samples,t=clamp(tau,0,solution.durationTau);
 if(t<=0)return arr[0];
 let lo=0,hi=arr.length-1;
 while(lo+1<hi){const m=(lo+hi)>>1;if(arr[m].t<t)lo=m;else hi=m;}
 const a=arr[lo],b=arr[hi],f=clamp((t-a.t)/Math.max(1e-9,b.t-a.t),0,1);
 return {t,bubbles:a.bubbles.map((x,i)=>{
   const y=b.bubbles[i];
   return {radius:x.radius+(y.radius-x.radius)*f,velocity:x.velocity+(y.velocity-x.velocity)*f,
     acceleration:x.acceleration+(y.acceleration-x.acceleration)*f};
 })};
}
