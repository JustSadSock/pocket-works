import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {staticString} from './pwa-static-metadata.mjs';

test('read a named literal after other comma-grouped constants',()=>{
 assert.equal(staticString("const PREFIX='portal-lab-',CACHE='portal-lab-v1.5.0',CACHE_NAME='portal-lab-v1.5.0';",'CACHE_NAME'),'portal-lab-v1.5.0');
 assert.equal(staticString("const VERSION='1.6.0', CACHE_NAME='trafficity-v1.6.0';",'CACHE_NAME'),'trafficity-v1.6.0');
});
test('preserve single-binding behavior and strict mismatches',()=>{
 assert.equal(staticString("const CACHE_NAME = 'art-cabinet-v1.2.1';",'CACHE_NAME'),'art-cabinet-v1.2.1');
 assert.equal(staticString("const CACHE_NAME = 'wrong-v9';",'CACHE_NAME'),'wrong-v9');
});
test('computed or absent metadata are not considered valid literals',()=>{
 assert.equal(staticString("const CACHE_NAME = computeRuntimeName();",'CACHE_NAME'),null);
 assert.equal(staticString("const VERSION = '1.0.0';",'CACHE_NAME'),null);
});
test('actually parses current Portal Lab worker instead of changing its cache',async()=>{
 const source=await readFile(new URL('../apps/portal-lab/sw.js',import.meta.url),'utf8');
 assert.equal(staticString(source,'CACHE_NAME'),'portal-lab-v1.5.0');
});
