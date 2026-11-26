import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCatalog,mixHybrid} from './sample-library.mjs';
import {expandManifest} from './foundation.mjs';
const fixture=()=>{const root=mkdtempSync(path.join(tmpdir(),'sound-catalog-'));const bytes=Buffer.alloc(64,37);writeFileSync(path.join(root,'test.wav'),bytes);return {root,entry:{id:'test',path:'test.wav',title:'Metal strike',creator:'Test',provenance:'Original fixture',license:'original',redistribution:true,sha256:createHash('sha256').update(bytes).digest('hex'),tags:['impact','metal']}}};
test('catalog indexes, searches and verifies local samples',()=>{
  const {root,entry}=fixture();try{
    const c=createCatalog([entry],root);assert.equal(c.search('metal impact').length,1);assert.equal(c.search('rain').length,0);assert.equal(c.resolve('test').entry.sha256,entry.sha256);
    writeFileSync(path.join(root,'test.wav'),Buffer.alloc(64,1));assert.throws(()=>c.resolve('test'),/checksum/);
  }finally{rmSync(root,{recursive:true,force:true})}
});
test('catalog rejects ambiguous licensing and traversal',()=>{
  const {root,entry}=fixture();try{
    for(const patch of [{license:'unknown'},{license:'CC-BY-4.0'},{redistribution:false},{license:'CC0-1.0'},{path:'../test.wav'},{sha256:'invalid'}])assert.throws(()=>createCatalog([{...entry,...patch}],root));
    assert.throws(()=>createCatalog([entry,entry],root));
    assert.equal(createCatalog([{...entry,license:'CC0-1.0',sourceUrl:'https://example.org/audio',rightsEvidence:'Fixture declaration only'}],root).search().length,1);
    symlinkSync('/etc/passwd',path.join(root,'outside.wav'));
    assert.throws(()=>createCatalog([{...entry,path:'outside.wav'}],root).resolve('test'),/escapes/);
  }finally{rmSync(root,{recursive:true,force:true})}
});
test('hybrid ratio is RMS matched, bounded and deterministic',()=>{
  const p=Float32Array.from([.2,.2,-.2,-.2]),s=Float32Array.from([.4,-.4,.4,-.4]);
  assert.deepEqual(mixHybrid(p,s,0),p);
  const pure=mixHybrid(p,s,1);assert.deepEqual(pure,Float32Array.from([.2,-.2,.2,-.2]));
  const mix=mixHybrid(p,s,.5);assert.deepEqual(mix,Float32Array.from([.2,0,0,-.2]));
  assert.deepEqual(mixHybrid(p,s,.5),mix);
  assert.throws(()=>mixHybrid(p,s,1.1));assert.throws(()=>mixHybrid(p,new Float32Array(4),.5));
});
test('hybrid families expand with explicit sample and ratio',()=>{
  const f={id:'impact',model:'sword',outputDir:'generated',variants:4,sampleId:'steel',sampleMix:.25};
  const jobs=expandManifest({version:2,jobs:[],families:[f]});
  assert.equal(jobs.length,4);assert.ok(jobs.every(j=>j.type==='hybrid'&&j.sampleId==='steel'&&j.sampleMix===.25));
  assert.throws(()=>expandManifest({version:2,jobs:[],families:[{...f,sampleMix:undefined}]}));
});
