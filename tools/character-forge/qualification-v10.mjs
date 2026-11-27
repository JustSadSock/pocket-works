// Small, isolated qualification probes. No batch sprite production.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {produceRoleV9,roleMorphs} from './roles-v9.mjs';
import {build,pose,poseFrom,deform,rotate,quat,qmul} from './core.mjs';
import {glb} from './glb.mjs';
import {raster,commonBounds,profiles,materialMaps} from './material-study.mjs';
import {normals,weights} from './hybrid-human.mjs';
const out=process.env.CHARACTER_EVIDENCE,read=n=>JSON.parse(readFileSync(join(out,n))),write=(n,v)=>writeFileSync(join(out,n),v),json=(n,v)=>write(n,JSON.stringify(v,null,2)),maps=Object.fromEntries(Object.keys(profiles).map(k=>[k,materialMaps(k,128)]));
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),dist=(a,b)=>Math.hypot(...sub(a,b)),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function posed(m,action='idle',phase=0){const q=structuredClone(m),w=pose(m,action,phase);for(let i=0;i<q.parts.length;i++){q.parts[i].positions=deform(m,m.parts[i],w).flat();normals(q.parts[i])}return {q,w}}
function crop(model,center,r,view,label){const corners=[];for(const x of [-r,r])for(const y of [-r,r])for(const z of [-r,r])corners.push(...add(center,[x,y,z]));const bounds=commonBounds([{parts:[{positions:corners}]}],view);write(label+'.png',raster(model,{view,bounds,size:640,mode:'C',maps}).png)}
function grip(m,w){
 const g=m.gripPose;if(!g)return null;const j=m.joints.find(x=>x.name===g.anchor),v=w[j.id],transform=p=>add(v.p,rotate(v.q,sub(p,j.position))),center=transform(g.handle),axis=rotate(v.q,g.axis),a=add(center,mul(axis,-.057)),b=add(center,mul(axis,.057)),line=sub(b,a),line2=dot(line,line),distance=p=>dist(p,add(a,mul(line,clamp(dot(sub(p,a),line)/line2,0,1))))-g.radius;
 const body=m.parts.filter(p=>p.component==='body'),digits=[];
 for(let k=1;k<=5;k++){const ids=m.joints.filter(x=>x.name.startsWith('finger'+k+'-')&&x.name.endsWith('.L')).map(x=>x.id),samples=[];
 for(const p of body){const verts=deform(m,p,w);for(let i=0;i<verts.length;i++)if(weights(p,i).some(([id,x])=>ids.includes(id)&&x>.45))samples.push(distance(verts[i]))}
 digits.push({finger:k,samples:samples.length,closestSurfaceGapMetres:samples.length?Math.min(...samples.map(Math.abs)):null,insideGripSamples:samples.filter(x=>x<-.002).length});}
 const shield=m.parts.filter(p=>/^(curved Roman scutum|heater shield|scutum )/.test(p.name)),rigid=shield.every(p=>Array.from({length:p.positions.length/3},(_,i)=>i).every(i=>weights(p,i).length===1&&weights(p,i)[0][0]===j.id));
 let maxEdgeChange=0;for(const p of shield){const v=deform(m,p,w);for(let i=0;i<p.indices.length;i+=3)for(let k=0;k<3;k++){let a=p.indices[i+k],b=p.indices[i+(k+1)%3],d=dist(p.positions.slice(a*3,a*3+3),p.positions.slice(b*3,b*3+3));maxEdgeChange=Math.max(maxEdgeChange,Math.abs(d-dist(v[a],v[b])))}}
 if(!rigid||maxEdgeChange>1e-6)throw Error('Rigid shield assembly failed '+g.mode);
 return {method:g.mode,anchor:g.anchor,rigid,maxEdgeChangeMetres:maxEdgeChange,digits,approval:'unreviewed: proximity is not sufficient for a valid grip'};
}
const reports=[];
if(process.env.CHARACTER_V10_ANIMALS!=='1'){
 for(const id of ['artisan','merchant','infantry','legionary']){
  const m=read('v9-'+id+'.model.json'),{q,w}=posed(m),head=m.joints.find(j=>j.name==='head'),left=m.joints.find(j=>j.name==='wrist.L'),right=m.joints.find(j=>j.name==='wrist.R');
  const g=grip(m,w);if(g){const j=m.joints.find(x=>x.name===m.gripPose.anchor),p=w[j.id],center=add(p.p,rotate(p.q,sub(m.gripPose.handle,j.position)));for(const view of ['front','back','three-quarter'])crop(q,center,.14,view,'v10-'+id+'-grip-'+view)}
  crop(q,w[head.id].p,.19,'three-quarter','v10-'+id+'-face');for(const [s,j] of [['L',left],['R',right]])crop(q,w[j.id].p,.15,'three-quarter','v10-'+id+'-hand-'+s);
  reports.push({id,grip:g,parts:m.parts.length,triangles:m.statistics.triangleCount});
 }
 const styles=['low-poly','historical-miniature','anatomical-realism'],styleModels=styles.map(style=>produceRoleV9(read('makehuman-base.json'),'artisan',null,{style})),view='three-quarter',atPhase=.25,models=styleModels.map(m=>posed(m,'walk',atPhase).q),bounds=commonBounds(models,view);
 for(let i=0;i<styles.length;i++){write('v10-style-'+styles[i]+'.glb',glb(styleModels[i]));write('v10-style-'+styles[i]+'.png',raster(models[i],{view,bounds,size:640,mode:'C',maps}).png)}
 json('v10-character-qualification.json',{roles:reports,stylePhase:atPhase,styles:styleModels.map(m=>({style:m.spec.style,lod:m.spec.lod,triangles:m.statistics.triangleCount,joints:m.joints.length})),limits:['No human art approval. Grip distances are measured against actual skinned finger vertices. Anatomical realism is an initial palette/material profile, not yet a full geometry-level art direction.']});
}else{
 for(const [name,recipe,composite] of [['horse','horse',false],['rider','rider',true],['elephant-crew','elephant',true]]){
  const m=build({version:2,recipe,style:'historical-miniature',lod:'medium',anatomy:'v10',motionRevision:'v4',actions:['idle','walk'],composite,modules:composite?['animal-tack']:[]}),dir='v10-'+name+'-motion',frames=[],diagnostics=[];mkdirSync(join(out,dir),{recursive:true});
  for(let i=0;i<=24;i++){const phase=i/24,{q,w}=posed(m,'walk',phase);frames.push(q);diagnostics.push({phase,feet:m.contacts.map(c=>({joint:m.joints[c.joint].name,point:add(w[c.joint].p,rotate(w[c.joint].q,c.local))})),riderSocket:m.sockets.find(s=>s.name==='seat')??null})}
  const bounds=commonBounds(frames,'side');for(let i=0;i<frames.length;i++)write(dir+'/'+String(i).padStart(2,'0')+'.png',raster(frames[i],{view:'side',bounds,size:512,mode:'A',groundLine:true}).png);
  write('v10-'+name+'.glb',glb(m));json('v10-'+name+'-spec.json',m.spec);json('v10-'+name+'-diagnostics.json',{frames:diagnostics,modules:m.modules,approval:'unreviewed',note:'Native geometry probe; source elephant remains separate. Contact positions are anchors, not actual skin-contact verification.'});
 }
}
