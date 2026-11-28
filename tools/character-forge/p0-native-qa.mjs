import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {join} from 'node:path';import {pose,deform} from './core.mjs';import {glb} from './glb.mjs';import {validateGeometry} from './authored-surface.mjs';import {normals,weights} from './hybrid-human.mjs';import {raster,commonBounds} from './material-study.mjs';import {canonical,hash,profile} from './p0-profile.mjs';
const out=process.env.CHARACTER_EVIDENCE,read=(n,dir=out)=>JSON.parse(readFileSync(join(dir,n))),write=(n,v)=>writeFileSync(join(out,n),v);
const m=read('p0-model.json'),before=read('p0-baseline-model.json'),src=read('morph/makehuman-'+process.env.P0_MORPH+'.json'),motion=read('v15-continuous-report.json'),r=motion.reports.cyclic49,repeat=read('p0-model.json',process.env.P0_REPEAT),bin=readFileSync(join(out,'v15-walk-cyclic49.glb')),bin2=readFileSync(join(process.env.P0_REPEAT,'v15-walk-cyclic49.glb')),a=canonical(m),b=canonical(repeat),stride=motion.stride;
const frame=(model,action,t,cycle=0)=>{const w=pose(model,action,t).map(j=>({...j,p:j.p.map((x,k)=>x+(k===2?cycle*stride:0))}));return {parts:model.parts.map(p=>{const q={...p,positions:deform(model,p,w).flat()};normals(q);return q})}};
validateGeometry(m);const eight=validateGeometry(read('p0-eight-source.json')),four=validateGeometry(read('p0-four-source.json'));eight.spec={...m.spec};eight.sampledWalk=structuredClone(m.sampledWalk);eight.approval=m.approval;four.spec={...m.spec,skinProfile:'four-influence-rejected-control'};four.sampledWalk=structuredClone(m.sampledWalk);four.approval='research-only four-influence comparison';
const fidelity={parts:{},gate:false,limitMm:.5,primaryMaxMm:0};for(const action of ['idle','walk'])for(let k=0;k<=48;k++){
 const w=pose(m,action,k/48);for(let j=0;j<m.parts.length;j++){const p=m.parts[j],q=eight.parts[j],s=four.parts[j];if(p.name!==q.name||p.name!==s.name||p.positions.length!==q.positions.length||p.positions.length!==s.positions.length)throw Error('Unstable skin reduction identity');const a=deform(m,p,w),b=deform(eight,q,w),c=deform(four,s,w);let row=fidelity.parts[p.name]??={maxMm:0,vertex:0,action,phase:0};for(let i=0;i<a.length;i++){const d=Math.hypot(...b[i].map((x,k)=>x-c[i][k]))*1000;fidelity.primaryMaxMm=Math.max(fidelity.primaryMaxMm,Math.hypot(...a[i].map((x,k)=>x-b[i][k]))*1000);if(d>row.maxMm)Object.assign(row,{maxMm:d,vertex:i,action,phase:k/48})}}
}
fidelity.maxFourControlMm=Math.max(...Object.values(fidelity.parts).map(p=>p.maxMm));fidelity.fourControlPassed=fidelity.maxFourControlMm<=fidelity.limitMm;fidelity.gate=fidelity.primaryMaxMm<=fidelity.limitMm;write('p0-skin-fidelity.json',JSON.stringify(fidelity,null,2));write('p0-eight-original.glb',glb(eight));write('p0-four-control.glb',glb(four));
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
 const w=pose(m,action,phase),eightPos=eight.parts.map(p=>deform(eight,p,w)),parts=m.parts.map(p=>({name:p.name,layer:p.layer??0,positions:deform(m,p,w),faces:tri(p)}));evaluated.push({action,phase,anatomy:deform(src,src.parts[0],w),parts});
 browser.push({action,phase,parts:parts.map((p,j)=>({name:p.name,primitive:j,count:p.positions.length,points:p.positions.map((position,index)=>({index,position,eightPosition:eightPos[j][index],rest:m.parts[j].positions.slice(index*3,index*3+3)})).filter(x=>x.index%Math.max(1,Math.floor(p.positions.length/32))===0)}))});
}
// Keep browser samples unchanged; only independent surface coverage grows.
const sampledWalk=new Set(evaluated.filter(f=>f.action==='walk').map(f=>f.phase));
for(const phase of [...Array.from({length:49},(_,k)=>k/48),...Array.from({length:8},(_,k)=>(6*k+.5)/48)])if(!sampledWalk.has(phase)){
 const w=pose(m,'walk',phase);evaluated.push({action:'walk',phase,anatomy:deform(src,src.parts[0],w),parts:m.parts.map(p=>({name:p.name,layer:p.layer??0,positions:deform(m,p,w),faces:tri(p)}))});
}
evaluated.push({action:'rest',phase:0,anatomy:pts(src.parts[0]),parts:m.parts.map(p=>({name:p.name,layer:p.layer??0,positions:pts(p),faces:tri(p)}))});
evaluated.sort((a,b)=>a.action.localeCompare(b.action)||a.phase-b.phase);
write('p0-evaluated.json',JSON.stringify({sourceFaces:tri(src.parts[0]),frames:evaluated,restParts:m.parts.map(p=>({name:p.name,positions:pts(p),faces:tri(p),attachmentBindings:p.attachmentBindings??null,outerVertexCount:p.outerVertexCount??null,weights:p.attachment||p.attachmentSpec||/buckle|clasp|welt/.test(p.name)?pts(p).map((_,i)=>weights(p,i)):null,attachment:p.attachment??null,attachmentSpec:p.attachmentSpec??(/neck binding|waist belt|welt/.test(p.name)?{type:'skinned-trim',host:p.name.includes('welt')?p.name.replace(' welt',''):'tunic'}:/pouch/.test(p.name)?{type:'fitted-interface',host:p.name==='belt pouch'?'pouch belt loop':'waist belt'}:null)}))}));
write('p0-browser-samples.json',JSON.stringify(browser));
const three={drift:0,vertical:0,penetration:0},anchors={};
for(let cycle=0;cycle<3;cycle++)for(const row of r.rows.slice(0,cycle===2?undefined:-1))for(const side of ['L','R']){
 const f=row.feet[side];three.penetration=Math.max(three.penetration,(motion.groundY-f.meshMin)*1000);
 for(const k of ['heel','toe']){const id=side+k;if(f.active.includes(k)){const p=f[k].slice();p[2]+=cycle*stride;anchors[id]??=p;three.drift=Math.max(three.drift,Math.hypot(p[0]-anchors[id][0],p[2]-anchors[id][2])*1000);three.vertical=Math.max(three.vertical,Math.abs(f[k+'Min']-motion.groundY)*1000)}else delete anchors[id]}
}
const idleError=Math.max(...evaluated.filter(f=>f.action==='idle').map(f=>Math.abs(Math.min(...f.parts.filter(p=>/^boot [LR]$/.test(p.name)).flatMap(p=>p.positions.map(v=>v[1])))-motion.groundY)*1000));
write('p0-native-qa.json',JSON.stringify({role:process.env.P0_ROLE,morphotype:process.env.P0_MORPH,canonical:a,secondCanonical:b,determinism:Object.keys(a).every(k=>a[k]===b[k]),byteIdentical:hash(bin)===hash(bin2),glbSha256:hash(bin),budgets:{triangles:m.parts.reduce((n,p)=>n+p.indices.length/3,0),joints:m.joints.length,glbBytes:bin.length},contact:{gate:r.gate,max:r.max,loop:r.loop,velocity:r.velocity,threeCycles:three,threeCycleGate:three.drift<=10&&three.vertical<=10&&three.penetration<=3&&r.loop.rootResidualMm<=10&&r.loop.maxJointDegrees<=10},idle:{maxSoleErrorMm:idleError,gate:idleError<=10},sourceRigExact:m.joints.length===src.joints.length&&m.joints.every((j,i)=>j.name===src.joints[i].name&&Math.hypot(...j.position.map((x,k)=>x-src.joints[i].position[k]))<1e-6),skinFidelity:fidelity,artApproved:false},null,2));
write('character.glb',bin);write('spec.json',JSON.stringify(m.spec,null,2));
