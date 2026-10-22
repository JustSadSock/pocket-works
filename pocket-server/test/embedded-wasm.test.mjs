import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {embeddedNodeWasm} from '../scripts/embedded-node-wasm.mjs';

const root=path.resolve(import.meta.dirname,'../..');

test('Mini Car 3D legacy bundle embeds and initializes Rapier WASM within upload cap',async()=>{
 const compiled=await build({
  entryPoints:[path.join(root,'apps/mini-car-3d/server/module.ts')],
  bundle:true,platform:'node',target:'node22',format:'esm',
  write:false,minify:true,logLevel:'silent',plugins:[embeddedNodeWasm()]
 });
 const code=compiled.outputFiles[0].text;
 assert.ok(Buffer.byteLength(code)<1024*1024,'bundle must respect existing server upload limit');
 assert.doesNotMatch(code,/import\s+\w+\s+from\s+['"][^'"]+\.wasm['"]/,'no external WASM file import may remain');
 const folder=await mkdtemp(path.join(tmpdir(),'pw-embedded-wasm-'));
 try{
  const file=path.join(folder,'compiled.mjs');
  await writeFile(file,code);
  const imported=await import(pathToFileURL(file).href);
  assert.equal(imported.default?.protocolVersion,1);
  assert.equal(typeof imported.default.createRoom,'function');
  const opened=imported.default.createRoom({player:{id:'smoke-1',name:'Test'}}); 
  assert.ok(opened?.state,'actual WASM-backed module must create a room');
 }finally{
  await rm(folder,{recursive:true,force:true});
 }
});
