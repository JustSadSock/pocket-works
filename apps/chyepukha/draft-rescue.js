// Preserve the actual manuscript when persistent storage is full or disabled.
// Priority: persistent localStorage, reload-safe tab storage, then live memory.
// No secondary copy is promoted to permanent storage without an explicit write.
export function createDraftStore(primary,secondary){
 const volatile=new Map();
 const safeRead=(storage,key)=>{
  try{return storage?.getItem(key)??null}catch{return null}
 };
 const safeRemove=(storage,key)=>{
  try{storage?.removeItem(key);return true}catch{return false}
 };
 return {
  read(key){
   if(volatile.has(key))return volatile.get(key);
   const tab=safeRead(secondary,key);
   return tab!==null?tab:safeRead(primary,key);
  },
  write(key,value){
   const text=String(value);
   volatile.set(key,text);
   try{
    primary.setItem(key,text);
    if(!safeRemove(secondary,key)){
     // A stale tab copy must not override a newer persistent draft after reload.
     try{secondary.setItem(key,text)}catch{return 'memory'}
    }
    volatile.delete(key);
    return safeRead(secondary,key)!==null?'tab':'local';
   }catch{}
   try{secondary.setItem(key,text);volatile.delete(key);return 'tab'}catch{}
   return 'memory';
  },
  remove(key){
   volatile.delete(key);
   safeRemove(primary,key);
   safeRemove(secondary,key);
  },
  mode(key){
   if(volatile.has(key))return 'memory';
   return safeRead(secondary,key)!==null?'tab':'local';
  }
 };
}
export function worstDraftMode(...modes){
 return modes.includes('memory')?'memory':modes.includes('tab')?'tab':'local';
}
export function draftStorageLabel(mode){
 if(mode==='memory')return 'Пам’ять пристрою недоступна. Текст є лише на цьому екрані — скопіюй його перед виходом або перезавантаженням.';
 if(mode==='tab')return 'Пам’ять пристрою заповнена. Чернетка збережена тільки в цій вкладці; не закривай її до відправлення.';
 return '';
}
