import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {openLibrary} from './persistent-library.mjs';
import {mixHybrid} from './sample-library.mjs';
test('persistent library survives reopen, deduplicates, searches and detects corruption',()=>{
  const root=mkdtempSync(path.join(tmpdir(),'pocket-library-'));let lib;
  try{
    const bytes=Buffer.alloc(64,5);writeFileSync(path.join(root,'source.wav'),bytes);
    const entry={id:'rain',path:'source.wav',title:'Heavy rain',creator:'Test',license:'original',provenance:'Fixture',redistribution:true,sha256:createHash('sha256').update(bytes).digest('hex'),tags:['weather','water']};
    const vault=path.join(root,'vault');lib=openLibrary(vault);
    const stored=lib.insert(entry,root);lib.insert(entry,root);lib.insert({...entry,id:'rain-alt'},root);
    assert.equal(readdirSync(path.join(vault,'objects')).length,1);
    assert.throws(()=>lib.insert({...entry,title:'Changed'},root));
    lib.close();lib=openLibrary(vault);
    assert.equal(lib.list('rain wea').length,2);assert.equal(lib.list('metal').length,0);
    assert.equal(lib.resolve('rain').entry.sha256,entry.sha256);
    writeFileSync(path.join(vault,stored.path),Buffer.alloc(64,7));
    assert.throws(()=>lib.resolve('rain'),/checksum/);
  }finally{lib?.close();rmSync(root,{recursive:true,force:true})}
});
test('optional RMS compensation maintains power subject to peak ceiling',()=>{
  const p=Float32Array.from([.2,.2,-.2,-.2]),s=Float32Array.from([.2,-.2,.2,-.2]);
  const a=mixHybrid(p,s,.5,{compensateRms:true});
  const energy=x=>x.reduce((n,v)=>n+v*v,0);
  assert.ok(Math.abs(energy(a)-energy(p))<1e-7);
  assert.ok(Math.max(...a.map(Math.abs))<=.88);
});
