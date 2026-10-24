import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDependencyLock} from './validate-dependency-lock.mjs';

const manifest={
  name:'pocket-works',version:'0.13.5',workspaces:['apps/[!_]*'],
  dependencies:{phaser:'^3.90.0'},devDependencies:{'@playwright/test':'1.55.0'}
};
const lock={
  lockfileVersion:3,
  packages:{
    '':{...structuredClone(manifest)},
    'node_modules/phaser':{version:'3.90.0',resolved:'https://registry.npmjs.org/phaser/-/phaser-3.90.0.tgz',integrity:'sha512-YWJj'},
    'node_modules/@playwright/test':{version:'1.55.0',resolved:'https://registry.npmjs.org/@playwright/test/-/test-1.55.0.tgz',integrity:'sha512-YWJj'}
  }
};

test('a matching root lock and pinned Playwright installation passes',()=>{
  assert.deepEqual(validateDependencyLock(manifest,lock),[]);
});
test('manifest drift and mismatched pinned browser dependency fail closed',()=>{
  assert.match(validateDependencyLock({...manifest,version:'0.13.6'},lock).join(';'),/version/);
  assert.match(validateDependencyLock({...manifest,dependencies:{phaser:'^4.0.0'}},lock).join(';'),/dependencies/);
  const out=structuredClone(lock);
  out.packages['node_modules/@playwright/test'].version='1.56.0';
  assert.match(validateDependencyLock(manifest,out).join(';'),/Playwright/);
});
test('plain HTTP registry source or tampered missing integrity is rejected',()=>{
  const insecure=structuredClone(lock);
  insecure.packages['node_modules/phaser'].resolved='http://registry.npmjs.org/phaser/-/phaser-3.90.0.tgz';
  assert.match(validateDependencyLock(manifest,insecure).join(';'),/Insecure registry URL/);
  const missing=structuredClone(lock);
  delete missing.packages['node_modules/phaser'].integrity;
  assert.match(validateDependencyLock(manifest,missing).join(';'),/Missing integrity/);
});
test('empty, unsupported or malformed lockfiles are rejected',()=>{
  assert.match(validateDependencyLock(manifest,null).join(';'),/lockfileVersion/);
  assert.match(validateDependencyLock(manifest,{lockfileVersion:2,packages:{}}).join(';'),/lockfileVersion/);
  assert.match(validateDependencyLock(manifest,{lockfileVersion:3,packages:{}}).join(';'),/workspace root/);
});
