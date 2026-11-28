import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {decodeClothCache} from './cloth-cache-player-v9.mjs';
import {pose,deform} from './core.mjs';
import {raster,commonBounds,materialMaps,profiles} from './material-study.mjs';
import {normals} from './hybrid-human.mjs';
const out=process.env.CHARACTER_EVIDENCE,read=n=>JSON.parse(readFileSync(join(out,n))),write=(n,v)=>writeFileSync(join(out,n),v);
const model=read('morph/v9-merchant.model.json'),input=read('morph/v9-cloth-input.json'),meta=read('v9-cloth-game-cache.json'),bytes=readFileSync(join(out,meta.file)),cache=decodeClothCache(meta,bytes);
if(cache.vertexCount!==input.garment.outerVertexCount||cache.frameCount!==input.frameCount)throw Error('Game cloth cache does not match full garment input');
const scan=read('morph/v8-linen.json'),maps=Object.fromEntries(Object.keys(profiles).map(k=>[k,materialMaps(k,256)])),source={size:scan.size,...Object.fromEntries(Object.entries(scan.channels).map(([k,v])=>[k,new Uint8Array(Buffer.from(v,'base64'))]))};
for(let i=0;i<source.color.length;i+=4){for(let k=0;k<3;k++)source.color[i+k]=Math.round(.40*maps.cloth.color[i+k]+.60*source.color[i+k]);}
maps.cloth={...maps.cloth,color:source.color};
const frames=[],skeletal=[],hybrid=[],metrics=[],actions=model.spec.actions.slice();model.spec.actions=['idle','walk'];mkdirSync(join(out,'v9-cloth-motion'),{recursive:true});
for(let i=0;i<cache.frameCount;i++){
 const phase=i/(cache.frameCount-1),w=pose(model,'walk',phase),q=structuredClone(model);
 for(let j=0;j<q.parts.length;j++){q.parts[j].positions=deform(model,model.parts[j],w).flat();normals(q.parts[j])}
 const index=q.parts.findIndex(p=>p.name===input.garment.name);if(index<0)throw Error('Simulated garment part missing from model');
 const a=structuredClone(q),c=structuredClone(q),skin=input.garment.frames[i],b=Array.from(cache.frames[i]),blend=b.map((v,k)=>skin[k]+(v-skin[k])*.60);const edgeStats=verts=>{let sum=0,max=0,n=0;for(let t=0;t<input.garment.indices.length;t+=3)for(let k=0;k<3;k++){const x=input.garment.indices[t+k]*3,y=input.garment.indices[t+(k+1)%3]*3,d=Math.hypot(...[0,1,2].map(j=>skin[x+j]-skin[y+j]));if(d<1e-8)continue;const strain=Math.abs(Math.hypot(...[0,1,2].map(j=>verts[x+j]-verts[y+j]))/d-1);sum+=strain;max=Math.max(max,strain);n++}return {meanEdgeChange:sum/n,maxEdgeChange:max}};metrics.push({phase,A:edgeStats(skin),B:edgeStats(b),C:edgeStats(blend)});const h=c.parts[index];h.positions=blend;h.indices=input.garment.indices.slice();h.normals=new Array(blend.length).fill(0);normals(h);skeletal.push(a);hybrid.push(c);
 const p=q.parts[index];p.positions=b;p.indices=input.garment.indices.slice();p.outerVertexCount=cache.vertexCount;p.normals=new Array(p.positions.length).fill(0);normals(p);
 frames.push(q);
}
model.spec.actions=actions;
const bounds=commonBounds([...frames,...skeletal,...hybrid],'side');
for(const [label,models] of [['A',skeletal],['B',frames],['C',hybrid]]){const dir='v10-cloth-'+label;mkdirSync(join(out,dir),{recursive:true});for(let i=0;i<models.length;i++)write(dir+'/'+String(i).padStart(2,'0')+'.png',raster(models[i],{view:'side',bounds,size:512,mode:'C',maps,groundLine:true}).png)}
write('v10-cloth-comparison.json',JSON.stringify({variants:['A skeletal','B cached cloth','C 60% cached corrective displacement on skeletal motion'],metrics,limitations:['C uses the same morphology cache only; cross-morph reuse and seamless repetition not established.','Edge-change is relative to the skeletal frame, not volumetric cloth validation.']},null,2));
for(let i=0;i<frames.length;i++)write('v9-cloth-motion/'+String(i).padStart(2,'0')+'.png',raster(frames[i],{view:'side',bounds,size:640,groundLine:true,mode:'C',maps}).png);
write('v9-cloth-playback-validation.json',JSON.stringify({decoder:'cloth-cache-player-v9.mjs',frames:cache.frameCount,fps:cache.fps,vertices:cache.vertexCount,duration:cache.duration,sourceSha256:meta.sha256,mode:'linear interpolation of precomputed uint16 positions; no runtime cloth simulation'},null,2));
