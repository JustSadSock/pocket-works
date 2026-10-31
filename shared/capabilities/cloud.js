// Account-scoped Pocket Cloud transfer API. Actual authorization is a server-side
// HttpOnly Pocket ID cookie. Payloads are compressed when browser support allows.
const message={
 sign_in_required:'Войди в Pocket ID, чтобы пользоваться облаком.',
 revision_conflict:'Работа изменилась на другом устройстве.',
 item_too_large:'Эта работа слишком велика для облака. Она остаётся на устройстве.',
 quota_exceeded:'Лимит облака (16 МБ) исчерпан. Локальные работы не удалены.',
 item_limit:'Достигнут лимит облачных документов.',
 identity_unavailable:'Не удалось проверить Pocket ID. Попробуй позже.',
 account_changed:'Аккаунт Pocket ID сменился. Синхронизация остановлена.',
 invalid_payload:'Повреждённый формат рисунка.',
};
const bytesToBase64=bytes=>{
 let out='';for(let i=0;i<bytes.length;i+=8192)
  out+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(out);
};
const base64ToBytes=value=>{
 const binary=atob(value);const data=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)data[i]=binary.charCodeAt(i);
 return data;
};
export async function packCloudData(data){
 const raw=new TextEncoder().encode(JSON.stringify(data));
 if(typeof CompressionStream==='function'){
  const gz=await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  return {encoding:'gzip-base64',payload:bytesToBase64(new Uint8Array(gz))};
 }
 return {encoding:'json-base64',payload:bytesToBase64(raw)};
}
export async function unpackCloudData(row){
 let bytes=base64ToBytes(row.payload);
 if(row.encoding==='gzip-base64'){
  if(typeof DecompressionStream!=='function')throw Error('Браузер не поддерживает чтение сжатых рисунков');
  bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
 }
 if(bytes.length>25_000_000)throw Error('Облачный документ слишком велик');
 return JSON.parse(new TextDecoder().decode(bytes));
}
export class PocketCloudClient{
 constructor(app,accountId=null){if(!['folio','zamazka','rose-ranking-15'].includes(app))throw Error('Invalid cloud app');this.app=app;this.accountId=accountId;}
 url(path,id=null){const p=new URL('/pocket-cloud/'+path,location.origin);p.searchParams.set('app',this.app);if(id)p.searchParams.set('id',id);return p;}
 async call(path,{id=null,method='GET',body}={}){
  const controller=new AbortController();const clock=setTimeout(()=>controller.abort(),20000);
  try{
   const r=await fetch(this.url(path,id),{
    method,credentials:'same-origin',cache:'no-store',signal:controller.signal,
    headers:{...(body?{'content-type':'application/json'}:{}),...(this.accountId?{'x-pw-expected-account':this.accountId}:{})},
    body:body?JSON.stringify(body):undefined
   });
   const data=await r.json().catch(()=>({error:'invalid_response'}));
   if(!r.ok){
    const error=new Error(message[data.error]||'Ошибка Pocket Cloud ('+r.status+')');
    error.code=data.error;error.details=data;throw error;
   }
   return data;
  }catch(error){
   if(error.name==='AbortError')throw Error('Pocket Cloud не отвечает. Локальные файлы сохранены.');
   throw error;
  }finally{clearTimeout(clock)}
 }
 list(){return this.call('list')}
 async read(id){
  const data=await this.call('item',{id});
  return {metadata:data.item,document:await unpackCloudData(data)};
 }
 async write(id,doc,{baseRevision=0,title='',updatedAt=Date.now()}={}){
  const packed=await packCloudData(doc);
  return this.call('item',{id,method:'POST',body:{...packed,baseRevision,title:String(title).slice(0,100),updatedAt}});
 }
 remove(id,baseRevision){return this.call('item',{id,method:'DELETE',body:{baseRevision}})}
}
