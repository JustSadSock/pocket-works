import test from 'node:test';
import assert from 'node:assert/strict';
import {metric} from './spacetime.js';
import {rotatingMetric,rotatingGeometry,ergoSummary,schwarzschild,schwarzschildClock,
 launchRotating,launchSchwarzschild,rotatingDerivative,schwarzschildDerivative,
 advanceRotating,advanceSchwarzschild,wormholeConstraint,schwarzschildConstraint,runComparison} from './rotation.js';
const close=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<eps,'expected '+a+' ≈ '+b+' within '+eps);
const m0=metric();
const run=(ray,m,engine='wormhole',max=8000)=>{
 let i=0;
 while(ray.status==='flying'&&i++<max){
  if(engine==='wormhole')advanceRotating(ray,m,.05*m.a);
  else advanceSchwarzschild(ray,m,.05*m.horizon);
 }
 return ray;
};
test('Teo-inspired model recovers static metric and asymptotic frame dragging',()=>{
 const m=rotatingMetric(metric({a:2.4}),{omega:.4});
 const g=rotatingGeometry(0,m),f=rotatingGeometry(20*m.a,m);
 close(g.omega*m.a,.4);close(f.omega*m.a,.4*(m.a/f.R)**3);
 close(rotatingGeometry(0,rotatingMetric(m0,{omega:0})).gtt,-1);
 assert.ok(Math.abs(f.omega)<Math.abs(g.omega));
});
test('non-rotating radial photon has zero angular drift and crosses the throat',()=>{
 const m=rotatingMetric(m0,{omega:0}),w=launchRotating(m,{angle:0});
 const result=run(w,m);
 assert.equal(result.status,'escaped-B');assert.equal(result.crossings,1);
 close(result.phi,0,1e-10);
 assert.ok(result.maxResidual<1e-8);
});
test('rotating zero angular momentum photon is dragged in the rotation direction',()=>{
 for(const spin of [-.55,.55]){
  const m=rotatingMetric(m0,{omega:spin}),w=run(launchRotating(m,{angle:0}),m);
  assert.equal(w.status,'escaped-B');
  assert.ok(w.phi*spin>0);
  assert.ok(Math.abs(w.phi)>.6);
  assert.ok(w.maxResidual<1e-8);
 }
});
test('stationary metric conserves E, L and Hamiltonian under signed-spin runs',()=>{
 for(const spin of [-1.3,-.75,0,.55,1.3]){
  const m=rotatingMetric(metric({eta:.35,shape:.1,lapseBump:-.12}),{omega:spin});
  for(const angle of [-.32,-.11,0,.11,.32]){
   const w=launchRotating(m,{angle});
   const E=w.E,L=w.L;
   for(let n=0;n<420;n++)advanceRotating(w,m,.02*m.a);
   close(w.E,E);close(w.L,L);
   assert.ok(Math.abs(wormholeConstraint(w,m))<7e-6,'spin '+spin+' angle '+angle+' H '+wormholeConstraint(w,m));
   assert.ok(w.path.length>10);
  }
 }
});
test('spin reversal and angle reversal have mirror-related azimuth',()=>{
 const a=run(launchRotating(rotatingMetric(m0,{omega:.6}),{angle:.2}),rotatingMetric(m0,{omega:.6}));
 const b=run(launchRotating(rotatingMetric(m0,{omega:-.6}),{angle:-.2}),rotatingMetric(m0,{omega:-.6}));
 assert.equal(a.status,b.status);
 close(a.phi,-b.phi,2e-7);close(a.l,b.l,2e-7);
});
test('same signed angle is not mirror symmetric when rotation is held constant',()=>{
 const m=rotatingMetric(m0,{omega:.6});
 const positive=run(launchRotating(m,{angle:.19}),m);
 const negative=run(launchRotating(m,{angle:-.19}),m);
 assert.ok(Math.abs(Math.abs(positive.phi)-Math.abs(negative.phi))>.15);
});
test('ergoregion boundary follows stationary Killing norm gtt>0',()=>{
 const below=rotatingMetric(m0,{omega:.8});
 const above=rotatingMetric(m0,{omega:1.25});
 assert.equal(ergoSummary(below).present,false);
 assert.equal(ergoSummary(above).present,true);
 assert.ok(ergoSummary(above).extent>0);
 const z=rotatingGeometry(0,above);
 assert.ok(z.gtt>0);
 assert.ok(z.localFrameSpeed>1);
});
test('ergoregion can arise at lower spin if redshift lapse is suppressed',()=>{
 const m=rotatingMetric(metric({eta:.65}),{omega:.78});
 assert.ok(ergoSummary(m).present);
 assert.ok(rotatingGeometry(0,m).N<1);
});
test('Schwarzschild horizon, photon sphere and critical impact obey exact 3M law',()=>{
 for(const M of [.4,.5,2]){
  const s=schwarzschild(M);
  close(s.horizon,2*M);close(s.photonSphere,3*M);
  close(s.criticalImpact,3*Math.sqrt(3)*M);
  close(schwarzschildClock(2*M,M),0);
  close(schwarzschildClock(50*M,M),Math.sqrt(.96));
 }
});
test('Schwarzschild radial null geodesic reaches horizon with finite affine position',()=>{
 const s=schwarzschild(.5),r=run(launchSchwarzschild(s,{angle:0}),s,'black');
 assert.equal(r.status,'horizon');
 assert.ok(Math.abs(r.r-s.horizon*1.012)<1e-10);
 assert.ok(r.t>0&&Number.isFinite(r.t));
 close(r.phi,0,1e-10);
});
test('Schwarzschild supercritical impact rays scatter, subcritical hit horizon',()=>{
 const s=schwarzschild(.5);
 const f=Math.sqrt(1-s.horizon/(6*s.horizon));
 const limit=Math.asin(s.criticalImpact*f/(6*s.horizon));
 const captured=run(launchSchwarzschild(s,{angle:limit-.045}),s,'black');
 const escaped=run(launchSchwarzschild(s,{angle:limit+.045}),s,'black');
 assert.equal(captured.status,'horizon');
 assert.equal(escaped.status,'escaped');
 assert.ok(limit>.38&&limit<.43);
});
test('Schwarzschild orbit is invariant under azimuth reversal',()=>{
 const s=schwarzschild(.5);
 const a=run(launchSchwarzschild(s,{angle:.51}),s,'black');
 const b=run(launchSchwarzschild(s,{angle:-.51}),s,'black');
 assert.equal(a.status,b.status);close(a.phi,-b.phi,1e-10);
 close(a.r,b.r,1e-10);
});
test('Schwarzschild null constraint remains small through scattering trajectories',()=>{
 const s=schwarzschild(.5);
 for(const angle of [-.62,-.52,-.32,0,.32,.52,.62]){
  const ray=run(launchSchwarzschild(s,{angle}),s,'black');
  assert.ok(ray.maxResidual<2e-6);
  assert.ok(Number.isFinite(ray.r)&&Number.isFinite(ray.phi));
 }
});
test('radial frame dragging derivative yields dphi/dlambda=omega E/N²',()=>{
 const m=rotatingMetric(metric({eta:.3}),{omega:.5});
 const w=launchRotating(m,{angle:0}),g=rotatingGeometry(w.l,m);
 const d=rotatingDerivative(w,m);
 close(d.phi,g.omega*w.E/(g.N*g.N));
});
test('matched local launch uses same circumferential radius and initial angle',()=>{
 const m=rotatingMetric(metric({a:2.2,shape:.22,lapseBump:-.12}),{omega:.6}),
 s=schwarzschild(m.a/2),angle=.24;
 const w=launchRotating(m,{angle,arealRadius:6}),b=launchSchwarzschild(s,{angle,arealRadius:6});
 close(rotatingGeometry(w.l,m).R,b.r,1e-7);
 close(w.p,-Math.cos(angle));
 close(w.L/rotatingGeometry(w.l,m).R,Math.sin(angle));
 close(b.L/b.r,Math.sin(angle));
 close(wormholeConstraint(w,m),0,1e-9);
 close(schwarzschildConstraint(b,s),0,1e-9);
});
test('same incoming local radial ray crosses wormhole but meets black-hole horizon',()=>{
 const z=runComparison({base:metric(),omega:.42,angle:.08});
 assert.equal(z.wormhole.status,'escaped-B');
 assert.equal(z.blackHole.status,'horizon');
 assert.equal(z.wormhole.crossings,1);
 assert.ok(z.wormhole.maxResidual<1e-6&&z.blackHole.maxResidual<1e-6);
});
test('saved status never produces fake crossing after numerical integration ended',()=>{
 const m=rotatingMetric(m0,{omega:0}),w=run(launchRotating(m,{angle:0}),m);
 const before=w.steps,cross=w.crossings;
 advanceRotating(w,m,.02);
 assert.equal(w.steps,before);assert.equal(w.crossings,cross);
});
test('invalid spins, masses, radii and directions are rejected',()=>{
 assert.throws(()=>rotatingMetric(m0,{omega:4}));
 assert.throws(()=>rotatingMetric(m0,{omega:Infinity}));
 assert.throws(()=>schwarzschild(-1));
 assert.throws(()=>launchRotating(rotatingMetric(m0),{angle:4}));
 assert.throws(()=>launchSchwarzschild(schwarzschild(1),{arealRadius:1}));
});
