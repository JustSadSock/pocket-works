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
    const request=operation(store);
    request.onsuccess=()=>{value=request.result;};
    transaction.oncomplete=()=>resolve(value);
    transaction.onerror=()=>reject(transaction.error||Error('Ошибка записи'));
    transaction.onabort=()=>reject(transaction.error||Error('Операция отменена'));
  });}finally{db.close();}
}
export async function listModels(){const all=await tx('readonly',s=>s.getAll());return all.map(({id,name,kind,updatedAt,states})=>({id,name,kind,updatedAt,states})).sort((a,b)=>b.updatedAt-a.updatedAt);}
export async function saveModel(record){
  if(!record||typeof record.id!=='string'||record.id.length>80||typeof record.name!=='string'||record.name.length>80||!record.snapshot)throw Error('Неверный формат модели');
  await tx('readwrite',s=>s.put({...record,updatedAt:Date.now()}));
}
export async function loadModel(id){return tx('readonly',s=>s.get(id));}
export async function deleteModel(id){await tx('readwrite',s=>s.delete(id));}
