import test from 'node:test';
import assert from 'node:assert/strict';
import {metric,geometry,stressEnergy,throatDiagnostics,sampleEinstein} from './spacetime.js';
import {launch,advance,constraint,localSpeed} from './relativity.js';
import {createSpecimen,tidalFrame,stepSpecimen,specimenStats} from './material.js';
import {createWave,advanceWave,diagnostics,scalarPotential,waveGeometry} from './waves.js';
const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol,'Expected '+a+' ≈ '+b+', tolerance '+tol);
const paths=[
 {a:1,eta:0,shape:0,lapseBump:0},
 {a:1,eta:.6,shape:.45,shapeWidth:2.2,lapseBump:-.21,lapseWidth:1.5},
 {a:2.3,eta:.35,shape:-.31,shapeWidth:.88,lapseBump:.28,lapseWidth:.86},
 {a:.7,eta:.8,shape:.52,shapeWidth:1.1,lapseBump:.35,lapseWidth:2.6}
];
test('Ellis exactly recovers the established radial matter tensor',()=>{
 const m=metric();
 for(const l of [-5,-1,0,.8,2.4]){
  const t=stressEnergy(l,m),expected=-m.a*m.a/(8*Math.PI*(l*l+m.a*m.a)**2);
  near(t.rho,expected);near(t.pr,expected);near(t.pt,-expected);
  near(t.radial,2*expected);near(t.tangential,0);
 }
});
test('smooth symmetric throat has no horizon, R(0)=a, flare > 0',()=>{
 for(const args of paths){
  const m=metric(args),g=geometry(0,m),d=throatDiagnostics(m);
  near(g.R,m.a);near(g.Rp,0);
  assert.ok(g.Rpp>0&&d.flaring>0);
  near(d.minimumRadius,1,1e-8);near(d.minimumAt,0,1e-8);
  for(const x of [0,.1,1,2,5,20]){
   const a=geometry(x*m.a,m),b=geometry(-x*m.a,m);
   near(a.R,b.R);near(a.N,b.N);near(a.Rp,-b.Rp);near(a.dlogN,-b.dlogN);
   assert.ok(a.N>0);
  }
 }
});
test('analytic geometry first and second derivatives match finite differences',()=>{
 const h=2e-4;
 for(const args of paths){
  const m=metric(args);
  for(const z of [-5,-2,-.9,0,.7,2.3,6]){
   const l=z*m.a,H=h*m.a,g=geometry(l,m),a=geometry(l-H,m),b=geometry(l+H,m);
   near(g.Rp,(b.R-a.R)/(2*H),2e-6);
   near(g.Rpp,(b.R-2*g.R+a.R)/(H*H),2e-6/m.a);
   near(g.dlogN,(Math.log(b.N)-Math.log(a.N))/(2*H),2e-6/m.a);
   near(g.NppOverN,(b.N-2*g.N+a.N)/(H*H*g.N),2e-6/(m.a*m.a));
  }
 }
});
test('radial NEC must be violated for a smooth flaring wormhole throat',()=>{
 for(const args of paths){
  const m=metric(args),t=stressEnergy(0,m);
  assert.ok(t.radial<0);
  near(8*Math.PI*t.radial,-2*t.g.Rpp/t.g.R,1e-9);
  assert.equal(t.nec,false);assert.equal(t.wec,false);
 }
});
test('orthonormal static Einstein source obeys local covariant conservation',()=>{
 for(const args of paths){
  const m=metric(args);
  for(const z of [-3,-1.1,-.1,.1,1.6,4]){
   const l=z*m.a,h=.0002*m.a,t=stressEnergy(l,m),g=geometry(l,m);
   const dp=(stressEnergy(l+h,m).pr-stressEnergy(l-h,m).pr)/(2*h);
   const expected=-(t.rho+t.pr)*g.dlogN+2*(t.pt-t.pr)*g.Rp/g.R;
   near(dp,expected,3e-6/(m.a**3));
  }
 }
});
test('Einstein tensor Ricci trace identity follows static diagonal source',()=>{
 for(const args of paths){
  const m=metric(args);
  for(const z of [0,1,3]){
   const t=stressEnergy(z*m.a,m);
   near(t.Ricci,8*Math.PI*(t.rho-t.pr-2*t.pt));
  }
 }
});
test('custom metric becomes asymptotically flat at both radial infinities',()=>{
 for(const args of paths){
  const m=metric(args);
  const g=geometry(80*m.a,m),t=stressEnergy(80*m.a,m);
  assert.ok(Math.abs(g.N-1)<.011);
  assert.ok(Math.abs(g.Rp-1)<.011);
  assert.ok(Math.abs(t.rho)*m.a*m.a<1e-5);
  assert.ok(Math.abs(t.pt)*m.a*m.a<1e-5);
 }
});
test('sampled matter curve is finite and physically changes when shape edited',()=>{
 const a=sampleEinstein(metric(),-4,4,241),
       b=sampleEinstein(metric({shape:.5,shapeWidth:2}),-4,4,241);
 assert.equal(a.length,241);assert.equal(b.length,241);
 assert.ok(a.every(q=>Object.values(q).every(Number.isFinite)));
 assert.ok(b.every(q=>Object.values(q).every(Number.isFinite)));
 assert.ok(Math.abs(a[120].rho-b[120].rho)>.001);
});
test('custom shapes preserve timelike and null Hamiltonian constraints',()=>{
 for(const args of paths){
  const m=metric(args);
  for(const kind of ['matter','light'])for(const alpha of [Math.PI,Math.PI+.28,Math.PI-.37]){
   const s=launch(m,{l:3*m.a,kind,alpha,speed:.7});
   for(let i=0;i<210;i++)advance(s,m,.03*m.a,{record:false});
   assert.ok(Math.abs(constraint(s,m))<1e-6);
   if(kind==='light')near(localSpeed(s,m),1,1e-6);
  }
 }
});
test('wave potential is derived from same R and lapse and changes with geometry',()=>{
 const m=metric({eta:.4,shape:.4,shapeWidth:1.1,lapseBump:-.2,lapseWidth:2});
 const z=1.2,g=geometry(z,m),u=scalarPotential(z,2,m);
 near(u,g.N*g.N*(6/(g.R*g.R)+g.Rpp/g.R+g.dlogN*g.Rp/g.R));
 assert.ok(Math.abs(u-scalarPotential(z,2,m.eta))>.001);
 const grid=waveGeometry(m);assert.ok(grid.points>500);
});
test('custom geometry supports wave evolution and stable energy budget',()=>{
 for(const args of paths){
  const wave=createWave({...args,j:2,wavelength:1.7});
  for(let i=0;i<550;i++)advanceWave(wave,.04);
  const d=diagnostics(wave);
  assert.ok(Math.abs(d.budget-1)<.035,'Energy budget '+d.budget);
  assert.ok(d.peak>=0);
 }
});
test('material tidal eigenvalues respond to modified R and N derivatives',()=>{
 for(const args of paths){
  const m=metric(args),s=createSpecimen(m,{axis:'radial',aMeters:2000});
  const a=tidalFrame(s.ray,m),g=geometry(s.ray.l,m);
  near(a.radial,-g.NppOverN);
  near(a.transverse,a.gamma*a.gamma*(a.beta*a.beta*g.Rpp/g.R-g.dlogN*g.Rp/g.R));
  for(let i=0;i<200;i++)stepSpecimen(s,.04);
  assert.ok(specimenStats(s).pointNorm<1e-6);
 }
});
test('invalid editor knobs are rejected rather than silently creating a horizon',()=>{
 for(const input of [{shape:-.5},{shape:.8},{shapeWidth:0},{lapseBump:.8},{lapseWidth:0},{a:-1},{eta:1}]){
  assert.throws(()=>metric(input));
 }
});
test('finite source obeys all energy-condition classifications at every grid sample',()=>{
 for(const args of paths){
  const m=metric(args);
  for(let i=-50;i<=50;i++){
   const t=stressEnergy(i*.12*m.a,m);
   assert.equal(t.nec,t.radial>=-1e-12&&t.tangential>=-1e-12);
   assert.equal(t.wec,t.nec&&t.rho>=-1e-12);
  }
 }
});
