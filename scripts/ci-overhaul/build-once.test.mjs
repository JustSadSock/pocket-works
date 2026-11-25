import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync,cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seal,verifyBuild,stageBuild,prebuiltRunnerSource } from './build-once.mjs';
import { ROOT } from '../universal-qa/plan.mjs';
const context={tree:'a'.repeat(40),run:'1',attempt:'1'};
test('build inventory validates hidden files and rejects changed, missing or extra files',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'pw-build-'));
  try{
    writeFileSync(join(dir,'apps.json'),'[]');writeFileSync(join(dir,'index.html'),'site');
    writeFileSync(join(dir,'.headers'),'headers');
    const m=await seal(dir,context);
    assert.equal(m.files.length,3);
    assert.equal(await verifyBuild(dir,m,context),true);
    await assert.rejects(()=>verifyBuild(dir,m,{...context,run:'2'}),/provenance/);
    writeFileSync(join(dir,'index.html'),'edit');
    await assert.rejects(()=>verifyBuild(dir,m,context),/inventory/);
    writeFileSync(join(dir,'index.html'),'site');rmSync(join(dir,'.headers'));
    await assert.rejects(()=>verifyBuild(dir,m,context),/inventory/);
    writeFileSync(join(dir,'.headers'),'headers');writeFileSync(join(dir,'extra'),'x');
    await assert.rejects(()=>verifyBuild(dir,m,context),/inventory/);
    rmSync(join(dir,'extra'));symlinkSync(join(dir,'index.html'),join(dir,'alias'));
    await assert.rejects(()=>verifyBuild(dir,m,context),/Symlink/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('stage copies independently, never overwrites and rejects damaged bundle',async()=>{
  const root=mkdtempSync(join(tmpdir(),'pw-stage-'));
  try{
    const bundle=join(root,'bundle'),site=join(bundle,'dist-site'),work=join(root,'task'),work2=join(root,'task2');
    mkdirSync(site,{recursive:true});mkdirSync(work);mkdirSync(work2);
    writeFileSync(join(site,'apps.json'),'[]');writeFileSync(join(site,'index.html'),'site');
    const m=await seal(site,context);writeFileSync(join(bundle,'manifest.json'),JSON.stringify(m));
    await stageBuild(bundle,work,context);
    writeFileSync(join(work,'dist-site','index.html'),'changed');
    assert.equal(readFileSync(join(site,'index.html'),'utf8'),'site');
    await assert.rejects(()=>stageBuild(bundle,work,context),/overwrite/);
    writeFileSync(join(site,'index.html'),'bad');
    await assert.rejects(()=>stageBuild(bundle,work2,context),/inventory/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('adapter replaces only legacy build step and fails closed on drift',()=>{
  const source=readFileSync(join(ROOT,'scripts/universal-qa/run.mjs'),'utf8');
  const transformed=prebuiltRunnerSource(source);
  assert.ok(transformed.includes("result.buildMode = 'same-run-prebuilt'"));
  assert.ok(transformed.includes("process.env.PW_QA_SITE_ROOT = join(ROOT, 'dist-site')"));
  assert.ok(transformed.includes('const [binary, args] = jobArgs(task, suite, output)'));
  assert.throws(()=>prebuiltRunnerSource('changed'),/contract changed/);
});
