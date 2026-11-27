// Reference fidelity on the existing Character Core. Only one artisan and
// one source clip; no new actions, atlas production or renderer changes.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {animation,poseFrom,pose,deform,quat,qmul,rotate} from './core.mjs';
import {normals,weights} from './hybrid-human.mjs';
import {raster,commonBounds} from './material-study.mjs';
import {glb} from './glb.mjs';
const out=process.env.CHARACTER_EVIDENCE,read=n=>JSON.parse(readFileSync(join(out,n))),write=(n,v)=>writeFileSync(join(out,n),v),json=(n,v)=>write(n,JSON.stringify(v,null,2));
const m=read('morph/v9-artisan.model.json'),ref=read('v10-reference-trajectory.json'),native=read('v11-native-mesh-frames.json'),N=ref.frames.length-1,dt=ref.durationSeconds/N;
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/(Math.hypot(...a)||1)),inv=q=>[-q[0],-q[1],-q[2],q[3]],clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),dist=(a,b)=>Math.hypot(...sub(a,b)),I=[0,0,0,1],mix=(a,b,t)=>add(mul(a,1-t),mul(b,t));
const J=n=>{const j=m.joints.find(x=>x.name===n);if(!j)throw Error('Missing '+n);return j};
function matrixQ(m){const x=unit(m.slice(0,3)),y0=m.slice(4,7),y=unit(sub(y0,mul(x,dot(x,y0)))),z=cross(x,y),a=x[0],b=y[1],c=z[2],t=a+b+c;let q;if(t>0){const s=2*Math.sqrt(t+1);q=[(y[2]-z[1])/s,(z[0]-x[2])/s,(x[1]-y[0])/s,s/4]}else if(a>b&&a>c){const s=2*Math.sqrt(1+a-b-c);q=[s/4,(y[0]+x[1])/s,(z[0]+x[2])/s,(y[2]-z[1])/s]}else if(b>c){const s=2*Math.sqrt(1+b-a-c);q=[(y[0]+x[1])/s,s/4,(z[1]+y[2])/s,(z[0]-x[2])/s]}else{const s=2*Math.sqrt(1+c-a-b);q=[(z[0]+x[2])/s,(z[1]+y[2])/s,s/4,(x[1]-y[0])/s]}return unit(q)}
function swing(a,b){a=unit(a);b=unit(b);const d=clamp(dot(a,b),-1,1);return d<-.99999?quat(unit(cross(a,Math.abs(a[1])>.9?[1,0,0]:[0,1,0])),Math.PI):unit([...cross(a,b),1+d])}
const mapping=[['root','pelvis'],['spine03','spine01','spine02','spine02'],['spine02','spine02','spine01','spine03'],['spine01','spine03','neck01','neck'],['neck01','neck','head','head'],['head','head']];
for(const s of ['L','R'])for(const [t,b,child,next] of [['clavicle','clavicle','upperarm01','upperarm'],['upperarm01','upperarm','lowerarm01','lowerarm'],['lowerarm01','lowerarm','wrist','hand'],['wrist','hand'],['upperleg01','thigh','lowerleg01','calf'],['lowerleg01','calf','foot','foot'],['foot','foot','toe3-1','ball']])mapping.push([t+'.'+s,b+'.'+s,child?child+'.'+s:null,next?next+'.'+s:null]);
const targets=new Map(mapping.map(([t,b,child,next])=>{const align=child?swing(sub(J(child).position,J(t).position),sub(ref.rest[next],ref.rest[b])):I;return [J(t).id,{t,b,align,restQ:matrixQ(ref.bindMatrices[b])}]}));
function full(frame){const qs=m.joints.map(()=>I.slice()),world=[];for(const j of m.joints){const parent=j.parent<0?I:world[j.parent],t=targets.get(j.id);if(t){const desired=qmul(qmul(matrixQ(frame.worldMatrices[t.b]),inv(t.restQ)),t.align);qs[j.id]=qmul(inv(parent),desired)}world[j.id]=qmul(parent,qs[j.id])}return qs}
// Check actual complete orientation transfer, including twist. The alignment
// maps the target's rest segment into the source rest segment before delta.
const legLengths=['L','R'].map(s=>({target:dist(J('upperleg01.'+s).position,J('lowerleg01.'+s).position)+dist(J('lowerleg01.'+s).position,J('foot.'+s).position),source:dist(ref.rest['thigh.'+s],ref.rest['calf.'+s])+dist(ref.rest['calf.'+s],ref.rest['foot.'+s])})),scale=legLengths.reduce((n,r)=>n+r.target/r.source,0)/legLengths.length,first=ref.frames[0].points.pelvis,travel=sub(ref.frames[N].points.pelvis,first),strideA=travel[2]*scale,strideB=m.spec.gaitStride,ratio=strideB/strideA;
function solveLeg(q,s,target){
 const hip=J('upperleg01.'+s),knee=J('lowerleg01.'+s),foot=J('foot.'+s),w=poseFrom(m,q),p=w[hip.id].p,k=w[knee.id].p,a=w[foot.id].p,l1=dist(p,k),l2=dist(k,a),dir=unit(sub(target,p)),d=clamp(dist(target,p),Math.abs(l1-l2)+.002,l1+l2-.001);
 const plane=sub(sub(k,p),mul(dir,dot(sub(k,p),dir))),bend=Math.hypot(...plane)>.0001?unit(plane):unit(sub([0,0,1],mul(dir,dir[2]))),along=(l1*l1+d*d-l2*l2)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along)),newK=add(p,add(mul(dir,along),mul(bend,height))),newA=add(p,mul(dir,d));
 const apply=(j,delta,world)=>{const pq=j.parent<0?I:world[j.parent].q;q[j.id]=qmul(inv(pq),qmul(delta,world[j.id].q))};
 apply(hip,swing(sub(k,p),sub(newK,p)),w);let w2=poseFrom(m,q);apply(knee,swing(sub(w2[foot.id].p,w2[knee.id].p),sub(newA,w2[knee.id].p)),w2);w2=poseFrom(m,q);q[foot.id]=qmul(inv(w2[foot.parent].q),w[foot.id].q);return dist(p,target)-d
}
// Actual target boot landmarks from the existing mesh, grouped by foot
// influence, with no assumption that the whole sole is simultaneously planted.
const marks={};
for(const s of ['L','R']){const j=J('foot.'+s),boot=m.parts.find(p=>p.name==='boot '+s)??m.parts[0],pts=[];for(let i=0;i<boot.positions.length/3;i++)if(weights(boot,i).some(([id,w])=>id===j.id&&w>.35))pts.push(boot.positions.slice(i*3,i*3+3));if(!pts.length)throw Error('no foot surface '+s);const minY=Math.min(...pts.map(p=>p[1])),sole=pts.filter(p=>p[1]<minY+.018),zs=sole.map(p=>p[2]),lo=Math.min(...zs),hi=Math.max(...zs),avg=a=>a.reduce((v,p)=>add(v,mul(p,1/a.length)),[0,0,0]);marks[s]={heel:sub(avg(sole.filter(p=>p[2]<lo+(hi-lo)*.23)),j.position),toe:sub(avg(sole.filter(p=>p[2]>hi-(hi-lo)*.23)),j.position)}}
const point=(q,o,s,key)=>{const j=J('foot.'+s),w=poseFrom(m,q)[j.id];return add(add(w.p,rotate(w.q,marks[s][key])),o)};
const sourceMarks=read('v12-source-foot-surface.json').frames;
const ground=Math.min(...sourceMarks.flatMap(r=>['L','R'].flatMap(s=>['heel','toe'].map(k=>r[s][k][1]))));
const contact=sourceMarks.map((r,i)=>Object.fromEntries(['L','R'].map(s=>[s,Object.fromEntries(['heel','toe'].map(k=>{const p=r[s][k],v=dist(sourceMarks[Math.min(N,i+1)][s][k],sourceMarks[Math.max(0,i-1)][s][k])/(dt*(i===0||i===N?1:2));return [k,{position:p,height:p[1]-ground,speed:v,active:p[1]-ground<.045&&v<.28}]}))])));
const variants={A:{rotations:[],offsets:[]},B:{rotations:[],offsets:[]},C:{rotations:[],offsets:[]}},staticRows=[];
for(let i=0;i<=N;i++){const frame=ref.frames[i],q=full(frame),delta=sub(frame.points.pelvis,first),o=[delta[0]*scale,(frame.points.pelvis[1]-ref.rest.pelvis[1])*scale,delta[2]*scale],bq=q.map(x=>x.slice()),bo=[o[0],o[1],o[2]*ratio];
 for(const s of ['L','R']){const w=poseFrom(m,bq),h=w[J('upperleg01.'+s).id].p,a=w[J('foot.'+s).id].p,v=sub(a,h);solveLeg(bq,s,add(h,[v[0],v[1],v[2]*ratio]))}
 // One global vertical offset from the lowest actual sole point at
 // the first sample. Do not force feet level on every frame.
 variants.A.rotations.push(q);variants.A.offsets.push(o);variants.B.rotations.push(bq);variants.B.offsets.push(bo);
 if([0,6,12,18,24].includes(i)){const w=poseFrom(m,q);staticRows.push({phase:i/N,orientations:[...targets.entries()].map(([id,t])=>({target:t.t,source:t.b,worldQuaternion:w[id].q,sourceWorldQuaternion:matrixQ(frame.worldMatrices[t.b]),restAlignment:t.align,angularErrorDegrees:2*Math.acos(clamp(Math.abs(dot(w[id].q,qmul(qmul(matrixQ(frame.worldMatrices[t.b]),inv(t.restQ)),t.align))),0,1))*180/Math.PI}))})}
}
for(const v of [variants.A,variants.B]){const y=Math.min(...['L','R'].flatMap(s=>['heel','toe'].map(k=>point(v.rotations[0],v.offsets[0],s,k)[1])));for(const o of v.offsets)o[1]-=y-.008}
function diagnose(v){const rows=[],anchors={};for(let i=0;i<=N;i++){const phase=i/N,feet={};for(const s of ['L','R']){const cs=contact[i][s],f={};for(const k of ['heel','toe']){const p=point(v.rotations[i],v.offsets[i],s,k),key=s+k;if(cs[k].active){anchors[key]??=p.slice();f[k]={active:true,point:p,driftMm:Math.hypot(p[0]-anchors[key][0],p[2]-anchors[key][2])*1000,verticalErrorMm:Math.abs(p[1]-.008)*1000}}else{delete anchors[key];f[k]={active:false,point:p}}}f.phase=f.heel.active&&f.toe.active?'full support':f.heel.active?'heel':f.toe.active?'toe':'swing or transition';feet[s]=f}rows.push({phase,feet})}const all=rows.flatMap(r=>['L','R'].flatMap(s=>['heel','toe'].map(k=>r.feet[s][k]))).filter(x=>x.active);return {rows,activeSamples:all.length,maxDriftMm:Math.max(0,...all.map(x=>x.driftMm)),maxVerticalErrorMm:Math.max(0,...all.map(x=>x.verticalErrorMm))}}
const aDiag=diagnose(variants.A),bDiag=diagnose(variants.B);
// A is the fidelity-first candidate. B is deliberately shortened. Minimal
// correction on A; no procedural Author blend or forced flat foot rotation.
const anchors={},adjustments=[],corrections={L:[],R:[]};
const median=v=>{const a=v.slice().sort((a,b)=>a-b),n=a.length;return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2};
for(const s of ['L','R'])for(const k of ['heel','toe']){
 const runs=[];for(let i=0;i<=N;i++)if(contact[i][s][k].active){if(!runs.length||runs.at(-1).at(-1)!==i-1)runs.push([]);runs.at(-1).push(i)}
 for(const run of runs){const p=run.map(i=>point(variants.A.rotations[i],variants.A.offsets[i],s,k)),anchor=[0,1,2].map(k=>median(p.map(v=>v[k])));for(const i of run)anchors[i+':'+s+':'+k]=anchor}
}
for(const s of ['L','R'])for(let i=0;i<=N;i++){
 const e=['heel','toe'].filter(k=>anchors[i+':'+s+':'+k]).map(k=>sub(anchors[i+':'+s+':'+k],point(variants.A.rotations[i],variants.A.offsets[i],s,k)));
 corrections[s][i]=e.length?mul(e.reduce(add,[0,0,0]),1/e.length):null;
 if(corrections[s][i])corrections[s][i][1]=0; // preserve reference heel/toe rocker
}
for(let i=0;i<=N;i++){
 const q=variants.A.rotations[i].map(x=>x.slice()),o=variants.A.offsets[i].slice();
 for(const s of ['L','R']){
  let d=corrections[s][i];
  if(!d){const prev=corrections[s][i-1],next=corrections[s][i+1];d=prev&&next?mul(add(prev,next),.25):prev?mul(prev,.35):next?mul(next,.35):null}
  if(!d)continue;const len=Math.hypot(...d);if(len>.045)d=mul(d,.045/len);
  const w=poseFrom(m,q),f=J('foot.'+s),before=q.map(x=>x.slice());solveLeg(q,s,add(w[f.id].p,d));
  adjustments.push({phase:i/N,side:s,requestedMm:len*1000,appliedMm:Math.hypot(...d)*1000,maxJointChangeDegrees:Math.max(...q.map((v,k)=>2*Math.acos(clamp(Math.abs(dot(v,before[k])),0,1))*180/Math.PI))});
 }
 variants.C.rotations.push(q);variants.C.offsets.push(o);
}
const reports={A:aDiag,B:bDiag,C:diagnose(variants.C)};
// v13: preserve C as an immutable comparison. Audit the actual boot skin,
// and distinguish a lifted rocker from full support by source heel-toe height.
const groundY=m.spec.groundY??.008,boots={},soleIds={};
for(const side of ['L','R']){
 const p=m.parts.find(p=>p.name==='boot '+side);if(!p)throw Error('Missing boot');boots[side]=p;
 const pts=Array.from({length:p.positions.length/3},(_,i)=>p.positions.slice(i*3,i*3+3)),y=Math.min(...pts.map(p=>p[1])),ids=pts.map((p,i)=>i).filter(i=>pts[i][1]<=y+.012),zs=ids.map(i=>pts[i][2]),lo=Math.min(...zs),hi=Math.max(...zs);
 soleIds[side]={all:ids,heel:ids.filter(i=>pts[i][2]<=lo+.25*(hi-lo)),toe:ids.filter(i=>pts[i][2]>=hi-.25*(hi-lo))};
}
const support=contact.map((c,i)=>Object.fromEntries(['L','R'].map(s=>{
 const old=['heel','toe'].filter(k=>c[s][k].active),delta=sourceMarks[i][s].heel[1]-sourceMarks[i][s].toe[1];
 const active=old.length===2&&Math.abs(delta)>.012?[delta>0?'toe':'heel']:old;
 return [s,{active,legacy:old,sourceHeelToeDelta:delta,classification:active.length===2?'full support':active[0]??'swing/transition'}]
})));
function actual(q,o,s){
 const w=poseFrom(m,q).map(b=>({...b,p:add(b.p,o)})),v=deform(m,boots[s],w),ids=soleIds[s],avg=k=>ids[k].reduce((a,i)=>add(a,mul(v[i],1/ids[k].length)),[0,0,0]),heel=avg('heel'),toe=avg('toe');
 return {heel,toe,heelMin:Math.min(...ids.heel.map(i=>v[i][1])),toeMin:Math.min(...ids.toe.map(i=>v[i][1])),soleMin:Math.min(...ids.all.map(i=>v[i][1])),meshMin:Math.min(...v.map(p=>p[1])),pitchDegrees:Math.atan2(toe[1]-heel[1],Math.hypot(toe[0]-heel[0],toe[2]-heel[2]))*180/Math.PI,ankle:w[J('foot.'+s).id].p};
}
const vertical={A:structuredClone(variants.C),B:{rotations:[],offsets:[]},C:{rotations:[],offsets:[]}},rootDesired=[];
for(let i=0;i<=N;i++){const q=vertical.A.rotations[i],o=vertical.A.offsets[i],err=[];for(const s of ['L','R']){const a=actual(q,o,s);for(const k of support[i][s].active)err.push(groundY-a[k+'Min'])}rootDesired.push(err.length?clamp(median(err),-.075,.075):null)}
const nearest=(i)=>{if(rootDesired[i]!==null)return rootDesired[i];let a=i-1,b=i+1;while(a>=0&&rootDesired[a]===null)a--;while(b<=N&&rootDesired[b]===null)b++;return a>=0&&b<=N?rootDesired[a]+(rootDesired[b]-rootDesired[a])*(i-a)/(b-a):rootDesired[a>=0?a:b]??0};
const rootShift=rootDesired.map((_,i)=>(nearest(Math.max(0,i-1))+2*nearest(i)+nearest(Math.min(N,i+1)))/4);
for(const name of ['B','C'])for(let i=0;i<=N;i++){
 const q=vertical.A.rotations[i].map(x=>x.slice()),o=vertical.A.offsets[i].slice();o[1]+=rootShift[i];
 for(const s of ['L','R']){
  const active=support[i][s].active;if(!active.length)continue;
  const base=actual(vertical.A.rotations[i],vertical.A.offsets[i],s),f=J('foot.'+s);
  if(name==='C'){
   const a=actual(q,o,s),v=sub(a.toe,a.heel),horizontal=Math.hypot(v[0],v[2]),src=sub(sourceMarks[i][s].toe,sourceMarks[i][s].heel),targetAngle=active.length===2?0:Math.atan2(src[1],Math.hypot(src[0],src[2])),angle=Math.atan2(v[1],horizontal),axis=unit(cross(unit([v[0],0,v[2]]),[0,1,0])),delta=clamp(targetAngle-angle,-Math.PI/12,Math.PI/12);
   const w=poseFrom(m,q);q[f.id]=qmul(inv(w[f.parent].q),qmul(quat(axis,delta),w[f.id].q));
  }
  // Match the accepted horizontal anchor and actual contact surface height;
  // translate ankle by only the residual, maintaining foot orientation.
  for(let pass=0;pass<3;pass++){const a=actual(q,o,s),err=active.map(k=>[base[k][0]-a[k][0],groundY-a[k+'Min'],base[k][2]-a[k][2]]),d=mul(err.reduce(add,[0,0,0]),1/err.length);d[1]=Math.max(d[1],groundY-a.soleMin-.003);if(Math.hypot(...d)<.001)break;const w=poseFrom(m,q);solveLeg(q,s,add(w[f.id].p,d.map(x=>clamp(x,-.065,.065))))}
 }
 vertical[name].rotations.push(q);vertical[name].offsets.push(o);
}
function verticalAudit(v){
 const rows=[],anchors={};let maxDrift=0,maxY=0,maxPen=0,maxLegacy=0,count=0,legacyCount=0,feetCount=0;
 for(let i=0;i<=N;i++){const q=v.rotations[i],o=v.offsets[i],feet={};for(const s of ['L','R']){const a=actual(q,o,s),active=support[i][s].active,entry={...a,support:support[i][s],contacts:{}};maxPen=Math.max(maxPen,(groundY-a.meshMin)*1000);
 if(active.length)feetCount++;for(const k of ['heel','toe']){const key=s+k;if(support[i][s].legacy.includes(k)){maxLegacy=Math.max(maxLegacy,Math.abs(a[k+'Min']-groundY)*1000);legacyCount++}if(active.includes(k)){anchors[key]??=a[k].slice();const drift=Math.hypot(a[k][0]-anchors[key][0],a[k][2]-anchors[key][2])*1000,y=Math.abs(a[k+'Min']-groundY)*1000;count++;maxDrift=Math.max(maxDrift,drift);maxY=Math.max(maxY,y);entry.contacts[k]={driftMm:drift,verticalMm:y}}else delete anchors[key]}feet[s]=entry}
 rows.push({phase:i/N,pelvis:poseFrom(m,q)[J('root').id].p.map((x,k)=>x+o[k]),feet})}
 return {rows,activeSamples:count,legacySamples:legacyCount,activeFootFrames:feetCount,maxDriftMm:maxDrift,maxVerticalErrorMm:maxY,maxLegacyVerticalMm:maxLegacy,maxGroundPenetrationMm:maxPen,gate:maxDrift<=10&&maxY<=10&&maxPen<=10&&feetCount>0};
}
const verticalReports=Object.fromEntries(Object.entries(vertical).map(([k,v])=>[k,verticalAudit(v)]));
const relaxed=q=>{const q2=q.map(x=>x.slice());for(const s of ['L','R']){const wrist=J('wrist.'+s),digits=[2,3,4,5].map(n=>J('finger'+n+'-1.'+s)),bar=unit(sub(digits[3].position,digits[0].position)),palm=digits.reduce((a,j)=>add(a,mul(j.position,.25)),[0,0,0]),along=unit(sub(palm,wrist.position)),normal=mul(unit(cross(bar,along)),s==='L'?1:-1);for(let n=1;n<=5;n++)for(let j=1;j<=3;j++){const b=J('finger'+n+'-'+j+'.'+s),c=J('finger'+n+'-'+(j===3?2:j+1)+'.'+s),dir=j===3?sub(b.position,c.position):sub(c.position,b.position),axis=unit(cross(dir,normal));q2[b.id]=qmul(q2[b.id],quat(axis,(n===1?.4:1)*[.13,.22,.11][j-1]))}}return q2};
// v14: preserve v13 C exactly, solve both legs including swing clearance.
const bilateral={A:structuredClone(vertical.C),B:{rotations:[],offsets:[]},C:{rotations:[],offsets:[]}},targetPoints={},rootPlan=[];
for(let i=0;i<=N;i++){targetPoints[i]={};const q=bilateral.A.rotations[i],o=bilateral.A.offsets[i];const required=[];for(const side of ['L','R']){const a=actual(q,o,side),active=support[i][side].active;targetPoints[i][side]=a;required.push(groundY-a.meshMin-.002)}rootPlan.push(clamp(Math.max(0,...required)*.35,0,.028))}
const slerp=(a,b,t)=>{let d=dot(a,b);if(d<0){b=mul(b,-1);d=-d}d=clamp(d,-1,1);if(d>.9995)return unit(add(mul(a,1-t),mul(b,t)));const th=Math.acos(d);return add(mul(a,Math.sin((1-t)*th)/Math.sin(th)),mul(b,Math.sin(t*th)/Math.sin(th)))};
const changes=[];
for(const name of ['B','C'])for(let i=0;i<=N;i++){
 const base=bilateral.A.rotations[i],q=base.map(x=>x.slice()),o=bilateral.A.offsets[i].slice();
 const shift=name==='B'?rootPlan[i]:(rootPlan[Math.max(0,i-1)]+2*rootPlan[i]+rootPlan[Math.min(N,i+1)])/4;o[1]+=shift;
 // Preserve world foot rotations; both active and inactive surfaces are
 // constrained. A swing foot may translate upwards, never flatten to ground.
 for(let pass=0;pass<6;pass++)for(const side of ['L','R']){
  const f=J('foot.'+side),a=actual(q,o,side),b=targetPoints[i][side],active=support[i][side].active;
  const e=active.map(k=>[b[k][0]-a[k][0],groundY-a[k+'Min'],b[k][2]-a[k][2]]);
  let d=e.length?mul(e.reduce(add,[0,0,0]),1/e.length):[0,0,0];
  d[1]=Math.max(d[1],groundY-a.meshMin-.0015);
  if(Math.hypot(...d)<.0005)continue;const w=poseFrom(m,q);solveLeg(q,side,add(w[f.id].p,d.map(x=>clamp(x,-.045,.045))));
 }
 bilateral[name].rotations.push(q);bilateral[name].offsets.push(o);
}
 // Regularize correction deltas, not source motion. Re-project after
 // smoothing so constraints are never silently dropped.
