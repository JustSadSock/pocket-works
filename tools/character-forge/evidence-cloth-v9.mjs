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
const frames=[];mkdirSync(join(out,'v9-cloth-motion'),{recursive:true});
for(let i=0;i<cache.frameCount;i++){
 const phase=i/(cache.frameCount-1),w=pose(model,'walk',phase),q=structuredClone(model);
 for(let j=0;j<q.parts.length;j++){q.parts[j].positions=deform(model,model.parts[j],w).flat();normals(q.parts[j])}
 const index=q.parts.findIndex(p=>p.name===input.garment.name);if(index<0)throw Error('Simulated garment part missing from model');
 const p=q.parts[index];p.positions=Array.from(cache.frames[i]);p.indices=input.garment.indices.slice();p.outerVertexCount=cache.vertexCount;p.normals=new Array(p.positions.length).fill(0);normals(p);
 frames.push(q);
}
const bounds=commonBounds(frames,'side');
for(let i=0;i<frames.length;i++)write('v9-cloth-motion/'+String(i).padStart(2,'0')+'.png',raster(frames[i],{view:'side',bounds,size:640,groundLine:true,mode:'C',maps}).png);
write('v9-cloth-playback-validation.json',JSON.stringify({decoder:'cloth-cache-player-v9.mjs',frames:cache.frameCount,fps:cache.fps,vertices:cache.vertexCount,duration:cache.duration,sourceSha256:meta.sha256,mode:'linear interpolation of precomputed uint16 positions; no runtime cloth simulation'},null,2));
