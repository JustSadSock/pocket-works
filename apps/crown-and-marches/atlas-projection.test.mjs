import assert from 'node:assert/strict';
import {chartedWaterColor} from './genesis-contours.mjs';
import {atlasPaper} from './atlas-material-fields.mjs';
import {atlasProjection,meshHeight,pickProjectedMesh,chartInk,atlasSurfaceHeight,pickAtlasSurface,surfaceHeightSampler} from './atlas-projection.mjs';
const known=new Uint8Array(25);for(let y=1;y<4;y++)for(let x=1;x<4;x++)known[y*5+x]=1;
assert.equal(chartInk(known,5,5,.99,2),0);assert.equal(chartInk(known,5,5,2.5,2.5),1);assert.ok(chartInk(known,5,5,1.1,2.5)<.5);
const terrain={bounds:[0,0,2,2],lods:[{cols:3,rows:3,vertices:Float32Array.from(Array.from({length:9},(_,i)=>[i%3,Math.floor(i/3),(i%3)*.1+Math.floor(i/3)*.2]).flat())}],stats:{minZ:0,maxZ:.6}};
assert.ok(Math.abs(meshHeight(terrain,0,.3,1.2)-.27)<1e-6);
const cfg={centerY:1,tilt:.28},p=atlasProjection({...cfg,height:(x,y)=>meshHeight(terrain,0,x,y)});for(let y=.01;y<2;y+=.13){const x=.64,xy=p.project(x,y),back=pickProjectedMesh(terrain,0,cfg,...xy);assert.ok(Math.hypot(back[0]-x,back[1]-y)<1e-5);}

terrain.contours={chunks:[{vertices:Float32Array.from([0,0,.8,0,0,0,2,0,.8,0,0,0,0,2,.8,0,0,0])}]};assert.ok(Math.abs(atlasSurfaceHeight(terrain,0,.4,.5)-.8)<1e-6);const wp=atlasProjection({...cfg,height:(x,y)=>atlasSurfaceHeight(terrain,0,x,y)}),hit=pickAtlasSurface(terrain,0,cfg,...wp.project(.4,.5));assert.ok(Math.hypot(hit[0]-.4,hit[1]-.5)<1e-5);

const sampler=surfaceHeightSampler(terrain,0,{limit:3});for(const [x,y] of [[.4,.5],[.7,1.1],[.4,.5],[.2,.9],[.8,1.2],[.4,.5]])assert.equal(sampler.height(x,y),atlasSurfaceHeight(terrain,0,x,y));assert.deepEqual(sampler.report(),{entries:3,limit:3,hits:1,misses:5,evictions:2});

// Water inherits the chart-only inward ink; color cannot sample hidden geography.
const sea=[42,80,112],interior=new Uint8Array(49).fill(1);assert.deepEqual(chartedWaterColor(sea,interior,7,7,3.5,3.5,true),sea);assert.deepEqual(chartedWaterColor(sea,known,5,5,.9,2,true),atlasPaper(.9,2));const edge=chartedWaterColor(sea,known,5,5,1.2,2.4,true);assert.ok(edge[0]>sea[0]&&edge[0]<atlasPaper(1.2,2.4)[0]);
