// Local index-PIP study. No change to Character Core or normal production GLB.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {poseFrom,deform,rotate,qmul} from './core.mjs';
import {normals,weights} from './hybrid-human.mjs';
import {raster,commonBounds} from './material-study.mjs';
import {glb} from './glb.mjs';
const out=process.env.CHARACTER_EVIDENCE,read=n=>JSON.parse(readFileSync(join(out,n))),write=(n,v)=>writeFileSync(join(out,n),v);
const source=read('morph/makehuman-base.json'),a=read('morph/v15-hand-core.json'),b=read('v16-hand-transfer.json'),prior=read('v16-hand-audit.json');
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len=a=>Math.hypot(...a),unit=a=>mul(a,1/Math.max(1e-12,len(a))),clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const mix=(a,b,t)=>add(mul(a,1-t),mul(b,t)),J=n=>source.joints.find(j=>j.name===n+'.L');
const mcp=J('finger2-1'),pip=J('finger2-2'),dip=J('finger2-3'),parent=source.joints[mcp?.parent];
if(!mcp||!pip||!dip||!parent)throw Error('Missing index MCP anatomy');
const model=structuredClone(source),p=model.parts[0],axis=unit(sub(mcp.position,parent.position)),half=Math.min(len(sub(mcp.position,parent.position)),len(sub(pip.position,mcp.position)))*.45;
const region=new Map(),restP=i=>p.positions.slice(3*i,3*i+3);
const count=p.positions.length/3;
const getW=(part,i)=>weights(part,i).filter(x=>x[1]>1e-9);
function setW(part,i,entries){
 const sorted=entries.filter(x=>x[1]>1e-9).sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,8),total=sorted.reduce((s,x)=>s+x[1],0);
 for(let k=0;k<8;k++){part.joints8[i*8+k]=sorted[k]?.[0]??0;part.weights8[i*8+k]=(sorted[k]?.[1]??0)/total;}
 const t4=sorted.slice(0,4).reduce((s,x)=>s+x[1],0);
 for(let k=0;k<4;k++){part.joints[i*4+k]=sorted[k]?.[0]??0;part.weights[i*4+k]=(sorted[k]?.[1]??0)/t4;}
}
for(let i=0;i<count;i++){
 const w=getW(p,i),lookup=new Map(w),pair=(lookup.get(parent.id)??0)+(lookup.get(mcp.id)??0),x=dot(sub(restP(i),mcp.position),axis);
 if(pair<.8||Math.abs(x)>=half)continue;
 const influence=smooth(1-Math.abs(x)/half),t=smooth((x+half)/(2*half));
 const old=lookup.get(mcp.id)??0,updated=old*(1-influence*.65)+pair*t*influence*.65;
 lookup.set(mcp.id,updated);lookup.set(parent.id,pair-updated);setW(p,i,[...lookup]);region.set(i,{x,influence,pair});
}
if(region.size<4)throw Error('Insufficient local MCP vertices');
const phases=[0,.25,.5,.75,1],names=['open','index-0.25','index-0.5','index-0.75','index-1'];
const brot=names.map(n=>{const r=b.rows.find(r=>r.name===n);if(!r)throw Error(n);return r.rotations});
const ar=names.map(n=>{const r=a.rows.find(r=>r.name===(n==='open'?'rest':n));if(!r)throw Error(n);return r.coreRotations});
const normq=q=>mul(q,1/Math.max(1e-12,len(q))),qinv=q=>[-q[0],-q[1],-q[2],q[3]],qangle=q=>2*Math.acos(clamp(Math.abs(normq(q)[3])))*180/Math.PI;
function qslerp(a,b,t){let d=dot(a,b);if(d<0){b=mul(b,-1);d=-d}if(d>.9995)return normq(mix(a,b,t));const th=Math.acos(Math.max(-1,Math.min(1,d))),sn=Math.sin(th);return normq(add(mul(a,Math.sin((1-t)*th)/sn),mul(b,Math.sin(t*th)/sn)))}
const poseMatchDiagnostics=[],matchedPoseDiagnostics={};
function matchPoses(reference,name){const diagnostics=[];const matched=reference.map((row,j)=>{const result=row.map(q=>q.slice()),joints=[];for(const id of [mcp.id,pip.id,dip.id]){const qa=qmul(qinv(ar[0][id]),ar[j][id]),qb=qmul(qinv(reference[0][id]),reference[j][id]),aDeg=qangle(qa),bDeg=qangle(qb),ratio=bDeg>1e-6?aDeg/bDeg:0,scaled=qslerp([0,0,0,1],qb,ratio),matchedDeg=qangle(scaled);result[id]=normq(qmul(reference[0][id],scaled));joints.push({joint:source.joints[id].name,makeHumanDeg:aDeg,referenceDeg:bDeg,matchedDeg,ratio,angleErrorDeg:Math.abs(aDeg-matchedDeg)})}diagnostics.push({phase:phases[j],joints});return result});matchedPoseDiagnostics[name]=diagnostics;return matched;}
const matchedB=matchPoses(brot,'B'),matchedC=matchPoses(brot,'C'),matchedD=matchPoses(brot,'D');poseMatchDiagnostics.push(...matchedPoseDiagnostics.B);
const w=poseFrom(model,brot.at(-1)),delta=Array(p.positions.length).fill(0);
function inverseCols(cols,y){const [a,b,c]=cols,d=dot(a,cross(b,c));if(Math.abs(d)<1e-6)return null;return [dot(y,cross(b,c)),dot(y,cross(c,a)),dot(y,cross(a,b))].map(x=>x/d)}
for(const [i,r] of region){
 const point=restP(i),inf=getW(p,i),pair=r.pair,t=(inf.find(x=>x[0]===mcp.id)?.[1]??0)/pair;
 const qa=w[parent.id].q,qb=w[mcp.id].q,rigid=normq(mix(qa,dot(qa,qb)<0?mul(qb,-1):qb,t));
 // Preserve local volume around the actual metacarpal-to-proximal-phalanx MCP joint.
 const pivot=w[mcp.id].p,rigidPoint=add(pivot,rotate(rigid,sub(point,mcp.position)));
 const rigidA=add(w[parent.id].p,rotate(qa,sub(point,parent.position))),rigidB=add(w[mcp.id].p,rotate(qb,sub(point,mcp.position)));
 let displacement=mul(sub(rigidPoint,mix(rigidA,rigidB,t)),pair*r.influence);
 const max=.35*half;if(len(displacement)>max)displacement=mul(displacement,max/len(displacement));
 const columns=[[1,0,0],[0,1,0],[0,0,1]].map(e=>inf.reduce((s,[id,x])=>add(s,mul(rotate(w[id].q,e),x)),[0,0,0]));
 const d=inverseCols(columns,displacement);if(d)for(let k=0;k<3;k++)delta[3*i+k]=d[k];
}
// Local conforming edge retessellation. Shared edge midpoints are propagated
// to every incident face; unchanged boundary remains welded to the forearm.
const D=structuredClone(model),dp=D.parts[0],dd=delta.slice(),mid=new Map(),oldCount=count,oldIndices=dp.indices.slice(),selected=new Set(a.selected);
const key=(i,j)=>i<j?i+':'+j:j+':'+i;
function midpoint(i,j){
 const k=key(i,j);if(mid.has(k))return mid.get(k);
 const n=dp.positions.length/3;dp.positions.push(...mix(restP(i),restP(j),.5));dd.push(...mix(delta.slice(i*3,i*3+3),delta.slice(j*3,j*3+3),.5));
 if(dp.texcoords?.length)dp.texcoords.push(...mix(dp.texcoords.slice(i*2,i*2+2),dp.texcoords.slice(j*2,j*2+2),.5));
 if(dp.vertexTint?.length)dp.vertexTint.push(...mix(dp.vertexTint.slice(i*3,i*3+3),dp.vertexTint.slice(j*3,j*3+3),.5));
 const combined=new Map();for(const v of [i,j])for(const [id,x] of getW(p,v))combined.set(id,(combined.get(id)??0)+x*.5);
 setW(dp,n,[...combined]);mid.set(k,n);selected.add(n);return n;
}
for(let k=0;k<oldIndices.length;k+=3){const f=oldIndices.slice(k,k+3);for(let i=0;i<3;i++){const u=f[i],v=f[(i+1)%3];if(region.has(u)&&region.has(v))midpoint(u,v)}}
dp.indices=[];
for(let k=0;k<oldIndices.length;k+=3){
 const [u,v,z]=oldIndices.slice(k,k+3),uv=mid.get(key(u,v)),vz=mid.get(key(v,z)),zu=mid.get(key(z,u)),bits=[uv,vz,zu].map(x=>x!==undefined);
 if(bits.every(Boolean))dp.indices.push(u,uv,zu,uv,v,vz,zu,vz,z,uv,vz,zu);
 else if(bits.filter(Boolean).length===2){
  const f=[u,v,z],ms=[uv,vz,zu],i=ms.findIndex(x=>x===undefined),a=f[i],b=f[(i+1)%3],c=f[(i+2)%3],bc=ms[(i+1)%3],ca=ms[(i+2)%3];dp.indices.push(a,b,bc,a,bc,ca,ca,bc,c);
 }else if(bits.some(Boolean)){
  const f=[u,v,z],ms=[uv,vz,zu],i=ms.findIndex(x=>x!==undefined),a=f[i],b=f[(i+1)%3],c=f[(i+2)%3],x=ms[i];dp.indices.push(a,x,c,x,b,c);
 }else dp.indices.push(u,v,z);
}
normals(dp);
const dsel=[...selected],mapping=new Map(dsel.map((x,i)=>[x,i])),df=[];
for(let k=0;k<dp.indices.length;k+=3){const f=dp.indices.slice(k,k+3);if(f.every(i=>mapping.has(i)))df.push(f.map(i=>mapping.get(i)))}
const activation=phases.map(f=>smooth((f-.5)/.5));
function candidate(name,model,rotations,indices,faces,deltas){
 const part=model.parts[0],rest=indices.map(i=>part.positions.slice(i*3,i*3+3)),rows=[];
 for(let j=0;j<phases.length;j++){
  const morph=deltas?{...part,positions:part.positions.map((x,k)=>x+deltas[k]*activation[j])}:part;
  const vertices=deform(model,morph,poseFrom(model,rotations[j])),local=indices.map(i=>vertices[i]);
  rows.push({phase:phases[j],vertices:local});
 }
 const c=structuredClone(model);c.spec.actions=['walk'];c.spec.walkDuration=1;c.spec.motionRevision='v9';c.sampledWalk={rotations,offsets:rotations.map(()=>[0,0,0])};
 const normalDeltas={};
 if(deltas)for(let k=0;k<c.parts.length;k++){const x=c.parts[k],d=k===0?deltas:Array(x.positions.length).fill(0),corrected={...x,positions:x.positions.map((v,j)=>v+d[j])};normals(corrected);normalDeltas[x.name]=corrected.normals.map((v,j)=>v-x.normals[j]);}
 const opt=deltas?{researchMorph:{deltas:Object.fromEntries(c.parts.map((p,i)=>[p.name,i===0?deltas:Array(p.positions.length).fill(0)])),normalDeltas,weights:activation}}:{};
 write('v17-hand-'+name+'.glb',glb(c,opt));return {name,rest,faces,rows,indices,activation:deltas?activation:null,jointPositions:rotations.map(q=>poseFrom(model,q)[mcp.id].p)};
}
const primaryCases=[candidate('A',source,ar,a.selected,a.faces),candidate('B',source,brot,a.selected,a.faces),candidate('B-matched',source,matchedB,a.selected,a.faces),candidate('C',model,brot,a.selected,a.faces,delta),candidate('C-matched',model,matchedC,a.selected,a.faces,delta),candidate('D',D,brot,dsel,df,dd),candidate('D-matched',D,matchedD,dsel,df,dd)];
const morphTransfer=[],morphCases=[],morphFiles=[['makehuman-older-man.json','older-man'],['makehuman-older-woman.json','older-woman'],['makehuman-short-light.json','short-light'],['makehuman-tall-heavy.json','tall-heavy'],['makehuman-young-woman.json','young-woman']];
for(const [file,slug] of morphFiles){const variant=read('morph/'+file),vp=variant.parts[0],jointCompatible=variant.joints.length===source.joints.length&&variant.joints.every((j,i)=>j.name===source.joints[i].name&&j.parent===source.joints[i].parent),compatible=jointCompatible&&vp.positions.length===p.positions.length&&vp.indices.length===p.indices.length&&vp.indices.every((x,i)=>x===p.indices[i]);if(!compatible){morphTransfer.push({name:slug,compatible:false,jointCompatible,reason:'Topology/index or semantic joint mapping differs'});continue}for(const key of ['joints8','weights8','joints','weights'])vp[key]=model.parts[0][key].slice();morphCases.push(candidate('C-'+slug,variant,brot,a.selected,a.faces,delta));morphTransfer.push({name:slug,compatible:true,jointCompatible:true,correctiveTransferred:true,vertices:vp.positions.length/3,triangles:vp.indices.length/3,maxCorrectiveMm:Math.max(...[...region.keys()].map(i=>len(delta.slice(i*3,i*3+3))))*1000,artApproved:false})}
const cases=[...primaryCases,...morphCases];
for(const i of [0,2,4]){
 const meshes=primaryCases.map(c=>{const m={...p,positions:c.rows[i].vertices.flat(),indices:c.faces.flat()};normals(m);return {parts:[m]}});
 for(const view of ['front','side','three-quarter']){
  const bounds=commonBounds(meshes,view);
  for(let j=0;j<primaryCases.length;j++)write('v17-hand-'+primaryCases[j].name+'-'+phases[i]+'-'+view+'.png',raster(meshes[j],{view,bounds,size:640,mode:'A'}).png);
  const close=primaryCases.map(c=>{const center=c.jointPositions[i],localFaces=c.faces.filter(f=>{const p0=[0,1,2].map(k=>(c.rows[i].vertices[f[0]][k]+c.rows[i].vertices[f[1]][k]+c.rows[i].vertices[f[2]][k])/3);return len(sub(p0,center))<.045});if(!localFaces.length)throw Error('No MCP close-up faces for '+c.name);const ids=[...new Set(localFaces.flat())],map=new Map(ids.map((v,k)=>[v,k])),mesh={...p,positions:ids.flatMap(v=>c.rows[i].vertices[v]),indices:localFaces.flatMap(f=>f.map(v=>map.get(v)))};normals(mesh);return {parts:[mesh]}});
  const cb=commonBounds(close,view);
  for(let j=0;j<primaryCases.length;j++)write('v17-index-MCP-'+primaryCases[j].name+'-'+phases[i]+'-'+view+'.png',raster(close[j],{view,bounds:cb,size:640,mode:'A'}).png);
 }
}
const regionRows=[...region].map(([i,r])=>({vertex:i,...r,delta:delta.slice(i*3,i*3+3)}));
write('v17-hand-surface.json',JSON.stringify({joint:mcp.name,parent:parent.name,half,region:regionRows,originalVertices:oldCount,retessellatedVertices:dp.positions.length/3,splitEdges:[...mid],poseMatchDiagnostics,matchedPoseDiagnostics,morphTransfer,cases,oppositionControl:prior.transferB?.find(x=>x.name==='opposition')??null,limitations:['A and B raw poses differ; B-matched, C-matched and D-matched share the same per-joint MakeHuman flexion magnitudes.','D remains a local conforming retessellation control, not a new anatomical ring template.','MCP centre held fixed pending independent evidence of misalignment.','No other digits, scutum or grip qualified.']}));
console.log(JSON.stringify({region:region.size,splitEdges:mid.size,maxCorrectiveMm:Math.max(...regionRows.map(r=>len(r.delta)))*1000,candidates:cases.map(c=>c.name),morphTransfer:morphTransfer.map(x=>({name:x.name,compatible:x.compatible}))}));
