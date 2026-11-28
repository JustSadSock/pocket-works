import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {join} from 'node:path';import {pose,deform} from './core.mjs';import {normals,weights} from './hybrid-human.mjs';import {raster,commonBounds} from './material-study.mjs';import {canonical,hash,profile} from './p0-profile.mjs';
const out=process.env.CHARACTER_EVIDENCE,read=(n,dir=out)=>JSON.parse(readFileSync(join(dir,n))),write=(n,v)=>writeFileSync(join(out,n),v);
const m=read('p0-model.json'),before=read('p0-baseline-model.json'),src=read('morph/makehuman-'+process.env.P0_MORPH+'.json'),motion=read('v15-continuous-report.json'),r=motion.reports.cyclic49,repeat=read('p0-model.json',process.env.P0_REPEAT),bin=readFileSync(join(out,'v15-walk-cyclic49.glb')),bin2=readFileSync(join(process.env.P0_REPEAT,'v15-walk-cyclic49.glb')),a=canonical(m),b=canonical(repeat),stride=motion.stride;
const frame=(model,action,t,cycle=0)=>{const w=pose(model,action,t).map(j=>({...j,p:j.p.map((x,k)=>x+(k===2?cycle*stride:0))}));return {parts:model.parts.map(p=>{const q={...p,positions:deform(model,p,w).flat()};normals(q);return q})}};
const art=frame(m,'idle',0),original=frame(before,'idle',0);
for(const view of ['front','side','three-quarter']){
 const bounds=commonBounds([art,original],view);
 for(const [name,model] of [['before',original],['after',art]])write(name+'-'+view+'.png',raster(model,{view,bounds,size:640,mode:'B'}).png);
 const silhouette={parts:art.parts.map(p=>({...p,color:[.12,.12,.12],vertexTint:undefined,vertexColors:undefined,material:{kind:'cloth',roughness:1,metallic:0}}))};
 write('silhouette-'+view+'.png',raster(silhouette,{view,bounds,size:512}).png);
 for(const size of [32,64,128,256,512])write('scale-'+size+'-'+view+'.png',raster(art,{view,bounds,size,mode:'B'}).png);
 for(const [name,joint,radius] of [['face','head',.14],['hand','wrist.L',.12],['clothing','spine03',.30]]){
  const j=m.joints.find(j=>j.name===joint),p=pose(m,'idle',0)[j.id].p,positions=[];for(const x of [-radius,radius])for(const y of [-radius,radius])for(const z of [-radius,radius])positions.push(p[0]+x,p[1]+y,p[2]+z);
  write(name+'-'+view+'.png',raster(art,{view,bounds:commonBounds([{parts:[{positions}]}],view),size:640,mode:'B'}).png)
 }
}
for(const view of ['front','side']){
 const frames=Array.from({length:73},(_,i)=>frame(m,'walk',(i%24)/24,Math.floor(i/24))),bounds=commonBounds(frames,view),dir=join(out,'walk-'+view);mkdirSync(dir,{recursive:true});for(let i=0;i<frames.length;i++)writeFileSync(join(dir,String(i).padStart(2,'0')+'.png'),raster(frames[i],{view,bounds,size:512,mode:'B',groundLine:true}).png);
}
const tri=p=>Array.from({length:p.indices.length/3},(_,i)=>p.indices.slice(i*3,i*3+3)),pts=p=>Array.from({length:p.positions.length/3},(_,i)=>p.positions.slice(i*3,i*3+3));
const evaluated=[],browser=[];
for(const action of ['idle','walk'])for(const phase of [0,.125,.25,.375,.5,.625,.75,.875,1]){
 const w=pose(m,action,phase),parts=m.parts.map(p=>({name:p.name,layer:p.layer??0,positions:deform(m,p,w),faces:tri(p)}));evaluated.push({action,phase,anatomy:deform(src,src.parts[0],w),parts});
 browser.push({action,phase,points:parts.flatMap(p=>p.positions.filter((_,i)=>i%Math.max(1,Math.floor(p.positions.length/12))===0))});
}
write('p0-evaluated.json',JSON.stringify({sourceFaces:tri(src.parts[0]),frames:evaluated,restParts:m.parts.map(p=>({name:p.name,positions:pts(p),weights:p.attachment||/buckle|clasp/.test(p.name)?pts(p).map((_,i)=>weights(p,i)):null,attachment:p.attachment??null}))}));
write('p0-browser-samples.json',JSON.stringify(browser));
const three={drift:0,vertical:0,penetration:0},anchors={};
for(let cycle=0;cycle<3;cycle++)for(const row of r.rows.slice(0,cycle===2?undefined:-1))for(const side of ['L','R']){
 const f=row.feet[side];three.penetration=Math.max(three.penetration,(motion.groundY-f.meshMin)*1000);
 for(const k of ['heel','toe']){const id=side+k;if(f.active.includes(k)){const p=f[k].slice();p[2]+=cycle*stride;anchors[id]??=p;three.drift=Math.max(three.drift,Math.hypot(p[0]-anchors[id][0],p[2]-anchors[id][2])*1000);three.vertical=Math.max(three.vertical,Math.abs(f[k+'Min']-motion.groundY)*1000)}else delete anchors[id]}
}
const idleError=Math.max(...evaluated.filter(f=>f.action==='idle').map(f=>Math.abs(Math.min(...f.parts.filter(p=>/^boot [LR]$/.test(p.name)).flatMap(p=>p.positions.map(v=>v[1])))-motion.groundY)*1000));
write('p0-native-qa.json',JSON.stringify({role:process.env.P0_ROLE,morphotype:process.env.P0_MORPH,canonical:a,secondCanonical:b,determinism:Object.keys(a).every(k=>a[k]===b[k]),byteIdentical:hash(bin)===hash(bin2),glbSha256:hash(bin),budgets:{triangles:m.parts.reduce((n,p)=>n+p.indices.length/3,0),joints:m.joints.length,glbBytes:bin.length},contact:{gate:r.gate,max:r.max,loop:r.loop,velocity:r.velocity,threeCycles:three,threeCycleGate:three.drift<=10&&three.vertical<=10&&three.penetration<=3&&r.loop.rootResidualMm<=10&&r.loop.maxJointDegrees<=10},idle:{maxSoleErrorMm:idleError,gate:idleError<=10},sourceRigExact:m.joints.length===src.joints.length&&m.joints.every((j,i)=>j.name===src.joints[i].name&&Math.hypot(...j.position.map((x,k)=>x-src.joints[i].position[k]))<1e-6),artApproved:false},null,2));
write('character.glb',bin);write('spec.json',JSON.stringify(m.spec,null,2));
