// IndexedDB backing for large restoration vectors. LocalStorage is used only
// for small settings and migration, never as the primary drawing database.
const DATABASE='pocket-works:zamazka:art';const VERSION=1;const TABLE='documents';
const LEGACY_PREFIX='pocket-works:zamazka:';
export function createZamazkaStore(){
 let databasePromise=null;
 function open(){
  if(databasePromise)return databasePromise;
  databasePromise=new Promise((resolve,reject)=>{
   if(!('indexedDB' in globalThis)){reject(Error('IndexedDB unavailable'));return}
   const request=indexedDB.open(DATABASE,VERSION);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(TABLE))request.result.createObjectStore(TABLE)};
   request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db)};
   request.onerror=()=>reject(request.error||Error('Cannot open restoration archive'));
   request.onblocked=()=>reject(Error('Archive upgrade blocked by another tab'));
  }).catch(error=>{databasePromise=null;throw error});
  return databasePromise;
 }
 async function get(key){
  const db=await open();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(TABLE,'readonly');
   const request=tx.objectStore(TABLE).get(key);
   request.onsuccess=()=>resolve(request.result??null);
   request.onerror=()=>reject(request.error||Error('Could not read archive'));
  });
 }
 async function set(key,value){
  const db=await open();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(TABLE,'readwrite');
   tx.objectStore(TABLE).put(value,key);
   tx.oncomplete=()=>resolve(true);
   tx.onabort=()=>reject(tx.error||Error('Archive transaction aborted'));
   tx.onerror=()=>reject(tx.error||Error('Archive write failed'));
  });
 }
 async function remove(key){
  const db=await open();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(TABLE,'readwrite');
   tx.objectStore(TABLE).delete(key);
   tx.oncomplete=()=>resolve(true);
   tx.onabort=()=>reject(tx.error||Error('Archive delete failed'));
   tx.onerror=()=>reject(tx.error||Error('Archive delete failed'));
  });
 }
 async function migrate(key,legacyKey=LEGACY_PREFIX+key){
  const existing=await get(key);
  if(existing!==null)return existing;
  let old=null;
  try{old=JSON.parse(localStorage.getItem(legacyKey)||'null')}catch{}
  if(old!==null){
   await set(key,old);
   try{localStorage.removeItem(legacyKey)}catch{}
  }
  return old;
 }
 async function listKeys(prefix=''){
  const db=await open();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(TABLE,'readonly');
   const req=tx.objectStore(TABLE).getAllKeys();
   req.onsuccess=()=>resolve(req.result.filter(k=>typeof k==='string'&&k.startsWith(prefix)));
   req.onerror=()=>reject(req.error||Error('Could not index archive'));
  });
 }
 return {get,set,remove,migrate,listKeys};
}
export const zamazkaStore=createZamazkaStore();
