import test from 'node:test';
import assert from 'node:assert/strict';
import {
 metric,geometry,launch,advance,trace,constraint,localSpeed,staticAcceleration,
 staticClockRate,nullEnergyRadial,collectBeam,embedding
} from './relativity.js';
const near=(actual,expected,tol=1e-7)=>assert.ok(Math.abs(actual-expected)<=tol,`${actual} ≠ ${expected} (tol ${tol})`);
function integrate(s,m,seconds){for(let t=0;t<seconds-1e-8;t+=.03)advance(s,m,Math.min(.03,seconds-t));return s;}
test('Ellis throat is regular, R>=a, N=1 and K=-1/a² at throat',()=>{
 const m=metric({a:2,eta:0});
 near(geometry(0,m).R,2);near(geometry(0,m).N,1);
 near(geometry(0,m).K,-.25);
 for(let l=-100;l<=100;l+=.3){assert.ok(geometry(l,m).R>=2);near(staticClockRate(l,m),1);}
});
test('spatial embedding is isometric along l',()=>{
 const m=metric({a:1.4,eta:0}),h=1e-5;
 for(const l of [-5,-2,-.7,0,.4,1.3,4]){
  const p1=embedding(l+h,m),p0=embedding(l-h,m);
  const dr=(p1.r-p0.r)/(2*h),dz=(p1.z-p0.z)/(2*h);
  near(dr*dr+dz*dz,1,2e-9);
 }
});
test('radial null ray passes smoothly to opposite asymptotic region',()=>{
 const m=metric({a:1}),s=launch(m,{l:3,alpha:Math.PI});
 integrate(s,m,8);
 assert.equal(s.crossings,1);near(s.l,-5,1e-9);
 near(localSpeed(s,m),1);near(constraint(s,m),0,1e-10);
 near(s.tau,0);
});
test('positive and negative ends of wormhole are symmetric for Ellis',()=>{
 const m=metric({a:1.3}),a=launch(m,{l:3,alpha:Math.PI+.15});
 const b=launch(m,{l:-3,alpha:Math.PI-.15});
 integrate(a,m,12);integrate(b,m,12);
 near(a.l,-b.l,1e-8);
 near(a.crossings,b.crossings);
});
test('angular momentum and photon Hamiltonian normalization remain conserved',()=>{
 const m=metric({a:1,eta:0}),s=launch(m,{l:3,alpha:Math.PI+.15});
 const {E,L}=s;integrate(s,m,16);
 near(s.E,E);near(s.L,L);near(constraint(s,m),0,1e-7);
});
test('subcritical impact traverses; supercritical impact scatters',()=>{
 const m=metric({a:1});
 const pass=launch(m,{l:5,alpha:Math.PI+.1});
 const scatter=launch(m,{l:5,alpha:Math.PI+.33});
 integrate(pass,m,17);integrate(scatter,m,17);
 assert.equal(pass.crossings,1);assert.equal(scatter.crossings,0);
 assert.ok(scatter.l>0);
});
test('redshift lapse produces inward static acceleration and different clock rates',()=>{
 const m=metric({a:1,eta:.6});
 assert.ok(staticAcceleration(2,m)<0);
 assert.ok(staticAcceleration(-2,m)>0);
 near(staticAcceleration(0,m),0);
 assert.ok(staticClockRate(.8,m)<staticClockRate(5,m));
 assert.ok(geometry(0,m).N<1);
});
test('light remains locally luminal in both metrics to integrator precision',()=>{
 for(const eta of [0,.35,.85]){
  const m=metric({a:1,eta}),s=launch(m,{l:3,alpha:Math.PI+.17});
  integrate(s,m,12);near(localSpeed(s,m),1,3e-8);
  near(constraint(s,m),0,3e-7);
 }
});
test('massive particles have timelike norm and elapsed proper time',()=>{
 const m=metric({a:1.2,eta:.6});
 const r=launch(m,{l:3,alpha:Math.PI,speed:.7,kind:'matter'});
 integrate(r,m,13);
 near(constraint(r,m),0,3e-7);
 assert.ok(r.tau>0&&r.tau<r.t);
 assert.ok(localSpeed(r,m)<1);
});
test('NEC is negative for Ellis; absent for unspecified redshift source',()=>{
 const a=metric({a:1,eta:0}),b=metric({a:1,eta:.2});
 near(nullEnergyRadial(0,a),-2);
 near(nullEnergyRadial(1,a),-.5);
 assert.equal(nullEnergyRadial(0,b),null);
});
test('beam samples distinct initial angular momenta',()=>{
 const m=metric({a:1});
 const rays=collectBeam(m,{l:3,phi:Math.PI,alpha:Math.PI},{count:15,spread:.5});
 assert.equal(rays.length,15);assert.ok(new Set(rays.map(r=>r.L.toFixed(4))).size>=10);
 for(const ray of rays)near(constraint(ray,m),0,1e-12);
});
test('400 random rays satisfy geodesic invariant through long travel',()=>{
 let seed=1337;const next=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
 for(let i=0;i<400;i++){
  const m=metric({a:.5+next()*2.5,eta:next()*.85});
  const light=i%2===0;
  const ray=launch(m,{l:m.a*(1+next()*4)*(i%3===0?-1:1),
   alpha:next()*Math.PI*2,phi:next()*6.28318,speed:.1+next()*.85,kind:light?'light':'matter'});
  integrate(ray,m,3*m.a);
  assert.ok(Number.isFinite(ray.l)&&Number.isFinite(ray.phi));
  assert.ok(Math.abs(constraint(ray,m))<1e-6,`seed ray ${i}, error ${constraint(ray,m)}`);
 }
});
