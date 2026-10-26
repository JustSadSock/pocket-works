// Fixed-purpose, same-origin inference asset endpoint.
//
// Browser access to Hugging Face's Xet and public ONNX CDN can fail even when
// PocketWorks itself loads. This edge relay fetches only the explicitly
// allowlisted model/wasm files: it is not an arbitrary URL proxy.
// User video/audio never passes through this endpoint.
const MODEL_SHA256='d876c92d224f5d8cd2207d528b23369da895a6de71fb24132416fcb16f9f8424';
const MODEL_BYTES=31287081;
const MODEL_PREFIX='/ai-assets/mrx-v1/mrx/';
const SCNET_PREFIX='/ai-assets/scnet-v1/scnet/';
const SCNET_BYTES=12900277;
const SCNET_SHA256='98228931494151762a1c4ab1ec7899a894b1f81fd4a509921a9d2f9bacc50845';
const ORT_PREFIX='/ai-assets/ort-1.30.0/';
const ORT_FILE=/^ort-wasm-[a-z0-9.-]+\.(?:wasm|mjs)$/;
const ORT_HOSTS=[
 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/',
 'https://unpkg.com/onnxruntime-web@1.30.0/dist/'
];
export function assetSource(pathname){
 if(pathname===SCNET_PREFIX+'scnet.int8.onnx')return {
  kind:'model',size:SCNET_BYTES,sha256:SCNET_SHA256,
  urls:['https://huggingface.co/audiojs/scnet/resolve/e71bcdb/scnet.int8.onnx']
 };
 if(pathname===MODEL_PREFIX+'mrx.int8.onnx')return {
  kind:'model',size:MODEL_BYTES,sha256:MODEL_SHA256,
  urls:['https://huggingface.co/audiojs/mrx/resolve/main/mrx.int8.onnx']
 };
 if(pathname.startsWith(ORT_PREFIX)){
  const filename=pathname.slice(ORT_PREFIX.length);
  if(!ORT_FILE.test(filename))return null;
  return {kind:filename.endsWith('.mjs')?'script':'wasm',urls:ORT_HOSTS.map(url=>url+filename)};
 }
 return null;
}
function reply(message,status){
 return new Response(JSON.stringify({error:message}),{
  status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
 });
}
export async function handleMrxAsset(request,{fetchImpl=fetch,cache=null,waitUntil=null}={}){
 const url=new URL(request.url);
 const asset=assetSource(url.pathname);
 if(!asset)return reply('asset_not_found',404);
 if(request.method!=='GET'&&request.method!=='HEAD')return reply('method_not_allowed',405);
 const key=new Request(url.origin+url.pathname,{method:'GET'});
 if(request.method==='GET'&&cache){
  try{const hit=await cache.match(key);if(hit)return hit}catch{}
 }
 let lastStatus=0;
 for(const source of asset.urls){
  try{
   // No user query, authorization header, cookies or body is forwarded.
   const upstream=await fetchImpl(source,{method:request.method,redirect:'follow',headers:{accept:'*/*'}});
   lastStatus=upstream.status;
   if(!upstream.ok||!upstream.body&&request.method==='GET')continue;
   const mime=(upstream.headers.get('content-type')||'').toLowerCase();
   if(mime.includes('text/html')||mime.includes('application/json'))continue;
   const size=Number(upstream.headers.get('content-length'));
   if(asset.size&&Number.isFinite(size)&&size>0&&size!==asset.size)continue;
   if(!asset.size&&Number.isFinite(size)&&size>30*1024*1024)continue;
   const headers=new Headers({
    'content-type':asset.kind==='script'?'text/javascript;charset=utf-8':asset.kind==='wasm'?'application/wasm':'application/octet-stream',
    'cache-control':'public,max-age=86400',
    'x-content-type-options':'nosniff',
    'x-pw-ai-asset':asset.kind
   });
   if(asset.sha256)headers.set('x-model-sha256',asset.sha256);
   if(asset.size)headers.set('content-length',String(asset.size));
   const result=new Response(request.method==='HEAD'?null:upstream.body,{status:200,headers});
   if(cache&&request.method==='GET'&&waitUntil){
    try{waitUntil(Promise.resolve(cache.put(key,result.clone())).catch(()=>{}))}catch{}
   }
   return result;
  }catch{}
 }
 return reply('asset_upstream_unavailable_'+(lastStatus||'network'),502);
}
