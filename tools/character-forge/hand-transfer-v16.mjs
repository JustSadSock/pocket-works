// v16: source-authored joint transfer, isolated research; no global skinning changes.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {poseFrom,deform,qmul,rotate} from './core.mjs';
import {normals} from './hybrid-human.mjs';
import {raster,commonBounds} from './material-study.mjs';
import {glb} from './glb.mjs';
const out=process.env.CHARACTER_EVIDENCE,read=n=>JSON.parse(readFileSync(join(out,n))),write=(n,v)=>writeFileSync(join(out,n),v),json=(n,v)=>write(n,JSON.stringify(v));
const m=read('morph/makehuman-base.json'),p=m.parts[0],a=read('morph/v15-hand-core.json'),ref=read('v15-reference-poses.json'),rest=ref.poses.find(x=>x.name==='open').transfer;
const I=[0,0,0,1],sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),mul=(a,s)=>a.map(x=>x*s),add=(a,b)=>a.map((x,i)=>x+b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>{const n=Math.hypot(...a);if(n<1e-9)throw Error('Degenerate anatomical frame');return mul(a,1/n)},inv=q=>[-q[0],-q[1],-q[2],q[3]],J=n=>{const j=m.joints.find(j=>j.name===n+'.L');if(!j)throw Error('Missing target '+n);return j};
const digits=['Thumb','Index','Middle','Ring','Little'],S=(d,s)=>{const n=d+'_'+s+'_L';if(!rest[n])throw Error('Missing source '+n);return n};
const sc=n=>rest[n].center,tc=n=>J(n).position;
const frame=(along,normal)=>{const y=unit(along),z=unit(sub(normal,mul(y,dot(y,normal)))),x=unit(cross(y,z));return [x,y,z]};
const sn=unit(cross(sub(sc(S('Little','Proximal')),sc(S('Index','Proximal'))),sub(sc(S('Middle','Proximal')),sc('Wrist_L'))));
const tn=unit(cross(sub(tc('finger5-1'),tc('finger2-1')),sub(tc('finger3-1'),tc('wrist'))));
const mappings=[];
function link(src,end,target,targetEnd){
 const b=J(target),sv=sub(sc(end),sc(src)),tv=targetEnd?sub(tc(targetEnd),b.position):sub(b.sourceTail,b.position);
 mappings.push({source:src,target:b.name,id:b.id,sourceLength:Math.hypot(...sv),targetLength:Math.hypot(...tv),sourceFrame:frame(sv,sn),targetFrame:frame(tv,tn),sourceCenter:sc(src),targetCenter:b.position});
}
for(let k=0;k<5;k++){
 const d=digits[k],chain=k===0?['Metacarpal','Proximal','Distal','Tip']:['Proximal','Intermediate','Distal','Tip'];
 for(let i=0;i<3;i++)link(S(d,chain[i]),S(d,chain[i+1]),'finger'+(k+1)+'-'+(i+1),i<2?'finger'+(k+1)+'-'+(i+2):null);
 if(k>0)link(S(d,'Metacarpal'),S(d,'Proximal'),'metacarpal'+k,'finger'+(k+1)+'-1');
}
const rows=[];
for(const pose of ref.poses){
 const q=m.joints.map(()=>I.slice());
 for(const map of mappings){
  const d=qmul(pose.transfer[map.source].delta,inv(rest[map.source].delta)),v=d.slice(0,3);
  const mapped=map.targetFrame.reduce((sum,b,i)=>add(sum,mul(b,dot(v,map.sourceFrame[i]))),[0,0,0]);
  q[map.id]=[...mapped,d[3]];
 }
 const w=poseFrom(m,q),v=deform(m,p,w),vertices=a.selected.map(i=>v[i]);
 const mesh={...p,positions:vertices.flat(),indices:a.faces.flat()};normals(mesh);
 const baselineName=pose.name==='open'?'rest':pose.name==='opposition'?'thumb-1':pose.name==='closed'?'coupled-1':pose.name;
 const control=a.rows.find(r=>r.name===baselineName);
 const amesh=control?{...p,positions:control.vertices.flat(),indices:a.faces.flat()}:null;
 if(amesh)normals(amesh);
 for(const view of ['front','side','three-quarter']){
  const bounds=commonBounds([{parts:[mesh]},...(amesh?[{parts:[amesh]}]:[])],view);
  write('v16-hand-B-'+pose.name+'-'+view+'.png',raster({parts:[mesh]},{view,bounds,size:512,mode:'A'}).png);
  if(amesh)write('v16-hand-A-'+pose.name+'-'+view+'.png',raster({parts:[amesh]},{view,bounds,size:512,mode:'A'}).png);
 }
 rows.push({name:pose.name,source:pose.source,baselineName:control?.name??null,rotations:q,vertices});
}
const c=structuredClone(m);c.spec.actions=['walk'];c.spec.motionRevision='v9';c.spec.walkDuration=2.75;c.sampledWalk={rotations:rows.map(r=>r.rotations),offsets:rows.map(()=>[0,0,0])};
write('v16-hand-B.glb',glb(c));
json('v16-hand-transfer.json',{candidate:'B',source:'Godot authored rotation deltas relative to open, transferred in per-segment anatomical frames',mappings,rows,faces:a.faces,rest:a.rest,limits:['Open pose is target rest, not fitted to source open geometry.','Pose sequence GLB is diagnostic, not a qualified grasp.','Candidate C and grip remain blocked pending independent audit.']});
console.log(JSON.stringify({mapped:mappings.length,poses:rows.length,glb:'v16-hand-B.glb'}));
