// Durable local model library: IndexedDB, not localStorage quotas.
const DB='pocket-works:petri-forge:models', STORE='models';
function openDb(){
 return new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB){reject(Error('IndexedDB недоступна'));return;}
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'id'});
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error('Ошибка хранилища'));
 });
}
async function tx(mode,operation){
 const db=await openDb();
 try{return await new Promise((resolve,reject)=>{
  const transaction=db.transaction(STORE,mode),store=transaction.objectStore(STORE);
  let value;
  let request;
  try{request=operation(store);}catch(error){transaction.abort();reject(error);return;}
  if(request)request.onsuccess=()=>{value=request.result;};
  transaction.oncomplete=()=>resolve(value);
  transaction.onerror=()=>reject(transaction.error||Error('Ошибка записи'));
  transaction.onabort=()=>reject(transaction.error||Error('Операция отменена'));
 });}finally{db.close();}
}
function checkRecord(record){
 if(!record||typeof record.id!=='string'||!record.id||record.id.length>80||
    typeof record.name!=='string'||record.name.length>80||!record.snapshot)
  throw Error('Неверный формат модели');
}
// One IndexedDB transaction covers a profile and any of its changed brains.
// Failed writes abort the entire batch, so history never advances without its weights.
export async function commitModels({puts=[],deletes=[]}={}){
 if(!Array.isArray(puts)||!Array.isArray(deletes))throw Error('Неверная операция с моделями');
 const ids=new Set();
 for(const record of puts){checkRecord(record);if(ids.has(record.id))throw Error('Повтор модели в операции');ids.add(record.id);}
 for(const id of deletes){
  if(typeof id!=='string'||!id||id.length>80||ids.has(id))throw Error('Некорректное удаление модели');
  ids.add(id);
 }
 if(!ids.size)return;
 const at=Date.now();
 await tx('readwrite',store=>{
  for(const record of puts)store.put({...record,updatedAt:at});
  for(const id of deletes)store.delete(id);
  // Completion (not a single request's success) confirms durable batch commit.
 });
}
export async function listModels(){
 const all=await tx('readonly',store=>store.getAll());
 return all.map(({id,name,kind,updatedAt,states})=>({id,name,kind,updatedAt,states})).sort((a,b)=>b.updatedAt-a.updatedAt);
}
export async function saveModel(record){await commitModels({puts:[record]});}
export async function loadModel(id){return tx('readonly',store=>store.get(id));}
export async function deleteModel(id){await commitModels({deletes:[id]});}
