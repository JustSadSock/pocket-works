import assert from 'node:assert/strict';
import {historicalMesh} from './atlas-historical-models.mjs';
import {planUrbanTown} from './atlas-urban-layout.mjs';
import {organicGround} from './atlas-cultural-landscape.mjs';
import {assetDimensions,palettes} from './landscape-assets.mjs';
for(const type of ['house','timber','shop','warehouse','market','chapel','church','keep','tower','gate','barn'])for(let v=0;v<3;v++){const mesh=historicalMesh(type,v,'historical-coastal');assert.ok(mesh.length>4);assert.deepEqual(mesh,historicalMesh(type,v,'historical-coastal'));for(const f of mesh){assert.ok(palettes[f.mat]);assert.ok(f.p.length>=3&&f.p.every(p=>p.length===3&&p.every(Number.isFinite)));}}
const env={width:32,dry:(x,y)=>x>=0&&x<12.3&&y>=0&&y<32,water:(x,y)=>x>=12.3&&y>=0&&y<32,eligible:(x,y)=>x>=0&&x<32&&y>=0&&y<32,road:(x,y)=>x===10&&y===10,grade:()=>.01,occupied:()=>false,permitted:()=>true};const city={id:0,i:330,pop:944,capital:true,fort:0,port:0,build:[1,1,0,0]},base=planUrbanTown(city,env,{candidate:'cultural'});
for(const candidate of ['historical','organic']){const t=planUrbanTown(city,env,{candidate});assert.equal(t.buildings.length,t.target);assert.notDeepEqual(t.streets,base.streets);assert.ok(t.buildings.every(b=>b.profile.startsWith('historical-')));assert.equal(t.walls.length,0);assert.equal(t.piers.length,0);assert.deepEqual(t,planUrbanTown(city,env,{candidate}));}
const g=organicGround(329,env,{adjacent:(x,y)=>x===10&&y===10});assert.ok(g.patches.length>0&&g.paths.length===1);assert.ok(g.patches.every(p=>p.every(([x,y])=>Math.floor(x)===9&&Math.floor(y)===10)));assert.equal(organicGround(329,{...env,eligible:()=>false}).patches.length,0);assert.equal(organicGround(329,{...env,occupied:()=>true}).patches.length,0);
