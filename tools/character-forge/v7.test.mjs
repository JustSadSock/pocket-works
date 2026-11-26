import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {materialMaps,png,raster,profiles} from './material-study.mjs';
import {sculptCitizen} from './sculpt-v7.mjs';
import {glb,inspectGLB} from './glb.mjs';
test('v7 deterministic material maps contain distinct normal and roughness channels',()=>{
 for(const kind of Object.keys(profiles)){const a=materialMaps(kind,32),b=materialMaps(kind,32);assert.deepEqual(a,b);assert.equal(a.color.length,4096);assert.notDeepEqual(a.normal,a.color);assert.equal(png(32,32,a.color).subarray(0,8).toString('hex'),'89504e470d0a1a0a')}
});
test('v7 depth raster preserves nearest actual surface regardless of part order',()=>{
 const make=(name,z,color)=>({name,color,positions:[-.5,-.5,z,.5,-.5,z,0,.5,z],normals:[0,0,1,0,0,1,0,0,1],indices:[0,1,2]});
 const a=make('cloth',.2,[.4,.2,.1]),b=make('boot',.1,[.1,.2,.4]),opts={view:'front',size:64,bounds:[-.6,.6,-.6,.6]};
 const x=raster({parts:[a,b]},opts),y=raster({parts:[b,a]},opts);assert.deepEqual(x.rgba,y.rgba);assert.equal(x.visible.boot,undefined);assert.ok(x.visible.cloth>0);assert.equal(x.faces[32*64+32],0);
});
test('v7 preserves anatomy/rig and exports standard embedded detail maps',{skip:!process.env.CHARACTER_V7_SOURCE},()=>{
 const a=JSON.parse(readFileSync(process.env.CHARACTER_V7_SOURCE+'/v6-citizen.model.json')),b=sculptCitizen(a).model;
 assert.deepEqual(b.joints,a.joints);assert.deepEqual(b.parts[0].positions,a.parts[0].positions);
 assert.ok(b.parts.every(p=>p.positions.every(Number.isFinite)&&p.normals.every(Number.isFinite)));
 const maps=Object.fromEntries(Object.keys(profiles).map(k=>[k,materialMaps(k,32)])),doc=inspectGLB(glb(b,{detailMaps:maps}));
 assert.equal(doc.images.length,15);assert.ok(doc.meshes[0].primitives.every(p=>p.attributes.TEXCOORD_0!==undefined));assert.ok(doc.materials.every(m=>m.normalTexture));
});
