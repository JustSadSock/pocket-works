import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {join} from 'node:path';import {build,pose,deform} from './core.mjs';import {part,push,normals,weights} from './hybrid-human.mjs';import {glb} from './glb.mjs';import {preview} from './preview.mjs';import {raster,commonBounds} from './material-study.mjs';import {resolveProfile} from './morphology.mjs';
import {repairElephant} from './elephant-strain-v7.mjs';
import {segmentElephant} from './elephant-segment-v8.mjs';
const out=process.env.CHARACTER_EVIDENCE,reg=JSON.parse(readFileSync(new URL('animal-morphs.json',import.meta.url))),provenance=JSON.parse(readFileSync(join(out,'animal-source-provenance.json'))),report=[];
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),norm=a=>Math.hypot(...a);
const bounds=parts=>parts.reduce((b,p)=>{for(let i=0;i<p.positions.length;i++) {let k=i%3;b[k][0]=Math.min(b[k][0],p.positions[i]);b[k][1]=Math.max(b[k][1],p.positions[i])}return b},[[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]]);
function attachSurfaceContacts(m){
 const H=m.spec.morphology.height,rows=[];
 for(const c of m.contacts){const j=m.joints[c.joint],candidates=[];
  for(const p of m.parts)for(let i=0;i<p.positions.length/3;i++){
   const w=weights(p,i).reduce((a,[id,x])=>a+(id===c.joint?x:0),0);if(w<.10)continue;
   const v=p.positions.slice(i*3,i*3+3);if(norm(sub(v,j.position))<H*.17)candidates.push({v,w,part:p.name,index:i});
  }
  if(!candidates.length)throw Error('No source surface vertices bound to '+j.name);
  const low=Math.min(...candidates.map(x=>x.v[1])),sole=candidates.filter(x=>x.v[1]<=low+H*.012);
  if(sole.length<3)throw Error('Insufficient actual sole samples for '+j.name);
  const center=sole.reduce((a,x)=>a.map((v,k)=>v+x.v[k]/sole.length),[0,0,0]);
  rows.push({c,j,center,low,sole});
 }
 const ground=Math.min(...rows.map(x=>x.low));
 for(const x of rows){x.c.local=sub(x.center,x.j.position);x.c.groundY=ground;x.c.surfaceContact=true;x.c.surfaceVertexCount=x.sole.length;x.c.sourceParts=[...new Set(x.sole.map(v=>v.part))]}
 m.spec.groundY=ground;m.spec.gaitDuty=.76;m.spec.gaitStride=H*.105;m.spec.swingHeight=.045;
 return {ground,feet:rows.map(x=>({joint:x.j.name,vertices:x.sole.length,groundY:x.low,contactLocal:x.c.local,parts:x.c.sourceParts}))};
}
function bind(v,m){let hits=[];for(let j of m.joints){if(j.parent<0)continue;let a=m.joints[j.parent].position,b=j.position,d=sub(b,a),t=clamp(dot(sub(v,a),d)/Math.max(1e-9,dot(d,d)),0,1),dist=norm(sub(v,add(a,mul(d,t))));hits.push({j:j.id,parent:j.parent,t,dist})}hits.sort((a,b)=>a.dist-b.dist);let ws=[];for(let h of hits.slice(0,3)){let w=1/Math.max(.025,h.dist)**3;ws.push([h.j,w*h.t],[h.parent,w*(1-h.t)])}return ws}
// V6: retain the source surface exactly. Smooth semantic chain weights
// on source adjacency, rather than blending arbitrary nearest bones from
// opposite limbs. The source-v5 candidate remains the measured control.
function elephantRebind(model){
 const candidate=structuredClone(model),joint=model.joints,groups=new Map();
 for(const j of joint){
   if(j.parent<0)continue;
   const key=/^(fore[LR]|hind[LR])-/.exec(j.name)?.[1]??(j.name.startsWith('trunk-')?'trunk':j.name.startsWith('tail-')?'tail':'body');
   if(!groups.has(key))groups.set(key,[]);groups.get(key).push(j);
 }
 function closest(v,list){
   return list.map(j=>{let a=joint[j.parent].position,b=j.position,d=sub(b,a),t=clamp(dot(sub(v,a),d)/Math.max(1e-9,dot(d,d)),0,1);return {j,parent:j.parent,t,dist:norm(sub(v,add(a,mul(d,t))))}}).sort((a,b)=>a.dist-b.dist);
 }
 for(let p of candidate.parts){
   const n=p.positions.length/3,adj=Array.from({length:n},()=>new Set()),maps=[],regions=[];
   for(let i=0;i<p.indices.length;i+=3)for(let k=0;k<3;k++){let a=p.indices[i+k],b=p.indices[i+(k+1)%3];adj[a].add(b);adj[b].add(a)}
   for(let i=0;i<n;i++){
     const v=p.positions.slice(3*i,3*i+3),side=v[0]<0?'L':'R',body=closest(v,groups.get('body')??[]),rank=[...groups].filter(([k])=>k==='body'||k==='trunk'||k==='tail'||k.endsWith(side)).map(([k,js])=>({k,h:closest(v,js)})).filter(x=>x.h.length).sort((a,b)=>a.h[0].dist-b.h[0].dist);
     const best=rank[0],allowed=best.k==='body'?[best]:[best,{k:'body',h:body}],raw=new Map();
     for(const {k,h} of allowed)for(const x of h.slice(0,k===best.k?2:1)){
       const a=1/Math.max(.045,x.dist)**2;
       raw.set(x.j.id,(raw.get(x.j.id)||0)+a*x.t);
       raw.set(x.parent,(raw.get(x.parent)||0)+a*(1-x.t));
     }
     const total=[...raw.values()].reduce((a,b)=>a+b,0);maps.push(new Map([...raw].map(([j,w])=>[j,w/total])));regions.push(best.k);
   }
   let sm=maps;
   for(let pass=0;pass<3;pass++)sm=sm.map((m,i)=>{
     const next=new Map([...m].map(([j,w])=>[j,w*.55])),neighbors=[...adj[i]].filter(j=>regions[j]===regions[i]||regions[j]==='body'||regions[i]==='body');
     if(!neighbors.length)return m;
     for(const j of neighbors)for(const [bone,w] of sm[j])next.set(bone,(next.get(bone)||0)+w*.45/neighbors.length);
     return next;
   });
   const q=part(p.name,p.color,'body');
   for(let i=0;i<n;i++)push(q,p.positions.slice(3*i,3*i+3),[...sm[i]]);
   q.indices=p.indices.slice();Object.assign(p,q);normals(p);
 }
 candidate.spec.sourceAdapter='V6 same surface, side-specific chain binding and local adjacency smoothing; unapproved';
 return candidate;
}
let compositeSource=null;
for(let family of process.env.CHARACTER_V9_FOCUS==='1'?['elephant']:['horse','elephant']){
 let source=JSON.parse(readFileSync(join(out,'animal-source-'+family+'.json'))),baseBounds=bounds(source.parts),base=build({...resolveProfile(reg,family,'base'),anatomy:family==='elephant'?'v10':'v4'}),targetBounds=bounds(base.parts);
 for(let name of ['base',family==='horse'?'draft':'massive',family==='horse'?'courser':'light']){
  let spec={...resolveProfile(reg,family,name),anatomy:family==='elephant'?'v10':'v4'},m=build(spec),bb=bounds(m.parts),t=performance.now();m.parts=source.parts.map(src=>{let p=part(src.name,src.color,'body');for(let i=0;i<src.positions.length;i+=3){let v=src.positions.slice(i,i+3),u=v.map((x,k)=>(x-baseBounds[k][0])/Math.max(1e-7,baseBounds[k][1]-baseBounds[k][0])),q=u.map((x,k)=>bb[k][0]+x*(bb[k][1]-bb[k][0])); // nonuniform anatomical template warp, continuous source topology
    let height=u[1],front=u[2],chest=spec.morphology.chest??1,neck=spec.morphology.neck??1;
    q[0]*=1+(chest-1)*Math.max(0,1-Math.abs(front-.5)*3)*Math.max(0,1-Math.abs(height-.62)*3);
    q[1]+=((neck-1)*.12*spec.morphology.height)*Math.max(0,(front-.6)/.4)*Math.max(0,(height-.55)/.45);
    push(p,q,bind(q,m))}p.indices=src.indices.slice();return normals(p)});
  m.spec.provenance=[provenance[family]];m.spec.sourceAdapter='experimental nearest-segment skinning of decimated CC0 mesh';m.spec.budget.maxBytes=32000000;if(family==='elephant'){m.spec.motionRevision='v9';m.spec.contactCorrection='path-v9';m.spec.style='low-poly';m.surfaceContacts=attachSurfaceContacts(m)}m.statistics={triangleCount:m.parts.reduce((n,p)=>n+p.indices.length/3,0),vertices:m.parts.reduce((n,p)=>n+p.positions.length/3,0),joints:m.joints.length};
  let key='source-'+family+'-'+name;writeFileSync(join(out,key+'.glb'),glb(m));writeFileSync(join(out,key+'.spec.json'),JSON.stringify(m.spec,null,2));for(let view of ['front','side','three-quarter'])writeFileSync(join(out,key+'-'+view+'.svg'),preview(m,{view,neutral:true,rotations:m.joints.map(()=>[0,0,0,1])}).svg);
  if(family==='elephant'&&process.env.CHARACTER_V9_FOCUS==='1'){
    const r=segmentElephant(m,{name,out,write:(file,data)=>writeFileSync(join(out,file),data)});
    writeFileSync(join(out,'source-v9-elephant-'+name+'-segmentation.json'),JSON.stringify(r.report,null,2));
    writeFileSync(join(out,'source-v9-elephant-'+name+'-segmented.glb'),glb(r.model));
    if(name==='base'){writeFileSync(join(out,'source-v9-elephant-active.glb'),glb(r.active));writeFileSync(join(out,'source-v10-elephant-active.model.json'),JSON.stringify(r.active));;if(process.env.CHARACTER_V12_COMPOSITE==='1')compositeSource=r.active;}
    console.log(JSON.stringify({name,surfaceContacts:m.surfaceContacts,before:r.report.before,after:r.report.after,forbidden:r.report.forbidden,accepted:r.report.approvedTechnical,selectedConfig:r.report.selectedConfig}));
  }else if(family==='elephant'){
    // Keep B's original source topology; C is a bounded, procedural
    // proportion study of the same fitted anatomical base, not another asset.
    const native=build(spec),candidate=structuredClone(m),H=bb[1][1]-bb[1][0],mid=(bb[2][0]+bb[2][1])/2;
    const warp=v=>{const y=(v[1]-bb[1][0])/H,z=(v[2]-mid)/(bb[2][1]-bb[2][0]),head=clamp((z-.12)*4,0,1)*clamp((y-.36)*3,0,1),mass=clamp((y-.25)*2,0,1)*(1-head);return [v[0]*(1+.10*mass+.17*head),bb[1][0]+(v[1]-bb[1][0])*(.93+.07*head),mid+(v[2]-mid)*(1+.08*head)]};
    for(const j of candidate.joints)j.position=warp(j.position);
    for(const j of candidate.joints)if(j.parent>=0)j.local=sub(j.position,candidate.joints[j.parent].position);
    candidate.spec.style='low-poly';candidate.spec.sourceAdapter='V5 bounded stylized proportions on source topology; unapproved';
    candidate.parts=m.parts.map(src=>{let p=part(src.name,src.color,'body');for(let i=0;i<src.positions.length;i+=3){let q=warp(src.positions.slice(i,i+3));push(p,q,bind(q,candidate))}p.indices=src.indices.slice();return normals(p)});
    const recovered=elephantRebind(m),repair=repairElephant(m,recovered,{render:name==='base',write:(file,data)=>writeFileSync(join(out,file),data)});
    writeFileSync(join(out,'source-v7-elephant-'+name+'-strain.json'),JSON.stringify(repair.report,null,2));
    if(name==='base')writeFileSync(join(out,'source-v7-elephant-local.glb'),glb(repair.model));
    const set=[['native',native],['source',m],['rebound',recovered]],rest=x=>x.joints.map(()=>[0,0,0,1]),diag=[];
    for(const [label,x] of set){
      const stem='source-v5-elephant-'+name+'-'+label;
      if(label==='rebound')writeFileSync(join(out,stem+'.glb'),glb(x));
      for(const view of ['front','side','three-quarter'])if(name==='base')writeFileSync(join(out,stem+'-'+view+'.svg'),preview(x,{view,neutral:true,rotations:rest(x)}).svg);
      for(const phase of [0,.25,.5,.75]){
        const w=pose(x,'walk',phase),ratios=[];
        for(const p of x.parts){const v=deform(x,p,w);for(let i=0;i<p.indices.length;i+=3)for(let k=0;k<3;k++){const a=p.indices[i+k],b=p.indices[i+(k+1)%3],d=norm(sub(p.positions.slice(3*a,3*a+3),p.positions.slice(3*b,3*b+3)));if(d>1e-5)ratios.push(norm(sub(v[a],v[b]))/d)}}
        ratios.sort((a,b)=>a-b);diag.push({label,phase,edgeSamples:ratios.length,stretchP95:ratios[Math.floor((ratios.length-1)*.95)],max:ratios.at(-1),collapsed:ratios.filter(r=>r<.5).length});
        if(name==='base'&&label!=='native')writeFileSync(join(out,stem+'-walk-'+phase+'.svg'),preview(x,{view:'side',action:'walk',phase,neutral:true}).svg);
      }
    }
    writeFileSync(join(out,'source-v5-elephant-'+name+'-diagnostics.json'),JSON.stringify({name,provenance:provenance[family],diagnostics:diag,note:'Comparative edge strain; not proof of correct anatomical binding. Source variants remain isolated.'},null,2));
  }
  report.push({family,name,...m.statistics,fitMs:performance.now()-t,sourceTriangles:source.originalTriangles,sourceSimplified:source.simplifiedTriangles,bounds:bb,orientation:{axis:source.forwardAxis,sign:source.forwardSign,scores:source.orientationScores}})
 }
}
writeFileSync(join(out,'animal-source-study.json'),JSON.stringify({report,limitations:'Original source geometry retained; candidate shape uses bounded template deformation and approximate nearest-segment skinning. No source-derived animation acceptance or calibrated anatomical rig.'},null,2));console.log(JSON.stringify(report));

