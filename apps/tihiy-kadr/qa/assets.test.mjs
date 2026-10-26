import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assetSource,handleMrxAsset} from '../../../pocketnet/mrx-assets.mjs';

const endpoint=path=>'https://pocketworks.example'+path;
test('only MRX weights and pinned ONNX binaries can be requested',()=>{
 assert.equal(assetSource('/ai-assets/mrx-v1/mrx/mrx.int8.onnx').kind,'model');
 const scnet=assetSource('/ai-assets/scnet-v1/scnet/scnet.int8.onnx');
 assert.equal(scnet.kind,'model');
 assert.equal(scnet.size,12900277);
 assert.equal(scnet.sha256,'98228931494151762a1c4ab1ec7899a894b1f81fd4a509921a9d2f9bacc50845');
 assert.equal(assetSource('/ai-assets/ort-1.30.0/ort-wasm-simd-threaded.jsep.wasm').kind,'wasm');
 assert.equal(assetSource('/ai-assets/ort-1.30.0/ort-wasm-simd-threaded.jsep.mjs').kind,'script');
 for(const path of [
  '/ai-assets/', '/ai-assets/mrx-v1/../private.env',
  '/ai-assets/mrx-v1/other.onnx','/ai-assets/scnet-v1/hidden.onnx', '/ai-assets/ort-1.30.0/../api.js',
  '/ai-assets/ort-1.30.0/custom.js', '/ai-assets/ort-1.30.0/ort-wasm.zip'
 ])assert.equal(assetSource(path),null,path);
});

test('an allowed binary is streamed from a fixed upstream and never forwards cookies',async()=>{
 let requestOptions,requestURL;
 const fetchImpl=async(url,opts)=>{requestURL=url;requestOptions=opts;return new Response(new Uint8Array([0,97,115,109]),{
  status:200,headers:{'content-type':'application/wasm','content-length':'4'}
 })};
 const response=await handleMrxAsset(new Request(endpoint('/ai-assets/ort-1.30.0/ort-wasm-simd-threaded.jsep.wasm'),{
  headers:{cookie:'session=secret','x-pw-account-id':'private'}
 }),{fetchImpl});
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/wasm');
 assert.match(requestURL,/^https:\/\/cdn\.jsdelivr\.net\//);
 assert.deepEqual(requestOptions.headers,{accept:'*/*'});
 assert.equal((await response.arrayBuffer()).byteLength,4);
});

test('cache serves a valid hit without an upstream request',async()=>{
 let called=false,stored=0;
 const cache={match:async()=>new Response('cached',{headers:{'x-pw-ai-asset':'wasm'}}),put:async()=>{stored++}};
 const response=await handleMrxAsset(new Request(endpoint('/ai-assets/ort-1.30.0/ort-wasm-simd-threaded.jsep.wasm')),{cache,fetchImpl:async()=>{called=true}});
 assert.equal(await response.text(),'cached');assert.equal(called,false);assert.equal(stored,0);
});

test('bad upstream content rejects and returns useful upstream diagnostic',async()=>{
 const bad=async()=>new Response('<html>blocked</html>',{headers:{'content-type':'text/html'}});
 const response=await handleMrxAsset(new Request(endpoint('/ai-assets/ort-1.30.0/ort-wasm-simd-threaded.jsep.wasm')),{fetchImpl:bad});
 assert.equal(response.status,502);
 assert.equal((await response.json()).error,'asset_upstream_unavailable_200');
});
test('unknown asset and write requests are refused',async()=>{
 let called=false;const fetchImpl=async()=>{called=true;throw Error('should not fetch')};
 const invalid=await handleMrxAsset(new Request(endpoint('/ai-assets/../../private')),{fetchImpl});
 assert.equal(invalid.status,404);
 const posted=await handleMrxAsset(new Request(endpoint('/ai-assets/mrx-v1/mrx/mrx.int8.onnx'),{method:'POST'}),{fetchImpl});
 assert.equal(posted.status,405);
 assert.equal(called,false);
});
