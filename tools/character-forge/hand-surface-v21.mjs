// Deterministic bounded pose-space correction on the existing eight-weight skin.
// Optimize the same five matched phases; the first three have zero morph activation.
import {poseFrom,deform,rotate} from './core.mjs';
import {weights} from './hybrid-human.mjs';
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len=a=>Math.hypot(...a);
const area=(a,b,c)=>len(cross(sub(b,a),sub(c,a)))*.5;
const centroid=a=>mul(a.reduce((s,v)=>add(s,v),[0,0,0]),1/a.length);
const volume=(vs,faces,o)=>faces.reduce((s,[a,b,c])=>s+dot(sub(vs[a],o),cross(sub(vs[b],o),sub(vs[c],o)))/6,0);
export function optimizeSurface(model,rotations,activation,baseDelta,region,kind){
 if(!['C-area','C-volume','C-combined'].includes(kind))throw Error(kind);
 const part=model.parts[0],movable=[...region.keys()].sort((a,b)=>a-b),set=new Set(movable),globalFaces=[];
 for(let k=0;k<part.indices.length;k+=3){const f=part.indices.slice(k,k+3);if(f.some(i=>set.has(i)))globalFaces.push(f);}
 const globalIds=[...new Set(globalFaces.flat())],map=new Map(globalIds.map((x,i)=>[x,i])),faces=globalFaces.map(f=>f.map(x=>map.get(x))),rest=globalIds.map(i=>part.positions.slice(i*3,i*3+3));
 const boundary=globalIds.filter(i=>!set.has(i)).map(i=>map.get(i));
 if(boundary.length<3)throw Error('Local patch must have fixed boundary');
 // Boundary caps are defined as triangles to a fixed boundary centroid. Their
 // tetrahedral contribution about that centroid is zero. This is a local
 // capped-patch volume, not a full hand or finger volume.
 const edgeCounts=new Map();
 for(const f of faces)for(let k=0;k<3;k++){const a=f[k],b=f[(k+1)%3],key=Math.min(a,b)+':'+Math.max(a,b);edgeCounts.set(key,(edgeCounts.get(key)??0)+1);}
 for(const [key,n] of edgeCounts)if(n===1&&key.split(':').some(x=>set.has(globalIds[+x])))throw Error('Movable local patch boundary is not closed');
 const restA=faces.map(f=>area(...f.map(i=>rest[i]))),restCenter=centroid(boundary.map(i=>rest[i])),restVol=volume(rest,faces,restCenter);
 if(restA.some(x=>x<=1e-12)||Math.abs(restVol)<1e-12)throw Error('Degenerate rest local patch');
 const phases=rotations.map((qs,j)=>{
  const w=poseFrom(model,qs),morph={...part,positions:part.positions.map((x,k)=>x+baseDelta[k]*activation[j])},base=deform(model,morph,w),v=globalIds.map(i=>base[i]);
  const matrices=movable.map(i=>[[1,0,0],[0,1,0],[0,0,1]].map(e=>weights(part,i).reduce((s,[id,wt])=>add(s,mul(rotate(w[id].q,e),wt*activation[j])),[0,0,0])));
  return {v,matrices,center:centroid(boundary.map(i=>v[i])),activation:activation[j]};
 });
 const extra=movable.map(()=>[0,0,0]),limit=.002;
 function objective(){
  let areaLoss=0,volumeLoss=0,silhouetteLoss=0,count=0;const metrics=[];
  for(const phase of phases){
   const vs=phase.v.map(x=>x.slice());
   for(let j=0;j<movable.length;j++){const i=map.get(movable[j]),m=phase.matrices[j];vs[i]=add(vs[i],m.reduce((s,col,k)=>add(s,mul(col,extra[j][k])),[0,0,0]));}
   const ratios=faces.map((f,i)=>area(...f.map(k=>vs[k]))/restA[i]);
   const vr=volume(vs,faces,phase.center)/restVol;
   const displacement=Math.max(...movable.map(i=>len(sub(vs[map.get(i)],phase.v[map.get(i)]))));
   metrics.push({areaMin:Math.min(...ratios),areaMean:ratios.reduce((s,x)=>s+x,0)/ratios.length,volumeRatio:vr,maxPosedDisplacementMm:displacement*1000});
   if(!phase.activation)continue;
   areaLoss+=ratios.reduce((s,r)=>s+Math.log(Math.max(r,.0001))**2+4*Math.max(0,.267-r)**2,0)/ratios.length;
   volumeLoss+=(vr-1)**2;
   silhouetteLoss+=movable.reduce((s,i)=>s+len(sub(vs[map.get(i)],phase.v[map.get(i)]))**2/limit**2,0)/movable.length;count++;
  }
  const aw=kind==='C-volume'?0:1,vw=kind==='C-area'?0:1;
  return {loss:(aw*areaLoss+vw*volumeLoss+.08*silhouetteLoss)/Math.max(1,count),metrics};
 }
 const before=objective();let best=before.loss;let accepted=0;
 // Coordinate search with decreasing bounded displacement; no topology or
 // weight changes. Candidate is not selected on this objective alone.
 for(const step of [.0005,.00025,.000125,.0000625]){
  for(let i=0;i<extra.length;i++)for(let k=0;k<3;k++){
   const old=extra[i][k];let chosen=old;
   for(const sign of [-1,1]){
    extra[i][k]=old+sign*step;if(len(extra[i])>limit)continue;
    const value=objective().loss;if(Number.isFinite(value)&&value<best-1e-10){best=value;chosen=extra[i][k];accepted++;}
   }
   extra[i][k]=chosen;
  }
 }
 const after=objective(),delta=baseDelta.slice();
 for(let i=0;i<movable.length;i++)for(let k=0;k<3;k++)delta[3*movable[i]+k]+=extra[i][k];
 if(!delta.every(Number.isFinite)||after.loss>before.loss+1e-9)throw Error('Invalid corrective optimizer result');
 return {delta,report:{kind,objectiveBefore:before.loss,objectiveAfter:after.loss,before:before.metrics,after:after.metrics,acceptedMoves:accepted,regionVertices:movable.length,patchTriangles:faces.length,restCappedPatchVolumeM3:restVol,maxAdditionalRestDisplacementMm:Math.max(...extra.map(len))*1000,topologyUnchanged:true,weightsUnchanged:true,artApproved:false}};
}
