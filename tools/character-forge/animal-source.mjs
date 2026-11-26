import {readFileSync,writeFileSync} from 'node:fs';import {join} from 'node:path';import {build} from './core.mjs';import {part,push,normals} from './hybrid-human.mjs';import {glb} from './glb.mjs';import {preview} from './preview.mjs';import {resolveProfile} from './morphology.mjs';
const out=process.env.CHARACTER_EVIDENCE,reg=JSON.parse(readFileSync(new URL('animal-morphs.json',import.meta.url))),provenance=JSON.parse(readFileSync(join(out,'animal-source-provenance.json'))),report=[];
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),norm=a=>Math.hypot(...a);
const bounds=parts=>parts.reduce((b,p)=>{for(let i=0;i<p.positions.length;i++) {let k=i%3;b[k][0]=Math.min(b[k][0],p.positions[i]);b[k][1]=Math.max(b[k][1],p.positions[i])}return b},[[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]]);
function bind(v,m){let hits=[];for(let j of m.joints){if(j.parent<0)continue;let a=m.joints[j.parent].position,b=j.position,d=sub(b,a),t=clamp(dot(sub(v,a),d)/Math.max(1e-9,dot(d,d)),0,1),dist=norm(sub(v,add(a,mul(d,t))));hits.push({j:j.id,parent:j.parent,t,dist})}hits.sort((a,b)=>a.dist-b.dist);let ws=[];for(let h of hits.slice(0,3)){let w=1/Math.max(.025,h.dist)**3;ws.push([h.j,w*h.t],[h.parent,w*(1-h.t)])}return ws}
for(let family of ['horse','elephant']){
 let source=JSON.parse(readFileSync(join(out,'animal-source-'+family+'.json'))),baseBounds=bounds(source.parts),base=build({...resolveProfile(reg,family,'base'),anatomy:'v4'}),targetBounds=bounds(base.parts);
 for(let name of ['base',family==='horse'?'draft':'massive',family==='horse'?'courser':'light']){
  let spec={...resolveProfile(reg,family,name),anatomy:'v4'},m=build(spec),bb=bounds(m.parts),t=performance.now();m.parts=source.parts.map(src=>{let p=part(src.name,src.color,'body');for(let i=0;i<src.positions.length;i+=3){let v=src.positions.slice(i,i+3),u=v.map((x,k)=>(x-baseBounds[k][0])/Math.max(1e-7,baseBounds[k][1]-baseBounds[k][0])),q=u.map((x,k)=>bb[k][0]+x*(bb[k][1]-bb[k][0])); // nonuniform anatomical template warp, continuous source topology
    let height=u[1],front=u[2],chest=spec.morphology.chest??1,neck=spec.morphology.neck??1;
    q[0]*=1+(chest-1)*Math.max(0,1-Math.abs(front-.5)*3)*Math.max(0,1-Math.abs(height-.62)*3);
    q[1]+=((neck-1)*.12*spec.morphology.height)*Math.max(0,(front-.6)/.4)*Math.max(0,(height-.55)/.45);
    push(p,q,bind(q,m))}p.indices=src.indices.slice();return normals(p)});
  m.spec.provenance=[provenance[family]];m.spec.sourceAdapter='experimental nearest-segment skinning of decimated CC0 mesh';m.spec.budget.maxBytes=32000000;m.statistics={triangleCount:m.parts.reduce((n,p)=>n+p.indices.length/3,0),vertices:m.parts.reduce((n,p)=>n+p.positions.length/3,0),joints:m.joints.length};
  let key='source-'+family+'-'+name;writeFileSync(join(out,key+'.glb'),glb(m));writeFileSync(join(out,key+'.spec.json'),JSON.stringify(m.spec,null,2));for(let view of ['front','side','three-quarter'])writeFileSync(join(out,key+'-'+view+'.svg'),preview(m,{view,neutral:true,rotations:m.joints.map(()=>[0,0,0,1])}).svg);
  report.push({family,name,...m.statistics,fitMs:performance.now()-t,sourceTriangles:source.originalTriangles,sourceSimplified:source.simplifiedTriangles,bounds:bb,orientation:{axis:source.forwardAxis,sign:source.forwardSign,scores:source.orientationScores}})
 }
}
writeFileSync(join(out,'animal-source-study.json'),JSON.stringify({report,limitations:'Original source geometry retained; candidate shape uses bounded template deformation and approximate nearest-segment skinning. No source-derived animation acceptance or calibrated anatomical rig.'},null,2));console.log(JSON.stringify(report));
