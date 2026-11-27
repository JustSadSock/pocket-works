// Research-only comparison. Keep v14 reports as input, not an approval.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {poseFrom,deform,quat,qmul,rotate} from './core.mjs';
import {part,push,normals,weights} from './hybrid-human.mjs';
import {raster,commonBounds} from './material-study.mjs';
const out=process.env.CHARACTER_EVIDENCE,m=JSON.parse(readFileSync(join(out,'makehuman-base.json'))),p=m.parts[0],I=[0,0,0,1],sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/(Math.hypot(...a)||1));
const J=n=>m.joints.find(j=>j.name===n+'.L'),chains=Array.from({length:5},(_,i)=>[1,2,3].map(s=>J('finger'+(i+1)+'-'+s))),wrist=J('wrist'),ids=new Set([wrist.id,...[1,2,3,4].map(k=>J('metacarpal'+k).id),...chains.flat().map(j=>j.id)]);
const selected=Array.from({length:p.positions.length/3},(_,i)=>i).filter(i=>weights(p,i).reduce((n,[j,w])=>n+(ids.has(j)?w:0),0)>.55),map=new Map(selected.map((v,i)=>[v,i])),faces=[];
for(let i=0;i<p.indices.length;i+=3){const f=p.indices.slice(i,i+3);if(f.every(x=>map.has(x)))faces.push(f.map(x=>map.get(x)))}
const rest=selected.map(i=>p.positions.slice(i*3,i*3+3)),edges=[...new Map(faces.flatMap(f=>f.map((a,i)=>{const b=f[(i+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');return [key,[a,b,Math.hypot(...sub(rest[a],rest[b]))]]}))).values()].filter(e=>e[2]>1e-5);
const palm=chains.slice(1).reduce((a,c)=>a.map((x,i)=>x+c[0].position[i]/4),[0,0,0]),bar=unit(sub(chains[4][0].position,chains[1][0].position)),along=unit(sub(palm,wrist.position)),normal=unit(cross(bar,along));
// Source frame axis sign is determined independently for each digit.
// Compare modest coupled motion before attempting any maximal closure.
const axis=chains.map((c,k)=>c.map(j=>{const x=j.sourceFrame[0],y=j.sourceFrame[1],dir=k===0?unit(sub(chains[2][0].position,j.position)):normal;return mul(x,dot(cross(x,y),dir)>=0?1:-1)}));
const poses=[{name:'rest',digits:[],fraction:0}];
for(const [name,digits] of [['index',[1]],['four',[1,2,3,4]],['thumb',[0]],['coupled',[0,1,2,3,4]]])for(const fraction of [.25,.5,.75,1])poses.push({name:name+'-'+fraction,digits,fraction});
const cap=[[.30,.44,.30],[.65,.76,.50],[.71,.85,.56],[.76,.89,.59],[.81,.91,.60]];
const rows=[];
for(const a of poses){
 const q=m.joints.map(()=>I.slice()),sourceLocal={};
 for(const k of a.digits)for(let j=0;j<3;j++){
  const b=chains[k][j],angle=cap[k][j]*a.fraction,qc=quat(axis[k][j],angle);q[b.id]=qc;
  // Q_core = F * Q_source * inv(F). Store native local-axis rotation explicitly.
  const local= b.sourceFrame.map(v=>dot(v,axis[k][j]));sourceLocal[b.name]=quat(local,angle);
 }
 const w=poseFrom(m,q),v=deform(m,p,w),hand=selected.map(i=>v[i]),ratios=edges.map(([a,b,l])=>Math.hypot(...sub(hand[a],hand[b]))/l).sort((a,b)=>a-b);
 const model=part('MakeHuman actual skin',[.68,.40,.27],'body');for(const pt of hand)push(model,pt,[[0,1]]);model.indices=faces.flat();normals(model);
 for(const view of ['front','side','three-quarter'])writeFileSync(join(out,'v15-makehuman-'+a.name+'-'+view+'.png'),raster({parts:[model]},{view,size:512,mode:'A'}).png);
 rows.push({name:a.name,sourceLocal,coreRotations:q,world:w,vertices:hand,edgeStrain:{min:ratios[0],p95:ratios[Math.floor(.95*(ratios.length-1))],max:ratios.at(-1),collapsed:ratios.filter(x=>x<.5).length}});
}
writeFileSync(join(out,'v15-hand-core.json'),JSON.stringify({source:'Pinned MakeHuman CC0 rig; moderate coupled experimental angles, not artist-approved',selected,faces,rest,axes:axis,caps:cap,rows,gripAllowed:false},null,2));
writeFileSync(join(out,'v11-grip-report.json'),JSON.stringify({rows:[],accepted:false,shieldProductionAllowed:false,reason:'Independent source bind/pose qualification required; no handle production'},null,2));
