import test from 'node:test';
import assert from 'node:assert/strict';
import {waveLapse,waveGeometry,scalarPotential,wavePotential,
 createWave,advanceWave,waveEnergy,diagnostics,waveSnapshot,WAVE_SPAN,WAVE_POINTS} from './waves.js';
const close=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<tol,'Expected '+a+' ≈ '+b+' within '+tol);
const run=(w,time=38,dt=.05)=>{for(let t=0;t<time-1e-8;t+=dt)advanceWave(w,Math.min(dt,time-t));return diagnostics(w);};
test('tortoise coordinate is signed, continuous, monotone and symmetric',()=>{
 for(const eta of [0,.25,.65,.85]){
  const g=waveGeometry(eta);
  assert.equal(g.points,WAVE_POINTS);
  close(g.x[g.mid],0);close(g.z[g.mid],0);close(g.lapse[g.mid],Math.exp(-eta));
  for(let i=1;i<g.points;i++){
   assert.ok(g.z[i]>g.z[i-1]);close(g.z[i],-g.z[g.points-1-i],2e-10);
   close((g.z[i]-g.z[i-1])/g.dx,waveLapse((g.z[i]+g.z[i-1])*.5,eta),3e-5);
  }
 }
});
test('exact Ellis potential reproduces Rxx/R + j(j+1)/R²',()=>{
 for(const j of [0,1,3,5])for(const z of [-6,-2,-1,0,.8,4]){
  const r2=1+z*z;
  close(scalarPotential(z,j,0),j*(j+1)/r2+1/(r2*r2),1e-12);
 }
});
test('potential is nonnegative and symmetric for supported lapse profiles',()=>{
 for(const eta of [0,.2,.85])for(const j of [0,2,5]){
  const grid=waveGeometry(eta),u=wavePotential(grid,j);
  for(let i=0;i<u.length;i++){
   assert.ok(u[i]>=0);close(u[i],u[u.length-1-i],1e-10);
  }
 }
});
test('scalar effective potential grows with angular harmonic at the throat',()=>{
 close(scalarPotential(0,0,0),1);
 close(scalarPotential(0,3,0),13);
 assert.ok(scalarPotential(0,3,.6)>scalarPotential(0,0,.6));
});
test('packet Cauchy data initially travels toward throat from positive region',()=>{
 const w=createWave({eta:0,j:0,wavelength:1.2});
 const idx=Math.round((8+WAVE_SPAN)/w.grid.dx);
 const grad=(w.field[idx+1]-w.field[idx-1])/(2*w.grid.dx);
 close(w.velocity[idx],grad,1e-8);
 assert.ok(w.initialEnergy>0);
});
test('vacuum wave travels at unit characteristic velocity, without spontaneous reflection',()=>{
 const w=createWave({j:0,wavelength:1.2});
 w.potential.fill(0);w.initialEnergy=waveEnergy(w);w.history=[];w.loss=0;
 const d=run(w,33);
 assert.ok(d.transmission>.97);
 assert.ok(d.reflection<.03);
 assert.ok(Math.abs(d.budget-1)<.03);
});
test('Ellis j=3 low-frequency scattering strongly reflects wave energy',()=>{
 const w=createWave({eta:0,j:3,wavelength:2.6});
 const d=run(w,38);
 assert.ok(d.reflection>.7,'reflection='+d.reflection);
 assert.ok(d.transmission<.3,'transmission='+d.transmission);
 assert.ok(Math.abs(d.budget-1)<.03);
});
test('Ellis j=0 short-wavelength signal largely traverses the throat',()=>{
 const w=createWave({eta:0,j:0,wavelength:.85});
 const d=run(w,38);
 assert.ok(d.transmission>.9);
 assert.ok(d.reflection<.05);
});
test('interference in antiphase produces a node at the symmetric throat',()=>{
 const w=createWave({eta:0,j:0,double:true,wavelength:1.25,width:1.2,relativePhase:Math.PI});
 const d=run(w,10);
 assert.ok(Math.abs(w.field[w.grid.mid])<.0001,'node amplitude='+w.field[w.grid.mid]);
 assert.equal(d.spread,'two-sided');
});
test('same-phase incidence produces center amplitude different from antiphase',()=>{
 const a=createWave({j:0,double:true,relativePhase:0,wavelength:1.25});
 const b=createWave({j:0,double:true,relativePhase:Math.PI,wavelength:1.25});
 run(a,8.1);run(b,8.1);
 assert.ok(Math.abs(a.field[a.grid.mid])>Math.abs(b.field[b.grid.mid])+.01);
});
test('numerical energy plus sponge loss stays near initial energy',()=>{
 for(const eta of [0,.35,.85])for(const j of [0,2,5]){
  const w=createWave({eta,j,wavelength:1.5}),d=run(w,29,.045);
  assert.ok(Math.abs(d.budget-1)<.03,'eta='+eta+' j='+j+' budget='+d.budget);
  assert.ok(d.relativeEnergy>=0&&d.loss>=0);
 }
});
test('scattering energy flux agrees with total budget after pulse leaves detectors',()=>{
 for(const eta of [0,.5])for(const j of [0,1,3]){
  const w=createWave({eta,j,wavelength:2.6}),d=run(w,40,.05);
  assert.ok(d.reflection>=0&&d.transmission>=0);
  assert.ok(Math.abs(d.reflection+d.transmission-1)<.09,'R+T='+ (d.reflection+d.transmission));
 }
});
test('time integration produces finite history and signed waterfall measurements',()=>{
 const w=createWave({eta:.5,j:2,wavelength:1.4});
 run(w,15);
 assert.ok(w.history.length>4);
 assert.ok(w.waterfall.length>4);
 assert.ok(w.waterfall.every(r=>r.length===201));
 assert.ok(w.field.every(Number.isFinite)&&w.velocity.every(Number.isFinite));
 const snap=waveSnapshot(w);
 assert.ok(snap.history.every(e=>Number.isFinite(e.fieldAtThroat)));
});
test('paused solver rejects invalid time steps and never changes finished state',()=>{
 const w=createWave();
 assert.throws(()=>advanceWave(w,-.2));
 assert.throws(()=>advanceWave(w,Infinity));
 close(w.t,0);
 run(w,42);
 const old=w.t;advanceWave(w,.5);close(w.t,old);
});
test('bad partial-wave harmonics and nonphysical metrics are rejected',()=>{
 assert.throws(()=>scalarPotential(0,10,0));
 assert.throws(()=>waveGeometry(-.1));
 assert.throws(()=>waveGeometry(1.2));
 assert.throws(()=>waveGeometry(.2,300));
});
test('high potential produces distinct energy scattering from the same input packet',()=>{
 const low=run(createWave({eta:0,j:0,wavelength:2.6}),38);
 const high=run(createWave({eta:0,j:3,wavelength:2.6}),38);
 assert.ok(high.reflection>low.reflection+.5);
});
