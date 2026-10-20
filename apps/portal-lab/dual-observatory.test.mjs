import test from 'node:test';
import assert from 'node:assert/strict';
import {metric,geometry} from './spacetime.js';
import {cameraBasis,pixelDirection,dot} from './optics.js';
import {cameraForRay,frameAt,worldDirection,chartObserverPosition,inspectObserverRay} from './observer-bridge.js';
import {inspectSharedCamera} from './dual-observatory.js';
const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol,'Expected '+a+' ≈ '+b);
const pos=(l=2.8,longitude=0,latitude=0)=>({l,longitude,latitude});
function pose(point,theta){
 const c=cameraForRay(point,theta*Math.PI/180);
 return {...c,fov:80};
}
test('dual camera exactly follows the chosen central null direction in exterior A',()=>{
 const m=metric({a:1});
 for(const angle of [0,20,60,90,135,175,180]){
  const result=inspectSharedCamera(m,pos(2.8,72,35),pose(pos(2.8),angle));
  near(result.gazeAngle,angle,1e-8);
 }
});
test('dual camera exactly follows the chosen direction in exterior B',()=>{
 const m=metric({a:1,eta:.2});
 for(const angle of [0,15,49,90,135,169,180]){
  const p=pos(-3.1,-83,-45),result=inspectSharedCamera(m,p,pose(p,angle));
  near(result.gazeAngle,angle,1e-8);
 }
});
test('observer position is shared, not remapped by artistic diagram centres',()=>{
 const m=metric({a:1.5}),p=pos(2.35,142,38);
 const survey=inspectSharedCamera(m,p,pose(p,145)),chart=chartObserverPosition(m,p);
 assert.deepEqual(survey.point,p);
 near(chart.radius,geometry(p.l*m.a,m).R/m.a,1e-12);
});
test('both regions have real inward crossing into the opposite asymptotic sky',()=>{
 const m=metric({a:1});
 for(const sign of [-1,1]){
  const p=pos(2.7*sign,26,-13);
  const survey=inspectSharedCamera(m,p,pose(p,180));
  assert.equal(survey.physical.exit,sign>0?'B':'A');
  assert.equal(survey.physical.passes,1);
  assert.equal(survey.physical.resolved,true);
 }
});
test('outward-looking camera sees only its own source region',()=>{
 const m=metric({a:1});
 for(const l of [-3.5,3.5]){
  const p=pos(l,105,60),survey=inspectSharedCamera(m,p,pose(p,0));
  assert.equal(survey.physical.exit,l>0?'A':'B');
  assert.equal(survey.physical.passes,0);
 }
});
test('geodesic result is independent of latitude and longitude for spherical metrics',()=>{
 const m=metric({a:1,eta:.45});
 const a=inspectSharedCamera(m,pos(2.4,-180,-90),pose(pos(2.4),151));
 const b=inspectSharedCamera(m,pos(2.4,158,85),pose(pos(2.4),151));
 assert.equal(a.physical.exit,b.physical.exit);
 near(a.physical.impact,b.physical.impact,1e-9);
 near(a.physical.winding,b.physical.winding,1e-9);
});
test('the sky panorama rotates with the actual world-space observer orientation',()=>{
 const dir=[-.7,.4,.5],a=pos(3.2,0,0),b=pos(3.2,115,52);
 const rotatedA=worldDirection(dir,frameAt(a)),rotatedB=worldDirection(dir,frameAt(b));
 assert.ok(Math.hypot(...rotatedA.map((v,i)=>v-rotatedB[i]))>.25);
 near(Math.hypot(...rotatedA),1,1e-12);
 near(Math.hypot(...rotatedB),1,1e-12);
});
test('same optical calculation and local centre pixel share the exact inward angle',()=>{
 const m=metric({a:1.3,eta:.23}),p=pos(2.5,41,-12);
 const c=cameraForRay(p,167*Math.PI/180);
 const basis=cameraBasis(c.yaw,c.pitch,1,c.facingSign);
 const d=pixelDirection(0,0,basis,80,1);
 const angle=Math.acos(Math.max(-1,Math.min(1,dot(basis.radial,d))));
 const a=inspectObserverRay(m,p,angle),b=inspectSharedCamera(m,p,c);
 near(a.impact,b.physical.impact,1e-9);
 near(a.winding,b.physical.winding,1e-9);
 assert.equal(a.exit,b.physical.exit);
});
test('changes of spatial scale rescale the impact parameter in physical units',()=>{
 const p=pos(3.2,20,20),theta=147;
 const a=inspectSharedCamera(metric({a:1}),p,pose(p,theta)).physical.impact;
 const b=inspectSharedCamera(metric({a:2.5}),p,pose(p,theta)).physical.impact;
 near(b/a,2.5,1e-8);
});
test('phenomenological redshift changes photon impact without changing radial position',()=>{
 const p=pos(2.6,55,15),theta=157;
 const a=inspectSharedCamera(metric({a:1,eta:0}),p,pose(p,theta));
 const b=inspectSharedCamera(metric({a:1,eta:.7}),p,pose(p,theta));
 assert.ok(b.physical.impact>a.physical.impact);
 near(a.point.l,b.point.l);
});
test('physical null constraint remains small for two synchronized instrument modes',()=>{
 const p=pos(-2.6,100,-60),m=metric({a:1,eta:.4});
 for(const angle of [12,80,145,170]){
  const s=inspectSharedCamera(m,p,pose(p,angle));
  assert.ok(s.physical.residual<1e-6,'Null constraint '+s.physical.residual);
  assert.ok(s.physical.impactError<1e-7);
 }
});
test('changing FoV cannot change the direction of the central photon',()=>{
 const p=pos(-2,155,45),m=metric({a:1});
 for(const fov of [50,70,100,110]){
  const v={...pose(p,145),fov};
  near(inspectSharedCamera(m,p,v).gazeAngle,145,1e-8);
 }
});
test('valid B chart selection keeps negative proper l, no fake inter-chart distance',()=>{
 const p=pos(-3.85,90,0);
 const s=inspectSharedCamera(metric({a:1}),p,pose(p,165));
 assert.equal(s.point.l,-3.85);
 assert.equal(s.physical.sourceRegion,'B');
});
test('invalid positions are rejected before geodesic calculation',()=>{
 const m=metric({a:1});
 assert.throws(()=>inspectSharedCamera(m,pos(0),pose(pos(3),100)));
 assert.throws(()=>inspectSharedCamera(m,pos(8),pose(pos(3),100)));
 assert.throws(()=>inspectSharedCamera(m,pos(2,220,0),pose(pos(3),100)));
});
test('dual 3D and sky computations agree on which side the observer occupies',()=>{
 const m=metric({a:1.7,shape:.15,eta:.32});
 for(const l of [-4.1,-.75,.75,4.1]){
  const p=pos(l,135,58),e=chartObserverPosition(m,p),s=inspectSharedCamera(m,p,pose(p,180));
  assert.equal(e.chart,l>0?'A':'B');
  assert.equal(s.physical.sourceRegion,e.chart);
 }
});
