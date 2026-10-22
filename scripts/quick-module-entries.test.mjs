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
