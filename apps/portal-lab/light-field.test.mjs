import test from 'node:test';
import assert from 'node:assert/strict';
import {metric,geometry} from './spacetime.js';
import {
 FIELD_DEFAULTS,FIELD_CENTRES,FIELD_ASSUMPTIONS,emissionVector,
 coneDirections,liftRay,chartPoint,newLightField,advanceLightField,
 fieldStatistics,lightFieldSamples,sphereWires,coordinateConsistency
} from './light-field.js';
const eq=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol,'Expected '+a+' ≈ '+b);
test('every arbitrary initial 3D direction has unit norm',()=>{
 for(const polar of [0,15,45,75])for(const azimuth of [0,29,90,180,290,360]){
  const d=emissionVector(polar,azimuth);
  eq(Math.hypot(...d),1,1e-12);eq(d[0],-Math.cos(polar*Math.PI/180),1e-12);
 }
});
test('cone directions include the exact requested central direction',()=>{
 const v=coneDirections({polar:33,azimuth:52,cone:29,count:17});
 const reference=emissionVector(33,52);
 assert.equal(v.length,17);
 for(let i=0;i<3;i++)eq(v[0][i],reference[i],1e-12);
});
test('cone with zero aperture produces 25 copies of exactly one direction',()=>{
 const v=coneDirections({polar:25,azimuth:128,cone:0,count:25});
 for(const d of v)for(let i=0;i<3;i++)eq(d[i],v[0][i],1e-12);
});
test('cone produces genuinely distinct orbital planes for nonzero aperture',()=>{
 const f=newLightField(metric({a:1}),{polar:28,azimuth:40,cone:32,count:17});
 assert.ok(fieldStatistics(f,metric({a:1})).distinctOrbitalPlanes>=10);
});
test('rotated 3D orbit has a constant angular momentum plane',()=>{
 const m=metric({a:1,eta:0}),f=newLightField(m,{polar:35,azimuth:29,cone:37,count:9});
 for(let k=0;k<100;k++)advanceLightField(f,m,.045);
 for(const r of f.rays){
  const normal=[0,-r.tangent[2],r.tangent[1]];
  for(const p of r.ray.path.filter((_,i)=>i%17===0)){
   const xyz=[Math.cos(p.phi),Math.sin(p.phi)*r.tangent[1],Math.sin(p.phi)*r.tangent[2]];
   eq(xyz[0]*normal[0]+xyz[1]*normal[1]+xyz[2]*normal[2],0,1e-12);
   eq(Math.hypot(...xyz),1,1e-12);
  }
 }
});
test('spherical symmetric 3D lift shares Hamiltonian constraint with 2D solver',()=>{
 const m=metric({a:1,eta:.48}),f=newLightField(m,{polar:49,azimuth:111,cone:36,count:13});
 for(let k=0;k<125;k++)advanceLightField(f,m,.045);
 const st=fieldStatistics(f,m);
 assert.ok(st.worstResidual<1e-6,st.worstResidual);
 assert.equal(st.photons,13);
});
test('a radial 3D photon crosses from exterior A to exterior B',()=>{
 const m=metric({a:1}),f=newLightField(m,{polar:0,cone:0,count:1,source:3.1});
 for(let k=0;k<360&&!f.done;k++)advanceLightField(f,m,.065);
 const st=fieldStatistics(f,m);
 assert.equal(st.crossings,1);assert.equal(st.escapedB,1);assert.equal(st.escapedA,0);
 assert.ok(st.worstResidual<1e-8);
});
test('high angular launch angle scatters photon back to A',()=>{
 const m=metric({a:1}),f=newLightField(m,{polar:70,cone:0,count:1,source:3.1});
 for(let k=0;k<380&&!f.done;k++)advanceLightField(f,m,.06);
 const st=fieldStatistics(f,m);
 assert.equal(st.escapedA,1);assert.equal(st.escapedB,0);assert.equal(st.crossings,0);
});
test('rotational symmetry makes azimuth irrelevant to invariant radial outcome',()=>{
 const m=metric({a:1,eta:.23}),f1=newLightField(m,{polar:33,azimuth:0,cone:0,count:1}),
 f2=newLightField(m,{polar:33,azimuth:173,cone:0,count:1});
 for(let k=0;k<120;k++){
  advanceLightField(f1,m,.046);advanceLightField(f2,m,.046);
 }
 eq(f1.rays[0].ray.l,f2.rays[0].ray.l,1e-9);
 eq(f1.rays[0].ray.phi,f2.rays[0].ray.phi,1e-9);
 eq(f1.rays[0].ray.L,f2.rays[0].ray.L,1e-9);
});
test('changing azimuth changes actual 3D trajectory instead of recoloring it',()=>{
 const m=metric({a:1}),f1=newLightField(m,{polar:46,azimuth:0,cone:0,count:1}),
 f2=newLightField(m,{polar:46,azimuth:90,cone:0,count:1});
 for(let k=0;k<65;k++){advanceLightField(f1,m,.05);advanceLightField(f2,m,.05)}
 const c1=lightFieldSamples(f1,m)[0].current.position,c2=lightFieldSamples(f2,m)[0].current.position;
 assert.ok(Math.hypot(...c1.map((v,i)=>v-c2[i]))>.2);
});
test('areal radius in each chart equals actual geometric R(l)',()=>{
 const m=metric({a:2,eta:.6,shape:.13});
 const r=chartPoint(m,3,1.1,[0,Math.cos(.7),Math.sin(.7)]);
 eq(r.radius,geometry(3,m).R/m.a,1e-12);
 for(const [k,c]of [[0,FIELD_CENTRES.A[0]],[1,0],[2,0]]){
  assert.ok(Number.isFinite(r.position[k]));
 }
});
test('A/B coordinate charts are distinct despite shared throat physics',()=>{
 const m=metric({a:1}),t=[0,1,0];
 const A=chartPoint(m,.00001,.8,t),B=chartPoint(m,-.00001,.8,t);
 eq(A.radius,B.radius);
 assert.equal(A.region,'A');assert.equal(B.region,'B');
 assert.ok(Math.abs(A.position[0]-B.position[0])>5);
});
test('crossing joins intrinsically through l=0 while drawing skips chart gap',()=>{
 const m=metric({a:1}),f=newLightField(m,{polar:0,cone:0,count:1});
 for(let k=0;k<150;k++)advanceLightField(f,m,.04);
 const points=lightFieldSamples(f,m)[0].points;
 assert.ok(points.some(p=>p.region==='A')&&points.some(p=>p.region==='B'));
 assert.equal(f.rays[0].ray.crossings,1);
});
test('3D projected rays preserve angular unit length',()=>{
 const m=metric({a:1}),f=newLightField(m,{polar:34,azimuth:250,cone:30,count:7});
 for(let k=0;k<40;k++)advanceLightField(f,m,.05);
 for(const item of coordinateConsistency(f,m)){
  eq(item.unitNorm,1,1e-12);
  assert.ok(Math.abs(item.hamiltonian)<1e-7);
 }
});
test('photon trail sampling includes current endpoint and stays finite',()=>{
 const m=metric({a:1,eta:.12}),f=newLightField(m,{count:25,polar:45,cone:65});
 for(let i=0;i<100;i++)advanceLightField(f,m,.047);
 const data=lightFieldSamples(f,m,{maxPoints:80});
 assert.equal(data.length,25);
 for(const item of data){
  assert.ok(item.points.length>5&&item.points.length<=82);
  assert.ok(item.points.every(p=>p.position.every(Number.isFinite)));
  const last=item.points.at(-1);
  eq(last.position[0],item.current.position[0],1e-8);
 }
});
test('two exterior shells have their own finite spherical wire guides',()=>{
 for(const region of ['A','B']){
  const lines=sphereWires({center:FIELD_CENTRES[region],radius:1,longitudes:8,latitudes:4});
  assert.equal(lines.length,11);
  assert.ok(lines.every(line=>line.length>15&&line.every(v=>v.every(Number.isFinite))));
 }
});
test('null motion independent of visual chart centre separation',()=>{
 const m=metric({a:1,eta:0}),field=newLightField(m,{polar:38,count:1});
 advanceLightField(field,m,.7);
 const r=field.rays[0];
 const a=chartPoint(m,r.ray.l,r.ray.phi,r.tangent,4.7),
       b=chartPoint(m,r.ray.l,r.ray.phi,r.tangent,7.2);
 eq(a.radius,b.radius);eq(a.angles[1],b.angles[1]);eq(b.position[0]-a.position[0],-2.5);
});
test('field stops after asymptotic exit and cannot evolve forever',()=>{
 const m=metric({a:1}),f=newLightField(m,{polar:0,count:1,cone:0});
 for(let i=0;i<420&&!f.done;i++)advanceLightField(f,m,.06);
 assert.equal(f.done,true);
 const t=f.time;advanceLightField(f,m,.5);eq(f.time,t);
});
test('invalid emission settings cannot create silently incorrect photons',()=>{
 const m=metric({a:1});
 assert.throws(()=>emissionVector(91,0));
 assert.throws(()=>emissionVector(30,Infinity));
 assert.throws(()=>coneDirections({count:26}));
 assert.throws(()=>coneDirections({cone:100}));
 assert.throws(()=>newLightField(m,{source:10}));
 const f=newLightField(m);
 assert.throws(()=>advanceLightField(f,m,-1));
 assert.throws(()=>lightFieldSamples(f,m,{maxPoints:2}));
});
test('separate charts and limitations remain explicit in scientific API',()=>{
 assert.ok(FIELD_ASSUMPTIONS.some(x=>x.includes('not a global isometric')));
 assert.ok(FIELD_ASSUMPTIONS.some(x=>x.includes('conserved')));
 eq(FIELD_DEFAULTS.polar,24);
});
