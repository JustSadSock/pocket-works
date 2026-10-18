import test from 'node:test';
import assert from 'node:assert/strict';
import {metric,geometry,localSpeed} from './relativity.js';
import {photonTransfer,criticalAngle,buildTransfer,lookup,cameraBasis,pixelDirection,backgroundDirection,dot} from './optics.js';
import {createCongruence,stepCongruence,strain,diagnosticGeometry} from './tidal.js';
const close=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol,`${a} versus ${b}`);
for(const eta of [0,.35,.85]){
 test(`radial photons cross both sides with eta=${eta}`,()=>{
  const m=metric({a:1.3,eta});
  const p=photonTransfer(m,2.3*m.a,Math.PI,{outer:12,maxTime:80});
  const n=photonTransfer(m,-2.3*m.a,Math.PI,{outer:12,maxTime:80});
  assert.ok(p.resolved&&n.resolved);assert.equal(p.region,1);assert.equal(n.region,0);
  assert.equal(p.passes,1);assert.equal(n.passes,1);
  assert.ok(p.error<2e-6);
 });
 test(`outward photons stay in the original region at eta=${eta}`,()=>{
  const m=metric({a:1.3,eta});
  assert.equal(photonTransfer(m,2.3*m.a,0,{outer:12}).region,0);
  assert.equal(photonTransfer(m,-2.3*m.a,0,{outer:12}).region,1);
 });
 test(`photon ring has higher winding than radial light for eta=${eta}`,()=>{
  const m=metric({a:1.3,eta});
  const angle=criticalAngle(m,2.3*m.a);
  const b=photonTransfer(m,2.3*m.a,angle+.012,{outer:14,maxTime:155});
  const radial=photonTransfer(m,2.3*m.a,Math.PI,{outer:14,maxTime:155});
  assert.ok(b.winding>radial.winding+.3);
 });
}
test('angular transfer samples conserve both sky region and finite numbers',()=>{
 const m=metric({a:1,eta:.35}),table=buildTransfer(m,2.2,120);
 for(let i=0;i<=100;i++){
  const t=lookup(table,i*Math.PI/100);
  assert.ok(t&&Number.isFinite(t.angle)&&Number.isFinite(t.impact));
  assert.ok(t.region===0||t.region===1||t.region===-1);
 }
});
test('static camera central ray comes from the opposite universe',()=>{
 const m=metric({a:1}),t=buildTransfer(m,2.1,50);
 for(const side of [1,-1]){
  const b=cameraBasis(0,0,side,side);
  const forward=pixelDirection(0,0,b,80,1.5);
  const actual=backgroundDirection(forward,b,t);
  assert.equal(actual.region,side===1?1:0);
  close(dot(forward,b.radial),-1,1e-9);
 }
});
test('deviation experiment starts as a nearly undeformed local unit circle',()=>{
 const m=metric({a:1,eta:0});
 const c=createCongruence(m,{l:2.4,speed:.72,size:.03});
 const s=strain(c);
 close(s.radial.length,1,1e-9);close(s.transverse.length,1,1e-9);
 close(s.areaRatio,1,1e-9);
 assert.equal(diagnosticGeometry(s).length,65);
});
test('Ellis radial motion shows transverse geodesic convergence with no fictitious radial strain',()=>{
 const m=metric({a:1,eta:0}),c=createCongruence(m,{l:2.4,speed:.72,size:.02});
 const initial=strain(c);
 let closest=null;
 for(let i=0;i<260;i++){
  const s=stepCongruence(c,.02);
  if(!closest||Math.abs(s.l)<Math.abs(closest.l))closest=s;
 }
 assert.ok(closest.transverse.length<initial.transverse.length*.8);
 assert.ok(Math.abs(closest.radial.length-1)<.02);
 assert.ok(closest.maxError<1e-6);
});
test('redshift probe deforms continuously and respects timelike normalization',()=>{
 const m=metric({a:1,eta:.7}),c=createCongruence(m,{l:2.5,speed:.8,size:.015});
 for(let i=0;i<320;i++)stepCongruence(c,.018);
 const d=strain(c);
 assert.ok(Number.isFinite(d.areaRatio)&&d.areaRatio>0);
 assert.ok(d.properTime>0&&d.properTime<d.coordinateTime);
 assert.ok(d.maxError<1e-6);
});
