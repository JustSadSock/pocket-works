import assert from 'node:assert/strict';
import {atlasProjection,meshHeight,pickProjectedMesh,chartInk} from './atlas-projection.mjs';
const known=new Uint8Array(25);for(let y=1;y<4;y++)for(let x=1;x<4;x++)known[y*5+x]=1;
assert.equal(chartInk(known,5,5,.99,2),0);assert.equal(chartInk(known,5,5,2.5,2.5),1);assert.ok(chartInk(known,5,5,1.1,2.5)<.5);
const terrain={bounds:[0,0,2,2],lods:[{cols:3,rows:3,vertices:Float32Array.from(Array.from({length:9},(_,i)=>[i%3,Math.floor(i/3),(i%3)*.1+Math.floor(i/3)*.2]).flat())}],stats:{minZ:0,maxZ:.6}};
assert.ok(Math.abs(meshHeight(terrain,0,.3,1.2)-.27)<1e-6);
const cfg={centerY:1,tilt:.28},p=atlasProjection({...cfg,height:(x,y)=>meshHeight(terrain,0,x,y)});for(let y=.01;y<2;y+=.13){const x=.64,xy=p.project(x,y),back=pickProjectedMesh(terrain,0,cfg,...xy);assert.ok(Math.hypot(back[0]-x,back[1]-y)<1e-5);}
