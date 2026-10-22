import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ownModuleScripts} from './quick-module-entries.mjs';

test('real Fog of Conquest entrypoint does not need retired app.js',async()=>{
  const html=await readFile(new URL('../apps/fog-of-conquest/index.html',import.meta.url),'utf8');
  const modules=ownModuleScripts(html);
  assert.deepEqual(modules,['pocket-online.js']);
});
test('discover local module regardless of script attribute order',()=>{
  assert.deepEqual(ownModuleScripts('<script src="./game.js" defer type="module"></script><script type="module" src="./game.js"></script><script src="./legacy.js"></script>'),['game.js']);
});
test('exclude shared modules, traversal and remote URLs from Workshop proof',()=>{
  const html='<script type="module" src="../../shared/update-manager.js"></script><script type="module" src="./../foreign.js"></script><script type="module" src="https://example.com/app.js"></script><script type="module" src="./core/main.js"></script>';
  assert.deepEqual(ownModuleScripts(html),['core/main.js']);
});
test('plain classic scripts are not accepted as Workshop modules',()=>{
  assert.deepEqual(ownModuleScripts('<script src="./app.js" defer></script>'),[]);
});

test('Fog entrypoint installs a real workshop and caches its offline dependencies',async()=>{
  const app=await readFile(new URL('../apps/fog-of-conquest/pocket-online.js',import.meta.url),'utf8');
  const sw=await readFile(new URL('../apps/fog-of-conquest/sw.js',import.meta.url),'utf8');
  assert.match(app,/from ['"]\.\.\/\.\.\/shared\/workshop-mode\.js['"]/);
  assert.match(app,/createWorkshopMode\s*\(/);
  for(const asset of ['workshop-mode.js','workshop-mode.css','capabilities/motion.js','capabilities/storage.js','capabilities/diagnostics.js'])assert.ok(sw.includes('../../shared/'+asset),'missing '+asset);
});
