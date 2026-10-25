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

import {hasUpdatePortReply} from './pwa-static-metadata.mjs';

test('literal VERSION metadata supports both standalone and grouped declarations',()=>{
 assert.equal(staticString("const VERSION='1.1.0';",'VERSION'),'1.1.0');
 assert.equal(staticString("const PREFIX='a',VERSION='1.1.0',CACHE='a-v1.1.0';",'VERSION'),'1.1.0');
 assert.equal(staticString("const VERSION = createVersion();",'VERSION'),null);
});

test('update worker must actually answer through a MessagePort',()=>{
 assert.ok(hasUpdatePortReply("if(event.data?.type==='GET_UPDATE_INFO')event.ports?.[0]?.postMessage({version:'1.0'});"));
 assert.ok(hasUpdatePortReply("if(e.data?.type==='GET_UPDATE_INFO')e.ports?.[0]?.postMessage({version:'1.0'});"));
 assert.ok(hasUpdatePortReply("if(msg.data?.type==='GET_UPDATE_INFO')msg.ports?.[0]?.postMessage({version:'1.0'});"));
 assert.equal(hasUpdatePortReply("self.postMessage({version:'1.0'});"),false);
 assert.equal(hasUpdatePortReply("const note='event.ports';"),false);
});
