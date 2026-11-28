// Short v11 input preparation: no full role art production. Preserve existing
// anatomy, GLB checks and the exact merchant pattern; render only local probes.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {produceRoleV9,roleMorphs} from './roles-v9.mjs';
import {pose,deform,rootOffset} from './core.mjs';
import {glb} from './glb.mjs';
const out=process.env.CHARACTER_EVIDENCE,read=n=>JSON.parse(readFileSync(join(out,n))),write=(n,v)=>writeFileSync(join(out,n),v),json=(n,v)=>write(n,JSON.stringify(v,null,2));
const roles={};
for(const id of ['artisan','merchant']){const m=produceRoleV9(read('makehuman-'+roleMorphs[id].morph+'.json'),id);roles[id]=m;json('v9-'+id+'.model.json',m);write('v9-'+id+'.glb',glb(m))}
const m=roles.merchant,cloth=m.parts.find(p=>p.name==='merchant long wool robe'),tunic=m.parts.find(p=>p.name==='tunic');
function outer(p){const n=p.outerVertexCount??p.positions.length/3,indices=[];for(let i=0;i<p.indices.length;i+=3){const f=p.indices.slice(i,i+3);if(f.every(x=>x<n))indices.push(...f)}return {name:p.name,outerVertexCount:n,positions:p.positions.slice(0,n*3),indices}}
const garment={...outer(cloth),frames:[],pinIndices:Array.from({length:tunic.pattern.ringCount+1},(_,i)=>i)},colliders=['tunic','trousers L','trousers R','boot L','boot R'].map(n=>({...outer(m.parts.find(p=>p.name===n)),frames:[]})),rootOffsets=[];
const neutral=pose(m,'idle',0);garment.staticPositions=deform(m,cloth,neutral).flat().slice(0,garment.outerVertexCount*3);for(const c of colliders)c.staticPositions=deform(m,m.parts.find(p=>p.name===c.name),neutral).flat().slice(0,c.outerVertexCount*3);
m.spec.actions=['idle','walk'];
for(let i=0;i<=24;i++){const phase=i/24,w=pose(m,'walk',phase);rootOffsets.push(rootOffset(m,'walk',phase));garment.frames.push(deform(m,cloth,w).flat().slice(0,garment.outerVertexCount*3));for(const c of colliders)c.frames.push(deform(m,m.parts.find(p=>p.name===c.name),w).flat().slice(0,c.outerVertexCount*3))}
json('v9-cloth-input.json',{fps:24,frameCount:25,garment,colliders,rootOffsets,simulation:{quality:8,mass:.32,collisionDistance:.004,selfCollisionDistance:.006,gravity:[0,-9.81,0]},notes:'No new military role generated. Exact skeletal driver, actual neutral pose, pattern and explicit root offsets.'});
