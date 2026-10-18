// Each browser tab owns its own PocketNet session. Duplicate-tab sessions must not steal sockets.
const CHANNEL='pocket-works:chyepukha:active-tabs',STORAGE='pocket-works:chyepukha:';
let active=null;const fallback=new Map();
const memoryStorage={getItem:k=>fallback.get(k)||null,setItem:(k,v)=>fallback.set(k,String(v)),removeItem:k=>fallback.delete(k)};
let channel=null;try{if(typeof BroadcastChannel!=='undefined')channel=new BroadcastChannel(CHANNEL)}catch{}
channel?.unref?.();
channel?.addEventListener('message',e=>{
 const msg=e.data;
 if(msg?.type==='probe'&&active&&active.server===msg.server&&active.token===msg.token)
  channel.postMessage({type:'owned',challenge:msg.challenge});
});
export function storageForTab(){
 try{const storage=globalThis.sessionStorage;storage.getItem(STORAGE+'probe');return storage}catch{return memoryStorage}
}
export function markActive(server,token){active=token?{server,token}:null}
export function releaseActive(){active=null}
export async function prepareSession(server,name,identityKey){
 const storage=storageForTab(),key='pocket-net:'+server,owner=STORAGE+'session-owner:'+server;
 const fingerprint=identityKey+':'+name;
 if(storage.getItem(owner)&&storage.getItem(owner)!==fingerprint)storage.removeItem(key);
 let previous=null;try{previous=JSON.parse(storage.getItem(key)||'null')}catch{}
 if(previous?.identityKey!==identityKey)storage.removeItem(key);
 else if(previous?.token&&channel){
  const challenge=globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2);
  const duplicated=await new Promise(resolve=>{
   let done=false;
   const finish=value=>{if(done)return;done=true;clearTimeout(timer);channel.removeEventListener('message',onReply);resolve(value)};
   const onReply=e=>{if(e.data?.type==='owned'&&e.data.challenge===challenge)finish(true)};
   channel.addEventListener('message',onReply);
   const timer=setTimeout(()=>finish(false),190);
   channel.postMessage({type:'probe',server,token:previous.token,challenge});
  });
  if(duplicated)storage.removeItem(key);
 }
 storage.setItem(owner,fingerprint);
 return storage;
}
