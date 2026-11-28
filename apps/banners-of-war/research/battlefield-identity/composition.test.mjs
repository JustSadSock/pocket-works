import assert from 'node:assert/strict';
import {E} from '../../engine.js';
import {Battlefield} from './slice-renderer.js';
import {TerrainTiles,prepareSurfaceFields,sampleSurfaceField,renderHeight,shorelineField,shoreCoverage,tileBlitRect} from './terrain-tiles.js';
const s=E.create('reference valley 71',['spear','sword','archer','knight','lightHorse'],['spear'],'adaptive','valley'),F=E.forState(s),before=JSON.stringify(s.terrain);
const f=await prepareSurfaceFields(F,s.terrain);
assert.equal(f.data.length,f.cols*f.rows*4);assert(f.bytes<2*1024*1024);assert(f.data.every(Number.isFinite));assert.equal(JSON.stringify(s.terrain),before);
for(let j=0;j<1000;j++){let x=(j*13.731)%F.W,y=(j*27.393)%F.H;assert(Math.abs(F.sample(s.terrain,x,y).h-renderHeight(F,s.terrain,x,y))<1e-9);assert(Math.abs(sampleSurfaceField(f,x,y,0))<=1);assert(Math.abs(sampleSurfaceField(f,x,y,1))<=1);assert(sampleSurfaceField(f,x,y,3)>=0&&sampleSurfaceField(f,x,y,3)<=1)}
let tiles=new TerrainTiles(F,s.terrain,{},{}),wide=tiles.visible({u:F.W/2,v:F.H/2,k:1,axis:'wide'},800,600),tactical=tiles.visible({u:F.W/2,v:F.H/2,k:1,axis:'tactical'},800,600);assert(!wide.some(a=>tactical.some(b=>a.key===b.key)));
globalThis.devicePixelRatio=2;
for(let [width,height,axis] of [[1440,900,'wide'],[390,844,'tall'],[844,390,'wide']]){let v=Object.create(Battlefield.prototype);Object.assign(v,{canvas:{clientWidth:width,clientHeight:height},cam:{x:0,y:0,z:1},F,state:s,composition:'A',benchmarking:false});v.resize();assert.equal(v.layout.axis,axis);for(let x of [0,15,F.W/2,F.W-15,F.W])for(let y of [0,15,F.H/2,F.H-15,F.H]){let p=v.project({x,y}),q=v.world(p,false);assert(p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height);assert(Math.hypot(x-q.x,y-q.y)<1e-7)}v.cam.x=1e5;v.cam.y=-1e5;v.resize();assert(Math.abs(v.cam.x)<=4.000001&&Math.abs(v.cam.y)<=4.000001)}
console.log(JSON.stringify({visualFields:{bytes:f.bytes,ms:f.ms,maxSlice:f.maxSlice},heightSamples:1000,strategicRoundTrips:75,immutableTerrain:true,projectionCacheIsolation:true}));

// Shoreline zero remains fixed in world space, regardless of terrain LOD.
for(let y=0;y<=F.H;y+=17){const x=F.riverX(s.terrain,y)+11;assert(Math.abs(shorelineField(F,s.terrain,x,y))<1e-9);for(let k of [.25,1,4,16]){assert(Math.abs(shoreCoverage(shorelineField(F,s.terrain,x,y),k)-.5)<1e-8);assert(shoreCoverage(-2/k,k)===1);assert(shoreCoverage(2/k,k)===0);}}
const mask={lab:true,cell:10,cols:2,rows:2,waterMask:[0,1,0,1],crossingMask:[0,0,0,0]};assert(Math.abs(shorelineField(F,mask,4.8,5))<1e-8);assert(shorelineField(F,mask,6,5)<0);assert(shorelineField(F,{...mask,crossingMask:[1,1,1,1]},6,5)>0);
// Adjacent tiles meet at a common device-aligned edge; source crop equals the
// original clipped affine transform, including fallback coarse tiles.
for(let k of [.24,.73,1.37,5.1])for(let l of [.25,1,4])for(let d of [1,2,3]){let dst=256*k/l,dx=17.23,dy=-4.83,sx=1,sy=1,r=tileBlitRect(sx,sy,dx,dy,dst,k,l,d),n=tileBlitRect(sx,sy,dx+dst,dy,dst,k,l,d);assert(Math.abs(r[4]+r[6]-n[4])<1e-8);assert(Math.abs(r[0]-(sx+(r[4]-dx)*l/k))<1e-8);assert(Math.abs(r[2]*k/l-r[6])<1e-8);}
assert.equal(JSON.stringify(s.terrain),before);
