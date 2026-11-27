import assert from 'node:assert/strict';
import {clipWet,contourColor,buildContours,contourField,SpatialLRU,riverRibbons,materialIdentityFromTiles} from './genesis-contours.mjs';
const p=clipWet([{x:0,y:0,z:0,v:1,depth:1},{x:1,y:0,z:0,v:-3,depth:0},{x:0,y:1,z:0,v:-1,depth:0}]);assert.equal(p.length,3);assert.equal(p[1].x,.25);assert.equal(p[2].y,.5);
const r=4,w=25,n=w*w,g={detail:r,width:w,height:w,land:new Uint8Array(n).fill(1),lakeWater:new Uint8Array(n),bed:new Float32Array(n),surface:new Float32Array(n),lake:new Float32Array(n)},m={geography:g,land:new Uint8Array(36).fill(1)};
for(let y=0;y<w;y++)for(let x=0;x<w;x++){const i=y*w+x,d=Math.hypot(x/4-2.5,y/4-2.5);g.bed[i]=.22+d*.08;g.surface[i]=Math.max(.30,g.bed[i]);g.lake[i]=g.surface[i]-g.bed[i];if(g.lake[i]>.012&&x>=8&&x<12&&y>=8&&y<12)g.lakeWater[i]=1;}m.land[14]=0;
const f=contourField(m);assert.ok(f.sample(2.5,2.5).lake>0);assert.ok(f.sample(4,2.5).lake<0);
const a=await buildContours(m,[0,0,6,6],{detail:8,vertical:h=>h});assert.ok(a.stats.lake>0);assert.ok(a.stats.shoreSegments>a.stats.axisSegments);assert.ok(a.chunks.every(c=>c.vertices.every(Number.isFinite)));assert.ok(contourColor(1,.02).every(v=>v<125));

const lru=new SpatialLRU(8);lru.put('a',1,4);lru.put('b',2,4);assert.equal(lru.get('a'),1);lru.put('c',3,4);assert.equal(lru.get('b'),undefined);assert.equal(lru.bytes,8);lru.clear();assert.equal(lru.bytes,0);
g.down=new Int32Array(n).fill(-1);g.flow=new Float32Array(n);for(let x=2;x<20;x++){g.down[w+x]=w+x+1;g.flow[w+x]=1600;}g.flow[w+20]=1600;const ribbons=riverRibbons(g,[0,0,6,6],{vertical:h=>h});assert.equal(ribbons.stats.edges,18);assert.ok(ribbons.chunks.every(c=>c.vertices.every(Number.isFinite)));

const identityTile=(tx,ty,data)=>({tx,ty,ex:tx+32,ey:ty+32,stride:10,data});
const identityData=[new Float32Array(4),new Float32Array(4),new Float32Array(4),new Float32Array(4)];
const identityMap=new Map([['0:0',identityTile(0,0,identityData[0])],['32:0',identityTile(32,0,identityData[1])],['0:32',identityTile(0,32,identityData[2])],['32:32',identityTile(32,32,identityData[3])]]);
const identitySource={bounds:[0,0,64,64],detail:8},identityRect=[16,16,32,32],identityEntry={tileSize:32,byKey:identityMap};
const identity=materialIdentityFromTiles(identitySource,identityRect,identityEntry);
assert.ok(identity instanceof Float64Array);assert.equal(identity.length,26);
assert.deepEqual(identity,materialIdentityFromTiles({bounds:[8,8,40,40],detail:8},identityRect,identityEntry));
const replacementMap=new Map(identityMap);replacementMap.set('0:0',identityTile(0,0,new Float32Array(identityData[0])));
assert.notDeepEqual(materialIdentityFromTiles(identitySource,[16,16,20,20],identityEntry),materialIdentityFromTiles(identitySource,[16,16,20,20],{tileSize:32,byKey:replacementMap}));
const incompleteMap=new Map(identityMap);incompleteMap.delete('32:32');
assert.equal(materialIdentityFromTiles(identitySource,identityRect,{tileSize:32,byKey:incompleteMap}),null);
assert.equal(materialIdentityFromTiles(identitySource,[-1,16,8,24],identityEntry),null);
