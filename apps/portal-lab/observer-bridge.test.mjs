import test from 'node:test';
import assert from 'node:assert/strict';
import {metric,geometry} from './spacetime.js';
import {newLightField,advanceLightField,lightFieldSamples} from './light-field.js';
import {cameraBasis,pixelDirection} from './optics.js';
import {
 BRIDGE_MIN_RADIUS,BRIDGE_MAX_RADIUS,normalizeObserverPoint,
 frameAt,worldDirection,localDirection,chartObserverPosition,
 pointFromPhoton,photonLocalAngle,inspectObserverRay,bridgeSnapshot
} from './observer-bridge.js';
const eq=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<=tol,'Expected '+a+' ≈ '+b);
const point=(l=3.2,longitude=0,latitude=0)=>({l,longitude,latitude});
const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0);
test('identity frame on standard exterior A north/east geometry',()=>{
 const f=frameAt(point());
 assert.deepEqual(f.x,[1,0,0]);assert.deepEqual(f.y,[0,1,0]);
 assert.deepEqual(f.z,[0,0,1]);
});
test('B chart uses the physical outward radial on its own external sheet',()=>{
 const f=frameAt(point(-3.2));
 assert.deepEqual(f.x,[-1,0,0]);assert.deepEqual(f.y,[0,1,0]);
 assert.deepEqual(f.z,[0,0,-1]);
});
test('observer orientation basis is orthonormal for arbitrary 3D positions',()=>{
 for(const l of [-5,-.2,.2,5.9])for(const lat of [-90,-55,0,67,90])for(const lon of [-177,0,58,160]){
  const frame=frameAt(point(l,lon,lat)),vectors=[frame.x,frame.y,frame.z];
  for(let i=0;i<3;i++){
   eq(dot(vectors[i],vectors[i]),1,1e-12);
   for(let j=i+1;j<3;j++)eq(dot(vectors[i],vectors[j]),0,1e-12);
  }
 }
});
test('world<->local transformation is reversible for arbitrary basis and ray',()=>{
 const loc=[.2,.8,-.43],len=Math.hypot(...loc);
 for(const p of [point(2,0,0),point(1,83,31),point(-1.1,-155,-72)]){
  const frame=frameAt(p),world=worldDirection(loc,frame),back=localDirection(world,frame);
  for(let i=0;i<3;i++)eq(back[i],loc[i]/len,1e-12);
 }
});
test('normalization validates both signed exterior charts and physical bounds',()=>{
 for(const l of [-BRIDGE_MAX_RADIUS,-BRIDGE_MIN_RADIUS,BRIDGE_MIN_RADIUS,BRIDGE_MAX_RADIUS])
  assert.equal(normalizeObserverPoint(point(l)).l,l);
 assert.throws(()=>normalizeObserverPoint(point(0)));
 assert.throws(()=>normalizeObserverPoint(point(6.1)));
 assert.throws(()=>normalizeObserverPoint(point(.03)));
 assert.throws(()=>normalizeObserverPoint(point(2,185,0)));
 assert.throws(()=>normalizeObserverPoint(point(2,0,-92)));
 assert.throws(()=>normalizeObserverPoint(point(Infinity)));
});
test('polar observer coordinates remain finite at north and south poles',()=>{
 for(const lat of [-90,90])for(const lon of [-180,0,123,180]){
  const frame=frameAt(point(3,lon,lat));
  const a=worldDirection([1,0,0],frame);
  eq(Math.abs(a[2]),1,1e-12);
 }
});
test('same physical observer radius yields identical areal distance regardless of direction',()=>{
 const m=metric({a:2,eta:.4}),a=chartObserverPosition(m,point(3,0,0)),
   b=chartObserverPosition(m,point(3,90,60));
 eq(a.radius,b.radius);eq(a.radius,geometry(3*m.a,m).R/m.a);
});
test('both external chart centres remain artificial separate placements',()=>{
 const m=metric({a:1}),a=chartObserverPosition(m,point(2,0,0)),
 b=chartObserverPosition(m,point(-2,0,0));
 eq(a.radius,b.radius);assert.equal(a.chart,'A');assert.equal(b.chart,'B');
 assert.ok(Math.abs(a.xyz[0]-b.xyz[0])>8);
});
test('same angular world direction is recovered across equivalent local frames',()=>{
 const a=frameAt(point(2,5,25)),b=frameAt(point(2,127,-30));
 const dir=worldDirection([.2,.4,.9],a);
 const inSecond=localDirection(dir,b);
 const rebuilt=worldDirection(inSecond,b);
 for(let i=0;i<3;i++)eq(rebuilt[i],dir[i],1e-12);
});
test('positive/negative signed l select inward and outward sky rays consistently',()=>{
 for(const l of [-3,3]){
  const basis=cameraBasis(0,0,Math.sign(l),Math.sign(l));
  const front=pixelDirection(0,0,basis,80,1);
  eq(photonLocalAngle(metric({a:1}),point(l),front),Math.PI,1e-12);
 }
});
test('a direct inward null ray from any A angular coordinate exits in B',()=>{
 const m=metric({a:1,eta:0});
 for(const p of [point(2,0,0),point(3.5,105,30),point(4,-77,-43)]){
  const data=inspectObserverRay(m,p,Math.PI,{maxTime:75,step:.12});
  assert.equal(data.exit,'B');assert.ok(data.resolved);
  assert.equal(data.sourceRegion,'A');assert.ok(data.passes>=1);
  assert.ok(data.impactError<1e-7);
 }
});
test('a direct inward null ray from B returns into exterior A',()=>{
 const m=metric({a:1}),out=inspectObserverRay(m,point(-3,-120,30),Math.PI,{maxTime:75,step:.12});
 assert.equal(out.exit,'A');assert.equal(out.sourceRegion,'B');assert.ok(out.passes>=1);
});
test('same radius, direction and metric always yield same geodesic invariants',()=>{
 const m=metric({a:1.3,eta:.3}),a=inspectObserverRay(m,point(2.8,0,0),2.78),
 b=inspectObserverRay(m,point(2.8,173,70),2.78);
 eq(a.impact,b.impact);eq(a.winding,b.winding,1e-11);
 assert.equal(a.exit,b.exit);
});
test('redshift impacts the physically calculated impact parameter',()=>{
 const theta=2.5,p=point(3.1,0,0);
 const a=inspectObserverRay(metric({a:1,eta:0}),p,theta),
 b=inspectObserverRay(metric({a:1,eta:.6}),p,theta);
 assert.ok(b.impact>a.impact);
});
test('local impact formula agrees with original photon launch H=0',()=>{
 const m=metric({a:1.1,eta:.38});
 for(const angle of [.01,1.2,2.7,Math.PI]){
  const r=inspectObserverRay(m,point(2.5,-45,25),angle,{maxTime:90,step:.09});
  assert.ok(r.impactError<1e-7);
  assert.ok(r.residual<1e-6);
 }
});
test('selecting a live photon transfers its real current 3D position',()=>{
 const m=metric({a:1}),field=newLightField(m,{polar:38,azimuth:88,count:7,cone:24});
 for(let i=0;i<55;i++)advanceLightField(field,m,.045);
 const item=lightFieldSamples(field,m)[4],out=pointFromPhoton(item);
 eq(out.point.l,item.l,1e-9);assert.equal(out.displaced,false);
 const reconstructed=frameAt(out.point).radial;
 for(let k=0;k<3;k++)eq(reconstructed[k],item.current.angles[k],1e-12);
});
test('photon selection crosses to real B chart after wormhole traversal',()=>{
 const m=metric({a:1}),field=newLightField(m,{polar:0,cone:0,count:1});
 for(let i=0;i<120;i++)advanceLightField(field,m,.05);
 const item=lightFieldSamples(field,m)[0],selected=pointFromPhoton(item);
 assert.equal(item.current.region,'B');
 assert.ok(selected.point.l<0);
});
test('photon position beyond allowed local camera is explicitly limited',()=>{
 const m=metric({a:1}),field=newLightField(m,{polar:0,cone:0,count:1});
 for(let i=0;i<300&&!field.done;i++)advanceLightField(field,m,.08);
 const item=lightFieldSamples(field,m)[0],selected=pointFromPhoton(item);
 assert.equal(selected.displaced,true);
 eq(Math.abs(selected.point.l),6,1e-12);
 assert.ok(Math.abs(item.l)>6);
});
test('one bridge record preserves 3D point, FOV and camera look parameters',()=>{
 const r=bridgeSnapshot(point(-2.45,135,-40),{yaw:.7,pitch:-.24,fov:95,quality:'fine'});
 assert.equal(r.point.l,-2.45);assert.equal(r.point.longitude,135);
 eq(r.yaw,.7);eq(r.pitch,-.24);eq(r.fov,95);
 assert.equal(r.quality,'fine');
});
test('bad sampling direction and missing photon are rejected, not fabricated',()=>{
 const m=metric({a:1});
 assert.throws(()=>pointFromPhoton(null));
 assert.throws(()=>worldDirection([0,0,0],frameAt(point())));
 assert.throws(()=>localDirection([NaN,0,1],frameAt(point())));
 assert.throws(()=>inspectObserverRay(m,point(),-1));
 assert.throws(()=>inspectObserverRay(m,point(),4));
});
