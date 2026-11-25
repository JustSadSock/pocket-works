import assert from 'node:assert/strict';
import {lakeBasins,curvedChannels,naturalWatersSource,watersMaterial} from './genesis-waters.mjs';
const r=4,w=25,n=w*w,g={detail:r,width:w,height:w,land:new Uint8Array(n).fill(1),lakeWater:new Uint8Array(n),down:new Int32Array(n).fill(-1),flow:new Float32Array(n),bed:new Float32Array(n),surface:new Float32Array(n),lake:new Float32Array(n),rain:new Float32Array(n).fill(.6)},m={geography:g,land:new Uint8Array(36).fill(1),fert:new Float32Array(36).fill(.5)};
for(let y=0;y<w;y++)for(let x=0;x<w;x++){const i=y*w+x,d=Math.hypot(x/4-2.5,y/4-2.5);g.bed[i]=.22+d*.08;g.surface[i]=Math.max(.30,g.bed[i]);g.lake[i]=g.surface[i]-g.bed[i];if(g.lake[i]>.012&&x>=8&&x<12&&y>=8&&y<12)g.lakeWater[i]=1;}
m.land[14]=0;g.lake[1]=.08;g.surface[1]=g.bed[1]+.08;
const b=lakeBasins(g);assert.equal(b.levels.length,2);assert.equal(b.labels[1],0);assert.equal(lakeBasins(g),b);
const before=g.bed.slice(),s={mapVersion:3,autonomous:true,map:m},a=await naturalWatersSource(s,{}, {bounds:[0,0,6,6],detail:16,vertical:h=>h});
assert.deepEqual(g.bed,before);assert.ok(a.vertices.every(Number.isFinite));assert.equal(a.water.kind[0],0);assert.equal(a.water.kind[40*97+40],2);assert.ok(Math.abs(a.elevations[40*97+40]-.3)<1e-6);assert.ok(a.stats.water.lake>0);assert.equal(a.water.kind[40*97+65],0);
for(let x=2;x<22;x++){const i=4*w+x;g.down[i]=i+1;g.flow[i]=1600;}g.flow[4*w+22]=1600;
const c=curvedChannels(g,[0,0,6,6],16);for(let x=8;x<=88;x++)assert.ok(c[16*97+x]<0);
assert.ok(watersMaterial({x:0,y:0,H:.3,wet:.5,fert:.5,slope:.1,river:1,nx:0,ny:0,forest:0,curvature:0},{kind:2,depth:.08,shore:-.08}).every(Number.isFinite));

// Identical local samples at overlapping bounds and authoritative nodes.
const tile=await naturalWatersSource(s,{}, {bounds:[2,2,4,4],detail:16,vertical:h=>h});
for(let y=0;y<33;y++)for(let x=0;x<33;x++){const i=y*33+x,j=(y+32)*97+x+32;assert.equal(tile.elevations[i],a.elevations[j]);assert.equal(tile.water.kind[i],a.water.kind[j]);}
