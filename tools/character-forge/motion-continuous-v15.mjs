// Continuous-contact experiment on existing B v14. No new actions.
import {writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {poseFrom,deform,quat,qmul,rotate,animation,rootOffset} from './core.mjs';
import {glb} from './glb.mjs';
import {raster,commonBounds} from './material-study.mjs';
import {normals} from './hybrid-human.mjs';
// Demonstrator output is consumed by a separate, non-authorizing evidence step.
export function continuousStudy({m,ref,native,baseline,author,vertical,sourceSupport,sourceMarks,actual,solveLeg,relaxed,groundY,stride,first,scale,skin,out}){
 const J=n=>m.joints.find(j=>j.name===n),add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0),clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),dist=(a,b)=>Math.hypot(...sub(a,b)),unit=a=>mul(a,1/(Math.hypot(...a)||1)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],inv=q=>[-q[0],-q[1],-q[2],q[3]],angle=(a,b)=>2*Math.acos(clamp(Math.abs(dot(a,b)),0,1))*180/Math.PI;
 const slerp=(a,b,t)=>{let d=dot(a,b);if(d<0){b=mul(b,-1);d=-d}d=clamp(d,-1,1);if(d>.9995)return unit(add(mul(a,1-t),mul(b,t)));const th=Math.acos(d);return unit(add(mul(a,Math.sin((1-t)*th)/Math.sin(th)),mul(b,Math.sin(t*th)/Math.sin(th))))};
 const N=sourceSupport.length-1,active=(phase,s)=>{const t=phase*N,i=Math.min(N,Math.floor(t+1e-9)),u=t-i,k=Math.min(N,i+1);return Math.abs(u)<1e-8?sourceSupport[i][s].active:sourceSupport[i][s].active.filter(x=>sourceSupport[k][s].active.includes(x))};
 const sample=(v,t)=>{const u=t*(v.rotations.length-1),i=Math.floor(u),j=Math.min(i+1,v.rotations.length-1),f=u-i;return {q:v.rotations[i].map((q,k)=>slerp(q,v.rotations[j][k],f)),o:add(mul(v.offsets[i],1-f),mul(v.offsets[j],f))}};
 const median=a=>{a=a.slice().sort((a,b)=>a-b);return (a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2};
 const write=(n,v)=>writeFileSync(join(out,n),v),json=(n,v)=>write(n,JSON.stringify(v,null,2));
 // Track seam contributions before any new repair. The source itself may not
 // be an exact periodic clip; report axial and lateral displacement separately.
 const seam=v=>({rootDelta:sub(v.offsets.at(-1),v.offsets[0]),rootResidualMm:dist(sub(v.offsets.at(-1),v.offsets[0]),[0,0,stride])*1000,maxJointDegrees:Math.max(...v.rotations[0].map((q,k)=>angle(q,v.rotations.at(-1)[k])))});
 const matDiff=(a,b)=>Math.max(...a.map((x,i)=>Math.abs(x-b[i])));
 const sourceSeam={pelvisDelta:sub(ref.frames.at(-1).points.pelvis,ref.frames[0].points.pelvis),worldOrientationMatrixResidual:Math.max(...Object.keys(ref.frames[0].worldMatrices).map(k=>matDiff(ref.frames[0].worldMatrices[k].filter((_,i)=>i<12),ref.frames.at(-1).worldMatrices[k].filter((_,i)=>i<12))))};
 // Same frozen contact classification and horizontal anchors for all densities.
 // Median from v14 B across the measured continuous contact interval.
 const anchors={};for(const s of ['L','R'])for(const k of ['heel','toe']){
  let run=[];const flush=()=>{if(!run.length)return;const pts=run.map(i=>{const a=sample(baseline,i/96);return actual(a.q,a.o,s)[k]});const center=[0,1,2].map(j=>median(pts.map(p=>p[j])));for(const i of run)anchors[i+':'+s+':'+k]=center;run=[]};
  for(let i=0;i<=96;i++){if(active(i/96,s).includes(k))run.push(i);else flush()}flush();
 }
 function correct(q,o,t,base){
  const key=Math.round(t*96);
  for(let pass=0;pass<5;pass++)for(const s of ['L','R']){
   const f=J('foot.'+s),act=active(t,s);
   // A small pitch adjustment only if both ends are actually supported.
   // Select by real deformed sole error and penetration, never ankle height.
   if(pass===0&&act.length===2){
    const a=actual(q,o,s),v=sub(a.toe,a.heel),axis=unit(cross(unit([v[0],0,v[2]]),[0,1,0])),w=poseFrom(m,q),original=q[f.id].slice();
    const cost=()=>{const p=actual(q,o,s);return Math.abs(p.heelMin-p.toeMin)+Math.max(0,Math.min(p.heelMin,p.toeMin)-p.meshMin)*2};
    let best=original,value=cost();
    for(const step of [-.15,-.10,-.05,.05,.10,.15]){q[f.id]=qmul(inv(w[f.parent].q),qmul(quat(axis,step),w[f.id].q));const c=cost()+Math.abs(step)*.005;if(c<value){best=q[f.id];value=c}}
    q[f.id]=best;
   }
   const a=actual(q,o,s),errors=act.map(k=>{const goal=anchors[key+':'+s+':'+k]??actual(base.q,base.o,s)[k];return [goal[0]-a[k][0],groundY-a[k+'Min'],goal[2]-a[k][2]]});
   const d=errors.length?mul(errors.reduce(add,[0,0,0]),1/errors.length):[0,0,0];d[1]=Math.max(d[1],groundY-a.meshMin-.0005);
   if(Math.hypot(...d)<.0003)continue;
   solveLeg(q,s,add(poseFrom(m,q)[f.id].p,d.map(v=>clamp(v,-.035,.035))));
  }
 }
 function generate(count){
  const v={rotations:[],offsets:[]};
  const end=baseline.rotations.at(-1),start=baseline.rotations[0],rootError=sub(sub(baseline.offsets.at(-1),baseline.offsets[0]),[0,0,stride]);
  for(let i=0;i<count;i++){
   const t=i/(count-1),base=sample(baseline,t),q=base.q.map(x=>x.slice()),o=base.o.slice();
   // Symmetric seam repair over 12.5% of the cycle. Correct the base pose
   // as well as correction channels; keep the original path outside the band.
   const distance=Math.min(t,1-t),u=clamp(1-distance/.125,0,1),w=.5*u*u*(3-2*u);
   for(let j=0;j<q.length;j++){const delta=t<.5?qmul(end[j],inv(start[j])):qmul(start[j],inv(end[j]));q[j]=qmul(slerp([0,0,0,1],delta,w),q[j])}
   for(let j=0;j<3;j++)o[j]+=(t<.5?1:-1)*rootError[j]*w;
   correct(q,o,t,base);v.rotations.push(q);v.offsets.push(o);
  }
  return v;
 }
 // v16: cyclic projected contact solve. Use the same frozen contact labels
 // and horizontal anchors as v15, including the troublesome phase 7/24.
 // Endpoints share one periodic state; only the linear travel is added.
 function cyclic(count){
  const v=generate(count),n=count-1,legIds=['L','R'].flatMap(side=>['upperleg01','lowerleg01','foot'].map(name=>J(name+'.'+side).id));
  const base=structuredClone(v),roots=[],trace=[];
  const phaseCost=(q,o,t)=>{
   let violation=0,loss=0;
   for(const side of ['L','R']){
    const a=actual(q,o,side),act=active(t,side);
    const pen=Math.max(0,groundY-a.meshMin);
    violation=Math.max(violation,pen/.003);loss+=(pen/.003)**2;
    for(const k of act){
     const target=anchors[Math.round(t*96)+':'+side+':'+k]??a[k],y=Math.abs(a[k+'Min']-groundY),h=Math.hypot(a[k][0]-target[0],a[k][2]-target[2]);
     violation=Math.max(violation,y/.010,h/.005);loss+=(y/.010)**2+(h/.005)**2;
    }
   }
   return {violation,loss};
  };
  const endpoint=(q,o)=>{
   const a=phaseCost(q,o,0),b=phaseCost(q,add(o,[0,0,stride]),1);
   return {violation:Math.max(a.violation,b.violation),loss:a.loss+b.loss};
  };
  const score=(c,reg=0)=>c.violation*4+c.loss+reg;
  const closure=()=>{
   v.rotations[n]=v.rotations[0].map(q=>q.slice());
   v.offsets[n]=add(v.offsets[0],[0,0,stride]);
  };
  v.rotations[0]=v.rotations[0].map((q,k)=>slerp(q,v.rotations[n][k],.5));
  v.offsets[0]=mul(add(v.offsets[0],sub(v.offsets[n],[0,0,stride])),.5);closure();
  for(let sweep=0;sweep<3;sweep++){
   const prev=structuredClone(v);
   for(let i=0;i<n;i++){
    const t=i/n,source=sample(baseline,t),left=(i+n-1)%n,right=(i+1)%n;
    const q0=prev.rotations[i].map(x=>x.slice()),o0=prev.offsets[i].slice();
    const weight=Math.min(i,n-i)<Math.ceil(n*.125)?.30:.10;
    for(const id of legIds)q0[id]=slerp(q0[id],slerp(prev.rotations[left][id],prev.rotations[right][id],.5),weight);
    const nearY=(prev.offsets[left][1]+prev.offsets[right][1])/2;
    o0[1]=o0[1]*(1-weight)+nearY*weight;
    let best={q:prev.rotations[i],o:prev.offsets[i]},cost=Infinity;
    function consider(q,o){
     const c=i===0?endpoint(q,o):phaseCost(q,o,t);
     const smooth=legIds.reduce((s,id)=>s+(angle(q[id],prev.rotations[left][id])**2+angle(q[id],prev.rotations[right][id])**2),0)*.0002;
     const vscore=score(c,smooth+Math.abs(o[1]-base.offsets[i][1])*8);
     if(vscore<cost){cost=vscore;best={q:q.map(x=>x.slice()),o:o.slice()}}
    }
    consider(best.q,best.o);
    // Search bounded pelvis height, then project both legs against real soles.
    for(const dy of [0,-.008,.008,-.018,.018]){
     const q=q0.map(x=>x.slice()),o=o0.slice();o[1]=clamp(o[1]+dy,base.offsets[i][1]-.045,base.offsets[i][1]+.045);
     correct(q,o,t,source);consider(q,o);
     if(i===0){
      const qEnd=q0.map(x=>x.slice()),endO=add(o,[0,0,stride]);correct(qEnd,endO,1,sample(baseline,1));
      consider(qEnd,o);consider(q.map((x,k)=>slerp(x,qEnd[k],.5)),o);
     }
    }
    v.rotations[i]=best.q;v.offsets[i]=best.o;
   }
   closure();trace.push({sweep,endpoint:endpoint(v.rotations[0],v.offsets[0])});
  }
  const velocitySeam={rootMmPerSecond:dist(sub(v.offsets[1],v.offsets[0]),sub(v.offsets[n],v.offsets[n-1]))*n/ref.durationSeconds*1000,
   maxJointAngularSpeedDifferenceDegreesPerSecond:Math.max(...v.rotations[0].map((q,k)=>Math.abs(angle(q,v.rotations[1][k])-angle(v.rotations[n-1][k],q))*n/ref.durationSeconds))};
  return {...v,trace,velocitySeam};
 }
 // Match actual upper-arm and forearm segment directions from KinemIQ.
 // Do not touch pelvis or leg channels. Keep source wrist orientation via
 // the pre-existing full-frame retarget, then retain relaxed finger motion.
 function upperStudy(v){
  const n=v.rotations.length-1,copy=structuredClone(v),rows=[];
  const armMap=['L','R'].flatMap(s=>[
   ['clavicle.'+s,'upperarm01.'+s,'clavicle.'+s,'upperarm.'+s],
   ['upperarm01.'+s,'lowerarm01.'+s,'upperarm.'+s,'lowerarm.'+s],
   ['lowerarm01.'+s,'wrist.'+s,'lowerarm.'+s,'hand.'+s]]);
  const sourcePoint=(t,name)=>{const f=t*N,i=Math.floor(f),j=Math.min(N,i+1),u=f-i;return add(mul(ref.frames[i].points[name],1-u),mul(ref.frames[j].points[name],u))};
  const swing=(a,b)=>{const d=clamp(dot(a,b),-1,1);return d<-.99999?quat(unit(cross(a,Math.abs(a[1])>.9?[1,0,0]:[0,1,0])),Math.PI):unit([...cross(a,b),1+d])};
  const direction=(w,a,b)=>unit(sub(w[J(b).id].p,w[J(a).id].p));
  const dirError=(a,b)=>Math.acos(clamp(dot(a,b),-1,1))*180/Math.PI;
  for(let i=0;i<n;i++){
   const t=i/n,q=copy.rotations[i],before=poseFrom(m,q),source=sample(author,t),srcW=poseFrom(m,source.q);
   for(const [a,b,c,d] of armMap){
    const j=J(a),w=poseFrom(m,q),target=unit(sub(sourcePoint(t,d),sourcePoint(t,c))),current=direction(w,a,b);
    const delta=swing(current,target),a0=angle([0,0,0,1],delta);
    const limited=slerp([0,0,0,1],delta,Math.min(1,20/Math.max(1e-8,a0)));
    q[j.id]=qmul(inv(w[j.parent].q),qmul(limited,w[j.id].q));
   }
   for(const side of ['L','R']){
    const j=J('wrist.'+side),w=poseFrom(m,q);
    q[j.id]=qmul(inv(w[j.parent].q),srcW[j.id].q);
   }
   // Blend upper correction down near the seam to preserve the cyclic solve.
   const u=clamp(Math.min(t,1-t)/.083333,0,1),blend=u*u*(3-2*u);
   for(const id of [...armMap.map(a=>J(a[0]).id),...['L','R'].map(s=>J('wrist.'+s).id)])q[id]=slerp(v.rotations[i][id],q[id],blend);
   const after=poseFrom(m,q);
   rows.push({phase:t,segments:armMap.map(([a,b,c,d])=>{const target=unit(sub(sourcePoint(t,d),sourcePoint(t,c)));return {joint:a,beforeDegrees:dirError(direction(before,a,b),target),afterDegrees:dirError(direction(after,a,b),target)}})});
  }
  copy.rotations[n]=copy.rotations[0].map(q=>q.slice());
  const legIds=['L','R'].flatMap(s=>['upperleg01','lowerleg01','foot'].map(k=>J(k+'.'+s).id));
  const changedLegChannels=copy.rotations.some((q,i)=>legIds.some(k=>angle(q[k],v.rotations[i][k])>.001));
  if(changedLegChannels)throw Error('Upper-body study changed leg channels');
  const mean=(field)=>rows.flatMap(r=>r.segments).reduce((s,r)=>s+r[field],0)/rows.flatMap(r=>r.segments).length;
  return {v:copy,report:{rows,beforeMeanDegrees:mean('beforeDegrees'),afterMeanDegrees:mean('afterDegrees'),changedLegChannels}};
 }
 // Signed angular velocity vector, not merely difference of speed magnitudes.
 const qlog=q=>{q=unit(q);if(q[3]<0)q=mul(q,-1);const l=Math.hypot(...q.slice(0,3));return l<1e-10?[0,0,0]:mul(q.slice(0,3),2*Math.atan2(l,q[3])/l)};
 const qexp=v=>{const l=Math.hypot(...v);return l<1e-10?[0,0,0,1]:quat(mul(v,1/l),l)};
 const qdelta=(a,b)=>qlog(qmul(inv(a),b));
 function seamVelocity(v){
  const n=v.rotations.length-1,dt=ref.durationSeconds/n,rootIncoming=mul(sub(v.offsets[n],v.offsets[n-1]),1/dt),rootOutgoing=mul(sub(v.offsets[1],v.offsets[0]),1/dt);
  const joints=v.rotations[0].map((q,i)=>{
   // Both tangents expressed at the seam orientation in its local frame.
   const incoming=mul(qdelta(v.rotations[n][i],v.rotations[n-1][i]),-1/dt),outgoing=mul(qdelta(q,v.rotations[1][i]),1/dt);
   return {name:m.joints[i].name,incoming,outgoing,vectorDifferenceDegPerSecond:dist(incoming,outgoing)*180/Math.PI,speedMagnitudeDifferenceDegPerSecond:Math.abs(Math.hypot(...incoming)-Math.hypot(...outgoing))*180/Math.PI};
  });
  return {rootIncoming,rootOutgoing,rootMmPerSecond:dist(rootIncoming,rootOutgoing)*1000,maxJointVectorDegreesPerSecond:Math.max(...joints.map(j=>j.vectorDifferenceDegPerSecond)),maxJointSpeedMagnitudeDegreesPerSecond:Math.max(...joints.map(j=>j.speedMagnitudeDifferenceDegPerSecond)),joints};
 }
 function velocityRegularize(base,strength){
  const v=structuredClone(base),n=v.rotations.length-1,band=4;
  const o=v.offsets[0],end=v.offsets[n],incoming=sub(end,v.offsets[n-1]),outgoing=sub(v.offsets[1],o),mean=mul(add(incoming,outgoing),.5);
  const rightRoot=sub(mean,outgoing),leftRoot=sub(incoming,mean);
  const right=[],left=[];
  for(let j=0;j<v.rotations[0].length;j++){
   const q=v.rotations[0][j],qe=v.rotations[n][j],inc=mul(qdelta(qe,v.rotations[n-1][j]),-1),out=qdelta(q,v.rotations[1][j]),avg=mul(add(inc,out),.5);
   right.push(sub(avg,out));left.push(sub(inc,avg));
  }
  // Cubic taper over the first/last four keys, preserving endpoint and stride.
  for(let k=1;k<=band;k++){
   const u=(k-1)/band,f=strength*(1-u)*(1-u)*(1+2*u);
   v.offsets[k]=add(v.offsets[k],mul(rightRoot,f));v.offsets[n-k]=add(v.offsets[n-k],mul(leftRoot,f));
   for(let j=0;j<right.length;j++){
    const q=v.rotations[0][j],qe=v.rotations[n][j];
    v.rotations[k][j]=qmul(q,qexp(add(qdelta(q,v.rotations[k][j]),mul(right[j],f))));
    v.rotations[n-k][j]=qmul(qe,qexp(add(qdelta(qe,v.rotations[n-k][j]),mul(left[j],f))));
   }
   const tr=k/n,tl=(n-k)/n,passes=strength===.25?2:1;for(let pass=0;pass<passes;pass++){correct(v.rotations[k],v.offsets[k],tr,sample(base,tr));correct(v.rotations[n-k],v.offsets[n-k],tl,sample(base,tl));}
  }
  v.trace=undefined;v.velocitySeam=seamVelocity(v);return v;
 }
 function elbowStudy(base){
  const v=structuredClone(base),n=v.rotations.length-1,rows=[];
  const sourcePoint=(t,name)=>{const f=t*N,i=Math.floor(f),j=Math.min(N,i+1),u=f-i;return add(mul(ref.frames[i].points[name],1-u),mul(ref.frames[j].points[name],u))};
  const flex=(a,b)=>Math.acos(clamp(dot(unit(a),unit(b)),-1,1))*180/Math.PI;
  for(let i=0;i<n;i++){
   const t=i/n,q=v.rotations[i],items=[];
   for(const side of ['L','R']){
    const shoulder=J('upperarm01.'+side),elbow=J('lowerarm01.'+side),wrist=J('wrist.'+side),w=poseFrom(m,q);
    const up=sub(w[elbow.id].p,w[shoulder.id].p),lo=sub(w[wrist.id].p,w[elbow.id].p),srcUp=sub(sourcePoint(t,'lowerarm.'+side),sourcePoint(t,'upperarm.'+side)),srcLo=sub(sourcePoint(t,'hand.'+side),sourcePoint(t,'lowerarm.'+side));
    const target=flex(srcUp,srcLo),before=flex(up,lo),axis=cross(unit(up),unit(lo));
    // Do not correct already matching elbow angles. Isolate wrist neutralization
    // as an artistic alternative, not a source-exact correction.
    if(Math.hypot(...axis)>1e-5&&Math.abs(before-target)>2){
     const d=clamp((target-before)*Math.PI/180,-.22,.22);
     q[elbow.id]=qmul(inv(w[elbow.parent].q),qmul(quat(unit(axis),d),w[elbow.id].q));
    }
    const wristBefore=angle(q[wrist.id],[0,0,0,1]);
    q[wrist.id]=slerp(q[wrist.id],[0,0,0,1],.3);
    const a=poseFrom(m,q),after=flex(sub(a[elbow.id].p,a[shoulder.id].p),sub(a[wrist.id].p,a[elbow.id].p));
    items.push({side,sourceElbowFlexDeg:target,beforeElbowFlexDeg:before,afterElbowFlexDeg:after,wristLocalBeforeDeg:wristBefore,wristLocalAfterDeg:angle(q[wrist.id],[0,0,0,1]),sourceArmSwing:sub(sourcePoint(t,'hand.'+side),sourcePoint(t,'upperarm.'+side)),targetArmSwing:sub(a[wrist.id].p,a[shoulder.id].p)});
   }
   rows.push({phase:t,items});
  }
  v.rotations[n]=v.rotations[0].map(q=>q.slice());v.trace=undefined;
  const legs=['L','R'].flatMap(side=>['upperleg01','lowerleg01','foot'].map(name=>J(name+'.'+side).id));
  if(v.rotations.some((q,i)=>legs.some(j=>dist(q[j],base.rotations[i][j])>1e-8)))throw Error('Elbow study modified accepted leg channels');
  return {v,report:{rows,legChannelsUnchanged:true}};
 }
 function readGLB(bin){
  const len=bin.readUInt32LE(12),d=JSON.parse(bin.subarray(20,20+len)),offset=28+len,clip=d.animations.find(a=>a.name==='walk');
  const acc=id=>{const a=d.accessors[id],view=d.bufferViews[a.bufferView],n=a.type==='SCALAR'?1:a.type==='VEC3'?3:4,base=offset+(view.byteOffset??0)+(a.byteOffset??0);return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,j)=>bin.readFloatLE(base+i*(view.byteStride??n*4)+4*j)))};
  const rot=Array.from({length:acc(clip.samplers[0].input).length},()=>[]),root=m.joints.find(j=>j.parent<0);let offsets,times;
  for(const c of clip.channels){const s=clip.samplers[c.sampler],v=acc(s.output);times=acc(s.input).flat();if(c.target.path==='rotation')for(let i=0;i<v.length;i++)rot[i][c.target.node]=v[i];if(c.target.node===root.id&&c.target.path==='translation')offsets=v.map(p=>sub(p,root.local))}
  if(!offsets||rot.some(q=>q.length!==m.joints.length))throw Error('Invalid exported tracks');
  return {rotations:rot,offsets,times};
 }
 function audit(bin,model){
  const v=readGLB(bin),n=384,rows=[],last={},max={drift:0,vertical:0,penetration:0,nativeVertexLandmarkError:0},counts={active:0,keyActive:0};let maxRate=0,prev=null;
  for(let i=0;i<=n;i++){
   const t=i/n,{q,o}=sample(v,t),q2=animation(model,'walk',t),o2=rootOffset(model,'walk',t),feet={};
   for(const s of ['L','R']){const a=actual(q,o,s),b=actual(q2,o2,s),act=active(t,s),cs={};max.nativeVertexLandmarkError=Math.max(max.nativeVertexLandmarkError,dist(a.heel,b.heel)*1000,dist(a.toe,b.toe)*1000,Math.abs(a.meshMin-b.meshMin)*1000);max.penetration=Math.max(max.penetration,(groundY-a.meshMin)*1000);
    for(const k of ['heel','toe']){const id=s+k;if(act.includes(k)){last[id]??=a[k].slice();const drift=Math.hypot(a[k][0]-last[id][0],a[k][2]-last[id][2])*1000,vertical=Math.abs(a[k+'Min']-groundY)*1000;max.drift=Math.max(max.drift,drift);max.vertical=Math.max(max.vertical,vertical);counts.active++;if(i%16===0)counts.keyActive++;cs[k]={drift,vertical}}else delete last[id]}feet[s]={...a,active:act,contacts:cs}}
   if(prev)maxRate=Math.max(maxRate,dist(o,prev)*n/ref.durationSeconds);prev=o;rows.push({phase:t,offset:o,feet});
  }
  const loop=seam(v),gate=max.drift<=10&&max.vertical<=10&&max.penetration<=3&&loop.rootResidualMm<=10&&loop.maxJointDegrees<=10&&max.nativeVertexLandmarkError<.1;
  return {keyCount:v.rotations.length,additionalAuditSamples:n+1,counts,max,loop,velocity:seamVelocity(v),maxRootSpeedMetresPerSecond:maxRate,gate,rows};
 }
 const models={},reports={};
 const variants=[25,49,97,'cyclic49','cyclic97','cyclic49Upper','velocity49quarter','velocity49half','velocity49','elbow49'];
 const cyclicDiagnostics={};let cyclic49,upperReport,elbowReport;
 for(const count of variants){
  let v;
  if(count==='velocity49quarter'||count==='velocity49half'||count==='velocity49')v=velocityRegularize(cyclic49,count==='velocity49quarter'?.25:count==='velocity49half'?.5:1);
  else if(count==='elbow49'){const e=elbowStudy(cyclic49);v=e.v;elbowReport=e.report;}
  else if(count==='cyclic49Upper'){const upper=upperStudy(cyclic49);v=upper.v;upperReport=upper.report;}
  else v=String(count).startsWith('cyclic')?cyclic(Number(String(count).slice(6))):generate(count);
  if(count==='cyclic49')cyclic49=structuredClone(v);
  const c=structuredClone(m);
  if(v.trace)cyclicDiagnostics[count]={trace:v.trace,velocitySeam:v.velocitySeam};c.sampledWalk={rotations:v.rotations.map(relaxed),offsets:v.offsets};c.spec.actions=['walk'];c.spec.walkDuration=ref.durationSeconds;c.spec.motionRevision='v9';
  const bin=glb(c);write('v15-walk-'+count+'.glb',bin);json('v15-walk-'+count+'-spec.json',{spec:c.spec,sampledWalk:c.sampledWalk});reports[count]=audit(bin,c);models[count]=c;
 }
 const accepted=reports.cyclic49;
 // Preserve exact source model for independent demonstrator construction.
 json('v21-cyclic49-source-model.json',models.cyclic49);
 const noRegression=r=>r.gate&&['drift','vertical','penetration'].every(k=>r.max[k]<=accepted.max[k]+1e-6)&&r.loop.maxJointDegrees<=accepted.loop.maxJointDegrees+1e-6;
 const velocityImproved=r=>r.velocity.rootMmPerSecond<accepted.velocity.rootMmPerSecond&&r.velocity.maxJointVectorDegreesPerSecond<accepted.velocity.maxJointVectorDegreesPerSecond;
 const ranked=['velocity49quarter','velocity49half','velocity49'].filter(k=>noRegression(reports[k])&&velocityImproved(reports[k])).sort((a,b)=>reports[a].velocity.rootMmPerSecond+reports[a].velocity.maxJointVectorDegreesPerSecond-reports[b].velocity.rootMmPerSecond-reports[b].velocity.maxJointVectorDegreesPerSecond);
 const choose=ranked[0]??'cyclic49';
 const productionSelection={baseline:'cyclic49',selected:choose,baselineGate:accepted.gate,velocityCandidates:Object.fromEntries(['velocity49quarter','velocity49half','velocity49'].map(k=>[k,{noRegression:noRegression(reports[k]),velocityImproved:velocityImproved(reports[k])}])),artApproved:false};
 const selected=models[choose];
 // Same camera for all densities, separate neutral anatomy and dressed.
 function frame(model,t,cycle=0,bodyOnly=false){const q=animation(model,'walk',t),o=add(rootOffset(model,'walk',t),[0,0,cycle*stride]),w=poseFrom(model,q).map(b=>({...b,p:add(b.p,o)}));const parts=(bodyOnly?skin.parts:model.parts).map(p=>{const x=structuredClone(p);x.positions=deform(model,p,w).flat();normals(x);return x});return {parts}}
 const sameRig=skin.joints.length===m.joints.length&&skin.joints.every((j,i)=>j.name===m.joints[i].name&&dist(j.position,m.joints[i].position)<1e-6),renders={};
 for(const c of Object.keys(models))renders[c]=Array.from({length:25},(_,i)=>frame(models[c],i/24));
 renders.Original=native.map(row=>({parts:row.parts.map(p=>{const x={...p,positions:p.positions.map((v,k)=>k%3===2?(v-first[2])*scale:v*scale)};normals(x);return x})}));
 const displayNames=['Original','cyclic49','cyclic97','velocity49quarter','velocity49half','elbow49'],displayRenders=Object.fromEntries(Object.entries(renders).filter(([name])=>displayNames.includes(name)));
 for(const view of ['front','side']){
  const bounds=commonBounds(Object.values(displayRenders).flat(),view);
  for(const [name,frames] of Object.entries(displayRenders)){const dir='v15-walk-'+name+'-'+view;mkdirSync(join(out,dir),{recursive:true});for(let i=0;i<frames.length;i++)write(dir+'/'+String(i).padStart(2,'0')+'.png',raster(frames[i],{view,bounds,size:512,mode:'B',groundLine:true}).png)}
  const loops=Array.from({length:73},(_,i)=>frame(selected,(i%24)/24,Math.floor(i/24))),dir='v15-loop-'+view;mkdirSync(join(out,dir),{recursive:true});const loopBounds=commonBounds(loops,view);for(let i=0;i<loops.length;i++)write(dir+'/'+String(i).padStart(2,'0')+'.png',raster(loops[i],{view,bounds:loopBounds,size:512,mode:'B',groundLine:true}).png);
  const loopLabels=[...new Set(['cyclic49','velocity49quarter',choose,'elbow49'])].filter(label=>models[label]);
  for(const label of loopLabels){
   const loopFrames=Array.from({length:73},(_,i)=>frame(models[label],(i%24)/24,Math.floor(i/24))),loopDir='v17-loop-'+label+'-'+view;mkdirSync(join(out,loopDir),{recursive:true});const lb=commonBounds(loopFrames,view);for(let i=0;i<loopFrames.length;i++)write(loopDir+'/'+String(i).padStart(2,'0')+'.png',raster(loopFrames[i],{view,bounds:lb,size:512,mode:'B',groundLine:true}).png);
   if(sameRig&&loopLabels.includes(label)){const bodyFrames=Array.from({length:25},(_,i)=>frame(models[label],i/24,0,true)),dir='v17-anatomy-'+label+'-'+view;mkdirSync(join(out,dir),{recursive:true});for(let i=0;i<bodyFrames.length;i++)write(dir+'/'+String(i).padStart(2,'0')+'.png',raster(bodyFrames[i],{view,bounds,size:512,mode:'B',groundLine:true}).png)}
  }
  if(sameRig){const rows=Array.from({length:25},(_,i)=>frame(selected,i/24,0,true)),dir='v15-anatomy-'+view;mkdirSync(join(out,dir),{recursive:true});for(let i=0;i<rows.length;i++)write(dir+'/'+String(i).padStart(2,'0')+'.png',raster(rows[i],{view,bounds,size:512,mode:'B',groundLine:true}).png)}
 }
 const phaseAudit=[];
 for(let i=Math.max(0,Math.floor(N*7/24)-2);i<=Math.min(N,Math.ceil(N*7/24)+2);i++){
  const current=sourceMarks[i].L.toe,previous=sourceMarks[Math.max(0,i-1)].L.toe,next=sourceMarks[Math.min(N,i+1)].L.toe;
  phaseAudit.push({phase:i/N,sourceToe:current,sourceHeel:sourceMarks[i].L.heel,sourceToeSpeed:dist(next,previous)/((Math.min(N,i+1)-Math.max(0,i-1))*ref.durationSeconds/N),classification:sourceSupport[i].L});
 }
 json('v17-motion-diagnostics.json',{productionSelection,elbowReport,comparison:Object.fromEntries(Object.entries(reports).map(([k,r])=>[k,{max:r.max,loop:r.loop,velocity:r.velocity,gate:r.gate}]))});
 json('v16-motion-diagnostics.json',{phaseAudit,cyclicDiagnostics,upperReport,classificationChanged:false,selected:choose,comparison:Object.fromEntries(Object.entries(reports).map(([k,r])=>[k,{max:r.max,loop:r.loop,gate:r.gate,phase29:r.rows[112]}]))});
 json('v15-continuous-report.json',{sourceSeam,retargetSeam:seam(author),verticalSeam:seam(vertical),baselineSeam:seam(baseline),reports,selected:choose,sourceRigMatches:sameRig,groundY,stride,duration:ref.durationSeconds,qualification:{contactGate:reports[choose].gate&&accepted.gate,artApproved:false},limits:['Uniform 25/49/97 keys solve the same constraints; 385 exact exported interpolated samples each.','Seam blend and correction measured independently. Actual loop frames reset clip plus accumulated intended stride.','Native comparison of deformed landmark points and minimum actual sole vertex; independent Blender evaluation separate.']});
 console.log(JSON.stringify({selected:choose,reports:Object.fromEntries(Object.entries(reports).map(([k,v])=>[k,{max:v.max,loop:v.loop,gate:v.gate}]))}));
}