if(compositeSource)compositionProbe(compositeSource);
function compositionProbe(source){
 // Source geometry was fitted on the historical-miniature rig, then its
 // presentation style was set to low-poly. Reconstruct the ORIGINAL rig style.
 const native=build({...source.spec,style:reg.defaults.style,composite:true,modules:['animal-tack']}),n=source.joints.length;
 const mismatches=source.joints.map((j,i)=>({name:j.name,native:native.joints[i]?.name,parent:j.parent,nativeParent:native.joints[i]?.parent,distance:native.joints[i]?norm(sub(native.joints[i].position,j.position)):null})).filter(j=>j.name!==j.native||j.parent!==j.nativeParent||j.distance===null||j.distance>=1e-8);writeFileSync(join(out,'v12-elephant-rig-agreement.json'),JSON.stringify({expected:n,matched:n-mismatches.length,originalBuildStyle:reg.defaults.style,sourcePresentationStyle:source.spec.style,mismatches},null,2));if(mismatches.length)throw Error('Source composite shared rig mismatch: '+JSON.stringify(mismatches.slice(0,3)));
 const equipment=native.parts.filter(p=>/^(saddle |howdah |tack )/.test(p.name)||Array.from({length:p.positions.length/3},(_,i)=>weights(p,i)).some(ws=>ws.some(([j])=>j>=n)));
 if(!equipment.some(p=>p.name.includes('howdah floor'))||!equipment.some(p=>p.name.startsWith('tack')))throw Error('Missing composite modules');
 const m=structuredClone(native);m.parts=[...structuredClone(source.parts),...structuredClone(equipment)];m.modules=m.parts.map(p=>({part:p.name,kind:p.component,binding:p.binding,slot:p.slot??null}));m.contacts=structuredClone(source.contacts);m.surfaceContacts=structuredClone(source.surfaceContacts);m.spec={...native.spec,...source.spec,composite:true,modules:['animal-tack']};m.spec.sourceAdapter+=' + existing Native equipment and crew, experimental fit';m.statistics={triangleCount:m.parts.reduce((a,p)=>a+p.indices.length/3,0),vertices:m.parts.reduce((a,p)=>a+p.positions.length/3,0),joints:m.joints.length};
 const skinIndex=source.parts.findIndex(p=>p.name.includes('Continuous anatomical skin')),floorIndex=m.parts.findIndex(p=>p.name==='howdah floor'),blanketIndex=m.parts.findIndex(p=>p.name==='saddle blanket'),seat=m.joints.find(j=>j.name==='saddle');if(skinIndex<0||floorIndex<0||blanketIndex<0||!seat)throw Error('Composition markers');
 function topAt(p,x,z){let best=-Infinity;for(let i=0;i<p.indices.length;i+=3){const [a,b,c]=p.indices.slice(i,i+3).map(j=>p.positions.slice(3*j,3*j+3)),d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(d)<1e-9)continue;const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d;if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)best=Math.max(best,u*a[1]+v*b[1]+(1-u-v)*c[1])}return Number.isFinite(best)?best:null}
 function measure(q){const skin=q.parts[skinIndex],blanket=q.parts[blanketIndex],v=Array.from({length:blanket.positions.length/3},(_,i)=>blanket.positions.slice(i*3,i*3+3)),min=Math.min(...v.map(p=>p[1])),bottom=v.filter(p=>p[1]<min+.035),gaps=bottom.map(p=>{const y=topAt(skin,p[0],p[2]);return y===null?null:p[1]-y}).filter(x=>x!==null);return {samples:gaps.length,minGap:gaps.length?Math.min(...gaps):null,maxGap:gaps.length?Math.max(...gaps):null,meanGap:gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:null}}
 const before=measure(m),shift=before.minGap===null?0:clamp(.008-before.minGap,-.15,.15);
 // Shift only the independent saddle/crew subtree. Keep source body and
 // root-bound girths unchanged; their fit is measured, never asserted.
 for(const j of m.joints.slice(n))j.position[1]+=shift;
 for(const j of m.joints.slice(n))j.local=j.parent<0?j.position.slice():sub(j.position,m.joints[j.parent].position);
 for(const p of m.parts.slice(source.parts.length))if(!p.name.startsWith('tack girth'))for(let i=1;i<p.positions.length;i+=3)p.positions[i]+=shift;
 const frames=[],rows=[],dir='v12-elephant-source-crew';mkdirSync(join(out,dir),{recursive:true});
 for(let i=0;i<=12;i++){const phase=i/12,w=pose(m,'walk',phase),q=structuredClone(m);for(let j=0;j<q.parts.length;j++){q.parts[j].positions=deform(m,m.parts[j],w).flat();normals(q.parts[j])}frames.push(q);rows.push({phase,saddle:measure(q),seat:w[seat.id].p,crew:w[m.joints.find(j=>j.name.startsWith('crew/')&&j.role==='pelvis').id].p})}
 const bounds=commonBounds(frames,'side');for(let i=0;i<frames.length;i++)writeFileSync(join(out,dir,String(i).padStart(2,'0')+'.png'),raster(frames[i],{view:'side',size:640,bounds}).png);
 writeFileSync(join(out,'v12-elephant-source-crew-three-quarter.png'),raster(frames[0],{view:'three-quarter',size:768}).png);
 writeFileSync(join(out,'v12-elephant-source-crew.glb'),glb(m));writeFileSync(join(out,'v12-elephant-source-crew.json'),JSON.stringify({sharedJoints:n,sourceGeometryUnchanged:source.parts.every((p,i)=>JSON.stringify(p.positions)===JSON.stringify(m.parts[i].positions)&&JSON.stringify(p.indices)===JSON.stringify(m.parts[i].indices)),equipmentParts:equipment.map(p=>p.name),before,seatHeightCorrection:shift,after:measure(m),frames:rows,approval:false,limitations:'Vertical saddle clearance samples only; girth attachment and complete collision audit not yet accepted.'},null,2));
}
