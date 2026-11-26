import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openLibrary} from './persistent-library.mjs';
import {mergeRecordedLibraries} from './merge-recorded-libraries.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
function wav(seed){
 const b=Buffer.alloc(128);b.write('RIFF');b.writeUInt32LE(120,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(96000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(84,40);b.fill(seed,44);return b;
}
function entry(id,bytes,{license='CC0-1.0',dynamicLabel}={}){
 return {id,path:id+'.wav',title:'Reviewed violin sample',creator:'Sample creators',license,redistribution:true,provenance:'Pinned source / '+id,sourceUrl:'https://example.test/'+id,rightsEvidence:'https://example.test/license',sha256:hash(bytes),tags:['recorded','violin'],approval:'research-only',pin:{revision:'a'.repeat(40),blob:'b'.repeat(40)},recipe:{instrument:'violin',articulation:'arco-vib',midi:69,velocity:.35,variant:1,reviewedRoots:[69],...(dynamicLabel?{dynamicLabel}:{})}};
}
function makeSource(root,name,items){
 const input=path.join(root,name,'input');mkdirSync(input,{recursive:true});
 const libraryRoot=path.join(root,name,'library');const library=openLibrary(libraryRoot);
 try{
  for(const item of items){writeFileSync(path.join(input,item.file),item.bytes);library.insert({...item.entry,path:item.file},input);}
  const entries=library.list();writeFileSync(path.join(libraryRoot,'index.json'),JSON.stringify({approval:'research-only',entries},null,2)+'\n');
 }finally{library.close();}
 return {name,root:libraryRoot};
}
test('merges the three laboratory banks by source hash and preserves every recipe',()=>{
 const tmp=mkdtempSync(path.join(os.tmpdir(),'sound-forge-merge-'));
 try{
  const common=wav(7),a=wav(8),b=wav(9),c=wav(10);
  const sources=[
   makeSource(tmp,'performance',[{entry:entry('sample-common',common),bytes:common,file:'common.wav'},{entry:entry('unique-a',a),bytes:a,file:'a.wav'}]),
   makeSource(tmp,'articulations',[{entry:entry('sample-common',common,{dynamicLabel:'piano'}),bytes:common,file:'common.wav'},{entry:entry('unique-b',b),bytes:b,file:'b.wav'}]),
   makeSource(tmp,'dynamics',[{entry:entry('sample-common',common,{dynamicLabel:'forte'}),bytes:common,file:'common.wav'},{entry:entry('unique-c',c),bytes:c,file:'c.wav'}])
  ];
  const output=path.join(tmp,'merged');
  const report=mergeRecordedLibraries({outputRoot:output,sources,expectedCount:4});
  assert.equal(report.sourceEntries,6);assert.equal(report.uniqueSources,4);assert.equal(report.deduplicated,2);
  assert.deepEqual(report.sqlite,{integrity:'ok',rows:4,fts:4,violin:4});
  const index=JSON.parse(readFileSync(path.join(output,'index.json'),'utf8'));
  const commonEntry=index.entries.find(x=>x.id==='sample-common');
  assert.deepEqual(commonEntry.sourceLaboratories,['articulations','dynamics','performance']);
  assert.deepEqual(commonEntry.dynamicLabels,['forte','piano']);
  assert.equal(commonEntry.sourceRecipes.length,3);
  const db=new DatabaseSync(path.join(output,'catalog.sqlite'));
  try{assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{db.close();}
 }finally{rmSync(tmp,{recursive:true,force:true});}
});
test('rejects identical bytes with conflicting rights declarations',()=>{
 const tmp=mkdtempSync(path.join(os.tmpdir(),'sound-forge-rights-'));
 try{
  const bytes=wav(7);
  const sources=[
   makeSource(tmp,'cc0',[{entry:entry('sample-common',bytes),bytes,file:'common.wav'}]),
   makeSource(tmp,'public-domain',[{entry:entry('sample-common',bytes,{license:'public-domain'}),bytes,file:'common.wav'}])
  ];
  assert.throws(()=>mergeRecordedLibraries({outputRoot:path.join(tmp,'merged'),sources}),/Conflicting rights\/provenance/);
 }finally{rmSync(tmp,{recursive:true,force:true});}
});