for(let pass=0;pass<2;pass++){
 const prev=bilateral.C.rotations.map(q=>q.map(x=>x.slice()));
 for(let i=0;i<=N;i++){
  const q=bilateral.C.rotations[i],base=bilateral.A.rotations[i],o=bilateral.C.offsets[i];
  for(const side of ['L','R'])for(const n of ['upperleg01','lowerleg01']){const j=J(n+'.'+side),k=j.id,delta=t=>qmul(prev[t][k],inv(bilateral.A.rotations[t][k])),left=delta(Math.max(0,i-1)),right=delta(Math.min(N,i+1)),center=delta(i);q[k]=qmul(slerp(center,slerp(left,right,.5),.18),base[k])}
  for(let loop=0;loop<5;loop++)for(const side of ['L','R']){
   const f=J('foot.'+side),baseW=poseFrom(m,base),w0=poseFrom(m,q);q[f.id]=qmul(inv(w0[f.parent].q),baseW[f.id].q);
   const a=actual(q,o,side),b=targetPoints[i][side],active=support[i][side].active,e=active.map(k=>[b[k][0]-a[k][0],groundY-a[k+'Min'],b[k][2]-a[k][2]]);
   const d=e.length?mul(e.reduce(add,[0,0,0]),1/e.length):[0,0,0];d[1]=Math.max(d[1],groundY-a.meshMin-.0015);if(Math.hypot(...d)<.0005)continue;solveLeg(q,side,add(poseFrom(m,q)[f.id].p,d.map(x=>clamp(x,-.035,.035))));
  }
 }
}
const v14Reports={},v14Rendered={};
for(const [name,v] of Object.entries(bilateral)){
 const candidate=structuredClone(m);candidate.sampledWalk={rotations:v.rotations.map(relaxed),offsets:v.offsets};candidate.spec.walkDuration=ref.durationSeconds;candidate.spec.actions=['idle','walk'];candidate.spec.motionRevision='v9';
 const bin=glb(candidate);write('v14-walk-'+name+'.glb',bin);json('v14-walk-'+name+'-spec.json',{spec:candidate.spec,sampledWalk:v});
 // Read exact float32 exported animation channels, including root travel.
 const len=bin.readUInt32LE(12),doc=JSON.parse(bin.subarray(20,20+len).toString()),offset=28+len,clip=doc.animations.find(a=>a.name==='walk');
 const acc=id=>{const a=doc.accessors[id],view=doc.bufferViews[a.bufferView],n=a.type==='SCALAR'?1:a.type==='VEC3'?3:4,base=offset+(view.byteOffset??0)+(a.byteOffset??0);if(a.componentType!==5126)throw Error('Unexpected exported motion accessor');return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,j)=>bin.readFloatLE(base+i*(view.byteStride??n*4)+4*j)))};
 const tracks=clip.channels.map(ch=>({node:ch.target.node,path:ch.target.path,values:acc(clip.samplers[ch.sampler].output),times:acc(clip.samplers[ch.sampler].input).flat()}));const root=m.joints.find(j=>j.parent<0),rootTrack=tracks.find(t=>t.node===root.id&&t.path==='translation');if(!rootTrack)throw Error('Missing exported root translation');
 const count=(rootTrack.times.length-1)*4,frames=[],anchors14={},midpointModels=[];let maxPen=0,maxVert=0,maxDrift=0,activeCount=0,maxDelta=0;
 for(let j=0;j<=count;j++){
  const phase=j/count,t=phase*(rootTrack.times.length-1),k=Math.floor(t),l=Math.min(k+1,rootTrack.times.length-1),u=t-k,qs=m.joints.map(()=>I.slice());
  for(const tr of tracks)if(tr.path==='rotation')qs[tr.node]=slerp(tr.values[k],tr.values[l],u);
  const o=sub(add(mul(rootTrack.values[k],1-u),mul(rootTrack.values[l],u)),root.local),feet={};
  // Interpolate between source contact classifications; keep all key-frame
  // contacts, and retain the interval when both ends classify it active.
  for(const side of ['L','R']){
   const a=actual(qs,o,side),active=u===0?support[k][side].active:support[k][side].active.filter(x=>support[l][side].active.includes(x));const cs={};
   maxPen=Math.max(maxPen,(groundY-a.meshMin)*1000);
   for(const key of ['heel','toe']){const tag=side+key;if(active.includes(key)){anchors14[tag]??=a[key].slice();const drift=Math.hypot(a[key][0]-anchors14[tag][0],a[key][2]-anchors14[tag][2])*1000,vertical=Math.abs(a[key+'Min']-groundY)*1000;maxDrift=Math.max(maxDrift,drift);maxVert=Math.max(maxVert,vertical);activeCount++;cs[key]={drift,vertical}}else delete anchors14[tag]}
   feet[side]={...a,active,contacts:cs}
  }
  frames.push({phase,feet,offset:o});if([1,69,95].includes(j)){const w=poseFrom(m,qs).map(b=>({...b,p:add(b.p,o)}));midpointModels.push({sample:j,parts:Object.values(boots).map(p=>{const part=structuredClone(p);part.positions=deform(m,p,w).flat();normals(part);return part})})}
 }
 for(let i=0;i<=N;i++)for(const side of ['L','R'])for(const n of ['upperleg01','lowerleg01','foot']){const k=J(n+'.'+side).id;maxDelta=Math.max(maxDelta,2*Math.acos(clamp(Math.abs(dot(v.rotations[i][k],bilateral.A.rotations[i][k])),0,1))*180/Math.PI)}
 const seam=dist(sub(v.offsets[N],v.offsets[0]),[0,0,strideA])*1000;
 const jointSeam=Math.max(...v.rotations[0].map((q,k)=>2*Math.acos(clamp(Math.abs(dot(q,v.rotations[N][k])),0,1))*180/Math.PI));
 const seamCorrection=dist(sub(v.offsets[N],v.offsets[0]),sub(bilateral.A.offsets[N],bilateral.A.offsets[0]))*1000,correctionSeam=Math.max(...v.rotations[0].map((q,k)=>2*Math.acos(clamp(Math.abs(dot(qmul(q,inv(bilateral.A.rotations[0][k])),qmul(v.rotations[N][k],inv(bilateral.A.rotations[N][k])))),0,1))*180/Math.PI));
 const keyAudit=verticalAudit(v);v14Reports[name]={keyAudit,correctionSeam,rootCorrectionSeamMm:seamCorrection,exported:{frames,activeCount,maxGroundPenetrationMm:maxPen,maxVerticalErrorMm:maxVert,maxDriftMm:maxDrift},maxJointChangeDegrees:maxDelta,rootSeamResidualMm:seam,jointSeamDegrees:jointSeam,gate:maxPen<=3&&maxVert<=10&&maxDrift<=10&&seamCorrection<=10&&correctionSeam<=10&&maxDelta<=25&&keyAudit.activeSamples===verticalReports.C.activeSamples};
 const models=v.rotations.map((q,i)=>{const w=poseFrom(candidate,relaxed(q)).map(b=>({...b,p:add(b.p,v.offsets[i])})),model=structuredClone(candidate);for(let j=0;j<model.parts.length;j++){model.parts[j].positions=deform(candidate,candidate.parts[j],w).flat();normals(model.parts[j])}return model});
 v14Rendered[name]=models;
 for(const view of ['side','front'])for(const item of midpointModels)write('v14-foot-intermediate-'+name+'-'+item.sample+'-'+view+'.png',raster({parts:item.parts},{view,size:512,mode:'A',groundLine:true}).png);
}
v14Rendered.Original=native.map(row=>({parts:row.parts.map(p=>{const q={...p,positions:p.positions.map((v,k)=>k%3===2?(v-first[2])*scale:v*scale)};normals(q);return q})}));
for(const view of ['side','front']){
 const bounds=commonBounds(Object.values(v14Rendered).flat(),view);
 for(const [name,models] of Object.entries(v14Rendered)){const dir='v14-walk-'+name+'-'+view;mkdirSync(join(out,dir),{recursive:true});for(let i=0;i<=N;i++)write(dir+'/'+String(i).padStart(2,'0')+'.png',raster(models[i],{view,bounds,size:512,mode:'B',groundLine:true}).png)}
 for(const frame of [0,17,24]){const feet=Object.entries(v14Rendered).filter(([k])=>k!=='Original').map(([k,v])=>[k,{parts:v[frame].parts.filter(p=>/^boot /.test(p.name))}]),bounds=commonBounds(feet.map(x=>x[1]),view);for(const [name,model] of feet)write('v14-foot-'+name+'-'+frame+'-'+view+'.png',raster(model,{view,bounds,size:512,mode:'A',groundLine:true}).png)}
}
json('v14-contact-report.json',{variants:v14Reports,qualification:{contactGate:v14Reports.C.gate,artApproved:false},limits:['97 samples directly decoded from exported float32 GLB channels.','Source key-frame contact classifications preserved; intermediate active intervals require agreement at both ends.','Root and joint seam residuals reported, not yet artistic loop approval.','C smooths local correction deltas and reprojects bilateral surface constraints.']});
console.log(JSON.stringify({bilateral:Object.fromEntries(Object.entries(v14Reports).map(([k,v])=>[k,{drift:v.exported.maxDriftMm,vertical:v.exported.maxVerticalErrorMm,penetration:v.exported.maxGroundPenetrationMm,gate:v.gate}]))}));
const sameRig=false; // v13 anatomy art archived in the previous run; v14 produces only the requested new comparison.
json('v13-vertical-report.json',{groundY,sourceContact:contact,support,rootShift,variants:verticalReports,legacyHorizontal:reports.C.maxDriftMm,sourceRigMatches:sameRig,phase17:verticalReports.A.rows[17],qualification:{contactGate:verticalReports.C.gate,artApproved:false},limits:['Source rocker reclassification keeps every formerly active foot-frame and reports legacy samples separately.','Actual skinned sole vertices; no force-plate evidence.','B vertical pelvis/leg correction; C additionally preserves source pitch.','Prior v13 anatomy art retained in its original archive; no repeated production.']});
console.log(JSON.stringify({vertical:Object.fromEntries(Object.entries(verticalReports).map(([k,v])=>[k,{horizontal:v.maxDriftMm,vertical:v.maxVerticalErrorMm,penetration:v.maxGroundPenetrationMm,activeSamples:v.activeSamples,gate:v.gate}]))}));
json('v12-motion-report.json',{source:ref.source,duration:ref.durationSeconds,sourceTravel:travel,legLengths,scale,strideA,strideB,strideRatio:ratio,staticRows,marks,sourceContact:contact,variants:reports,adjustments,qualification:{contactGate:reports.C.activeSamples>0&&reports.C.maxDriftMm<=10,artApproved:false},limits:['Full bind-relative world orientation plus segment alignment, not a native MakeHuman anatomical-axis calibration.','Source heel/toe use actual original skinned vertices, not force-plate contacts; contact thresholds are 45 mm / 0.28 m/s.','Target heel/toe are sampled boot landmarks.','C uses A as provisional fidelity-first base, median horizontal anchors per measured contact interval and preserves foot orientation/vertical rocker. Correction capped at 45 mm; no art approval.','Original preview scaled to target size; B intentionally has a shorter path. Native source GLB unchanged.']});
console.log(JSON.stringify({strideA,strideB,variants:Object.fromEntries(Object.entries(reports).map(([k,v])=>[k,{maxDriftMm:v.maxDriftMm,activeSamples:v.activeSamples,maxVerticalErrorMm:v.maxVerticalErrorMm}]))}));
