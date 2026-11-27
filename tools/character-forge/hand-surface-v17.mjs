// Local index-PIP study. No change to Character Core or normal production GLB.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {poseFrom,deform,rotate} from './core.mjs';
import {normals,weights} from './hybrid-human.mjs';
import {raster,commonBounds} from './material-study.mjs';
import {glb} from './glb.mjs';
const out=process.env.CHARACTER_EVIDENCE,read=n=>JSON.parse(readFileSync(join(out,n))),write=(n,v)=>writeFileSync(join(out,n),v);
const source=read('morph/makehuman-base.json'),a=read('morph/v15-hand-core.json'),b=read('v16-hand-transfer.json'),prior=read('v16-hand-audit.json');
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len=a=>Math.hypot(...a),unit=a=>mul(a,1/Math.max(1e-12,len(a))),clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const mix=(a,b,t)=>add(mul(a,1-t),mul(b,t)),J=n=>source.joints.find(j=>j.name===n+'.L');
const mcp=J('finger2-1'),pip=J('finger2-2'),dip=J('finger2-3');
if(!mcp||!pip||!dip)throw Error('Missing index anatomy');
const model=structuredClone(source),p=model.parts[0],axis=unit(sub(dip.position,mcp.position)),half=Math.min(len(sub(pip.position,mcp.position)),len(sub(dip.position,pip.position)))*.45;
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
 const w=getW(p,i),lookup=new Map(w),pair=(lookup.get(mcp.id)??0)+(lookup.get(pip.id)??0),x=dot(sub(restP(i),pip.position),axis);
 if(pair<.8||Math.abs(x)>=half)continue;
 const influence=smooth(1-Math.abs(x)/half),t=smooth((x+half)/(2*half));
 const old=lookup.get(pip.id)??0,updated=old*(1-influence*.65)+pair*t*influence*.65;
 lookup.set(pip.id,updated);lookup.set(mcp.id,pair-updated);setW(p,i,[...lookup]);region.set(i,{x,influence,pair});
}
if(region.size<4)throw Error('Insufficient local PIP vertices');
const phases=[0,.25,.5,.75,1],names=['open','index-0.25','index-0.5','index-0.75','index-1'];
const brot=names.map(n=>{const r=b.rows.find(r=>r.name===n);if(!r)throw Error(n);return r.rotations});
const ar=names.map(n=>{const r=a.rows.find(r=>r.name===(n==='open'?'rest':n));if(!r)throw Error(n);return r.coreRotations});
const w=poseFrom(model,brot.at(-1)),actual=deform(model,p,w),delta=Array(p.positions.length).fill(0);
function normq(q){return mul(q,1/Math.max(1e-12,len(q)))}
function inverseCols(cols,y){const [a,b,c]=cols,d=dot(a,cross(b,c));if(Math.abs(d)<1e-6)return null;return [dot(y,cross(b,c)),dot(y,cross(c,a)),dot(y,cross(a,b))].map(x=>x/d)}
for(const [i,r] of region){
 const point=restP(i),inf=getW(p,i),pair=r.pair,t=(inf.find(x=>x[0]===pip.id)?.[1]??0)/pair;
 const qa=w[mcp.id].q,qb=w[pip.id].q,rigid=normq(mix(qa,dot(qa,qb)<0?mul(qb,-1):qb,t));
 // Blend about the shared physical joint centre, not a radial thickness shrink.
 const pivot=w[pip.id].p,rigidPoint=add(pivot,rotate(rigid,sub(point,pip.position)));
 const rigidA=add(w[mcp.id].p,rotate(qa,sub(point,mcp.position))),rigidB=add(w[pip.id].p,rotate(qb,sub(point,pip.position)));
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
 const opt=deltas?{researchMorph:{deltas:Object.fromEntries(c.parts.map((p,i)=>[p.name,i===0?deltas:Array(p.positions.length).fill(0)])),weights:activation}}:{};
 write('v17-hand-'+name+'.glb',glb(c,opt));return {name,rest,faces,rows,indices,activation:deltas?activation:null};
}
const cases=[candidate('A',source,ar,a.selected,a.faces),candidate('B',source,brot,a.selected,a.faces),candidate('C',model,brot,a.selected,a.faces,delta),candidate('D',D,brot,dsel,df,dd)];
for(const i of [0,2,4]){
 const meshes=cases.map(c=>{const m={...p,positions:c.rows[i].vertices.flat(),indices:c.faces.flat()};normals(m);return {parts:[m]}});
 for(const view of ['front','side','three-quarter']){
  const bounds=commonBounds(meshes,view);
  for(let j=0;j<cases.length;j++)write('v17-hand-'+cases[j].name+'-'+phases[i]+'-'+view+'.png',raster(meshes[j],{view,bounds,size:640,mode:'A'}).png);
 }
}
const regionRows=[...region].map(([i,r])=>({vertex:i,...r,delta:delta.slice(i*3,i*3+3)}));
write('v17-hand-surface.json',JSON.stringify({joint:pip.name,half,region:regionRows,originalVertices:oldCount,retessellatedVertices:dp.positions.length/3,splitEdges:[...mid],cases,oppositionControl:prior.transferB?.find(x=>x.name==='opposition')??null,limitations:['D is a local conforming retessellation control, not a new anatomical ring template.','Joint centre held fixed pending independent evidence of misalignment.','No other digits, morphs or grip qualified.']}));
console.log(JSON.stringify({region:region.size,splitEdges:mid.size,maxCorrectiveMm:Math.max(...regionRows.map(r=>len(r.delta)))*1000,candidates:cases.map(c=>c.name)}));
