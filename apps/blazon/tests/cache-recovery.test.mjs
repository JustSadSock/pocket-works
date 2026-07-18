import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=name=>readFile(new URL(`../${name}`,import.meta.url),'utf8');

test('engine cannot be blocked by optional UI modules',async()=>{
  const source=await read('engine.js');
  assert.match(source,/if\(!isCore&&typeof document/);
  assert.match(source,/import\(`\$\{path\}\?v=\$\{BUILD\}`\)\.catch/);
  assert.doesNotMatch(source,/await import\('\.\/progression-runtime/);
});

test('worker uses network-first for executable assets',async()=>{
  const source=await read('sw.js');
  assert.match(source,/cache:'no-store'/);
  assert.match(source,/event\.request\.mode==='navigate'/);
  assert.match(source,/caches\.match\(request,\{ignoreSearch:true\}\)/);
});

test('reset preserves campaign storage while purging caches',async()=>{
  const source=await read('reset.html');
  assert.match(source,/reg\.unregister/);
  assert.match(source,/key\.startsWith\('blazon-'\)/);
  assert.match(source,/fetch\(source\.href,\{cache:'no-store'\}\)/);
  assert.doesNotMatch(source,/localStorage\.clear/);
});

test('runtime forces service worker revalidation',async()=>{
  const source=await read('release-indicator.js');
  assert.match(source,/updateViaCache:'none'/);
  assert.match(source,/registration=>registration\.update\(\)/);
});
