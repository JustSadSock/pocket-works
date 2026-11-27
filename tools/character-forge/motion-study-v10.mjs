// Short matched reference/author/hybrid study on the existing rig.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {animation,pose,poseFrom,deform,quat,qmul,rotate,rootOffset,solveFootPath} from './core.mjs';
import {blendFrames} from './motion.mjs';
import {normals} from './hybrid-human.mjs';
import {raster,commonBounds,profiles,materialMaps} from './material-study.mjs';
import {glb} from './glb.mjs';
const out=process.env.CHARACTER_EVIDENCE,read=n=>JSON.parse(readFileSync(join(out,n))),write=(n,v)=>writeFileSync(join(out,n),v),m=read('morph/v9-artisan.model.json'),ref=read('v10-reference-trajectory.json');
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/(Math.hypot(...a)||1)),inv=q=>[-q[0],-q[1],-q[2],q[3]],clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const J=n=>{const j=m.joints.find(x=>x.name===n);if(!j)throw Error('Missing target '+n);return j};
const up=[0,1,0],side=unit(sub(ref.rest['thigh.L'],ref.rest['thigh.R'])),forward=unit(cross(side,up)),sourceSide=unit(cross(up,forward)),basis=v=>[dot(v,sourceSide),dot(v,up),dot(v,forward)];
const swing=(a,b)=>{a=unit(a);b=unit(b);const d=clamp(dot(a,b),-1,1),c=cross(a,b);if(d<-.99999)return quat(unit(cross(a,Math.abs(a[1])>.9?[1,0,0]:up)),Math.PI);const q=[...c,1+d],n=Math.hypot(...q)||1;return q.map(v=>v/n)};
const pairs=[['spine03','spine02','pelvis','spine01'],['spine02','spine01','spine01','spine03'],['spine01','neck01','spine03','neck'],['neck01','head','neck','head']];
for(const side of ['L','R'])for(const [a,b,c,d] of [['upperarm01','lowerarm01','upperarm','lowerarm'],['lowerarm01','wrist','lowerarm','hand'],['upperleg01','lowerleg01','thigh','calf'],['lowerleg01','foot','calf','foot']])pairs.push([a+'.'+side,b+'.'+side,c+'.'+side,d+'.'+side]);
for(const side of ['L','R'])pairs.push(['foot.'+side,'toe3-1.'+side,'foot.'+side,'ball.'+side]);
const targets=new Map(pairs.map(([a,b,c,d])=>[J(a).id,{a:J(a),b:J(b),c,d}]));
// Align cycle start to leading left foot without changing the source samples.
const index=0,N=24; // No modulo wrap or resampling beyond the source clip endpoint.
const aFrames=[],bFrames=[],cFrames=[],aOffsets=[],bOffsets=[],cOffsets=[],rows=[];
const H= m.spec.morphology.height??1.7,scale=H/1.7,first=ref.frames[0].points.pelvis,travel=basis(sub(ref.frames[N].points.pelvis,first)),native=read('v11-native-mesh-frames.json');
const yaw=(points,a,b)=>{const v=basis(sub(points[a],points[b]));return Math.atan2(-v[2],v[0])};
for(let i=0;i<=N;i++){
 const phase=i/N,src=ref.frames[i].points,A=animation(m,'walk',phase),B=A.map(q=>q.slice()),world=[];
 for(const j of m.joints){const parent=j.parent<0?[0,0,0,1]:world[j.parent],t=targets.get(j.id);if(j.name==='root'){B[j.id]=quat([0,1,0],yaw(src,'thigh.L','thigh.R')-yaw(ref.rest,'thigh.L','thigh.R'));}else if(t){const desired=basis(sub(src[t.d],src[t.c]));if(Math.hypot(...desired)>1e-5)B[j.id]=qmul(inv(parent),swing(sub(t.b.position,t.a.position),desired));}world[j.id]=qmul(parent,B[j.id])}
 const ao=rootOffset(m,'walk',phase),delta=mul(sub(basis(sub(src.pelvis,first)),mul(travel,phase)),scale),bo=[delta[0],ao[1]+delta[1],ao[2]+delta[2]],mixed=blendFrames(A,B,.65),co=[delta[0]*.35,ao[1]+delta[1]*.35,ao[2]],C=solveFootPath(m,mixed,phase,co).rotations;
 aFrames.push(A);bFrames.push(B);cFrames.push(C);aOffsets.push(ao);bOffsets.push(bo);cOffsets.push(co);
}
const maps=Object.fromEntries(Object.keys(profiles).map(k=>[k,materialMaps(k,128)])),sets={A:{rotations:aFrames,offsets:aOffsets},B:{rotations:bFrames,offsets:bOffsets},C:{rotations:cFrames,offsets:cOffsets}},rendered={};
for(const [key,clip] of Object.entries(sets)){
 const candidate=structuredClone(m);candidate.sampledWalk=clip;candidate.spec.actions=['idle','walk'];candidate.spec.motionRevision='v9';candidate.spec.walkDuration=ref.durationSeconds;write('v10-walk-'+key+'.glb',glb(candidate));write('v10-walk-'+key+'-spec.json',JSON.stringify({spec:candidate.spec,sampledWalk:clip},null,2));
 const models=[],samples=[];
 for(let i=0;i<=N;i++){const phase=i/N,w=pose(candidate,'walk',phase),q=structuredClone(candidate);for(let j=0;j<q.parts.length;j++){q.parts[j].positions=deform(candidate,candidate.parts[j],w).flat();normals(q.parts[j])}models.push(q);
  const pelvis=m.joints.find(j=>j.name==='pelvis')??J('root'),hip=w[pelvis.id].p,shoulders=sub(w[J('upperarm01.L').id].p,w[J('upperarm01.R').id].p),knees=['L','R'].map(s=>{const a=w[J('upperleg01.'+s).id].p,b=w[J('lowerleg01.'+s).id].p,c=w[J('foot.'+s).id].p;return 180-Math.acos(clamp(dot(unit(sub(a,b)),unit(sub(c,b))),-1,1))*180/Math.PI});
  const feet=candidate.contacts.map(c=>{const j=candidate.joints[c.joint],point=add(w[j.id].p,rotate(w[j.id].q,c.local)),local=(phase+c.phase)%1,expected=add(add(j.position,c.local),[0,0,candidate.spec.gaitStride*(phase-local)]);return {side:j.name,stance:local<candidate.spec.gaitDuty,height:point[1]-c.groundY,drift:Math.hypot(point[0]-expected[0],point[2]-expected[2])}});
  const hips=sub(w[J('upperleg01.L').id].p,w[J('upperleg01.R').id].p),wrists=['L','R'].map(s=>w[J('wrist.'+s).id].p),footPitch=['L','R'].map(s=>{const v=sub(w[J('toe3-1.'+s).id].p,w[J('foot.'+s).id].p);return Math.atan2(v[1],v[2])});samples.push({phase,pelvis:hip,head:w[J('head').id].p,pelvisYaw:Math.atan2(hips[2],hips[0]),shoulderYaw:Math.atan2(shoulders[2],shoulders[0]),knees,wrists,footPitch,feet});
 }
 rendered[key]=models;rows.push({candidate:key,samples,cycleMaxQuaternionMismatch:Math.max(...clip.rotations[0].map((q,i)=>1-Math.abs(dot(q,clip.rotations.at(-1)[i])))),maxStanceDrift:Math.max(...samples.flatMap(s=>s.feet.filter(f=>f.stance).map(f=>f.drift)))});
}
// Keep the unmodified native clip, and also compare with a clearly marked
// common-travel presentation. No source rotation or local limb pose is changed.
const original=native.map(row=>({spec:{style:'anatomical-realism'},parts:row.parts.map(p=>{const q={...p};normals(q);return q})}));
const nativeStart=first[2],nativeTravel=ref.frames[N].points.pelvis[2]-nativeStart,sharedStride=m.spec.gaitStride;
rendered.Original=original.map((q,i)=>({...q,parts:q.parts.map(p=>({...p,positions:p.positions.map((v,k)=>k%3===2?v-nativeStart-nativeTravel*i/N+sharedStride*i/N:v)}))}));
for(const view of ['side','three-quarter']){
 const bounds=commonBounds(Object.values(rendered).flat(),view);
 for(const [key,models] of Object.entries(rendered)){const dir='v10-walk-'+key+'-'+view;mkdirSync(join(out,dir),{recursive:true});for(let i=0;i<models.length;i++)write(dir+'/'+String(i).padStart(2,'0')+'.png',raster(models[i],{view,bounds,size:512,mode:'C',maps,groundLine:true}).png)}
}
const rawBounds=commonBounds(original,'side');mkdirSync(join(out,'v11-original-native-side'),{recursive:true});for(let i=0;i<original.length;i++)write('v11-original-native-side/'+String(i).padStart(2,'0')+'.png',raster(original[i],{view:'side',bounds:rawBounds,size:512,mode:'B',groundLine:true}).png);
write('v10-walk-comparison.json',JSON.stringify({source:ref.source,sourceDuration:ref.durationSeconds,phaseAlignment:index/24,commonTravelMetres:m.spec.gaitStride,nativeTravelMetres:nativeTravel,variants:rows,limitations:['B is segment-direction adaptation, not full axial twist reproduction; unmapped finger and helper bones retain Author rotations.','Matched presentation removes only the source linear forward root travel and uses the Author stride; the separate native GLB/video preserve the original displacement and timing.','C uses the existing foot-path solver; actual visual approval remains required.','No running, marching or combat animation is generated.']},null,2));
