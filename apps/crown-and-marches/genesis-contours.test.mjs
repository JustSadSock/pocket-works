import assert from 'node:assert/strict';
import {clipWet,contourColor,buildContours,contourField} from './genesis-contours.mjs';
const p=clipWet([{x:0,y:0,z:0,v:1,depth:1},{x:1,y:0,z:0,v:-3,depth:0},{x:0,y:1,z:0,v:-1,depth:0}]);assert.equal(p.length,3);assert.equal(p[1].x,.25);assert.equal(p[2].y,.5);
const r=4,w=25,n=w*w,g={detail:r,width:w,height:w,land:new Uint8Array(n).fill(1),lakeWater:new Uint8Array(n),bed:new Float32Array(n),surface:new Float32Array(n),lake:new Float32Array(n)},m={geography:g,land:new Uint8Array(36).fill(1)};
for(let y=0;y<w;y++)for(let x=0;x<w;x++){const i=y*w+x,d=Math.hypot(x/4-2.5,y/4-2.5);g.bed[i]=.22+d*.08;g.surface[i]=Math.max(.30,g.bed[i]);g.lake[i]=g.surface[i]-g.bed[i];if(g.lake[i]>.012&&x>=8&&x<12&&y>=8&&y<12)g.lakeWater[i]=1;}m.land[14]=0;
const f=contourField(m);assert.ok(f.sample(2.5,2.5).lake>0);assert.ok(f.sample(4,2.5).lake<0);
const a=await buildContours(m,[0,0,6,6],{detail:8,vertical:h=>h});assert.ok(a.stats.lake>0);assert.ok(a.stats.shoreSegments>a.stats.axisSegments);assert.ok(a.chunks.every(c=>c.vertices.every(Number.isFinite)));assert.ok(contourColor(1,.02).every(v=>v<125));
