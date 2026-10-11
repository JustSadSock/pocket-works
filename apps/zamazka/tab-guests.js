/*
 * One PocketNet guest = one browser tab, NOT one localStorage origin.
 * localStorage previously made every tab reuse the same guest token. The server
 * then kicked the previous socket on each new auth, causing a reconnect loop.
 *
 * sessionStorage survives reloads in the same tab. Browser "Duplicate tab" may
 * clone sessionStorage, so we additionally ask other live tabs whether they're
 * using the inherited token before authenticating.
 */
const NAMESPACE='pocket-works:zamazka:';
const CHANNEL_NAME=NAMESPACE+'active-guests';
const WAIT_FOR_DUPLICATE_MS=190;
const fallback=new Map();
const memoryStorage={
 getItem:key=>fallback.has(key)?fallback.get(key):null,
 setItem:(key,value)=>fallback.set(key,String(value)),
 removeItem:key=>fallback.delete(key)
};
let channel=null;
let active=null;
try{
 if(typeof BroadcastChannel!=='undefined')channel=new BroadcastChannel(CHANNEL_NAME);
}catch{}
channel?.unref?.(); // Keep Node-based smoke tests free to exit.
if(channel)channel.addEventListener('message',event=>{
 const m=event.data;
 if(!m||m.kind!=='who-owns-guest'||!active)return;
 if(m.server===active.server&&m.token===active.token){
   channel.postMessage({kind:'guest-already-active',challenge:m.challenge});
 }
});

export function tabStorage(){
 try{
  const storage=globalThis.sessionStorage;
  if(!storage)return memoryStorage;
  // Some privacy-restricted browsers expose sessionStorage but throw on access.
  storage.getItem(NAMESPACE+'session-test');
  return storage;
 }catch{return memoryStorage}
}
export function tabGuestName(){
 return tabStorage().getItem(NAMESPACE+'name')||'Реставратор';
}
export function rememberTabName(name){
 tabStorage().setItem(NAMESPACE+'name',name);
}
export function markTabGuest(server,token){
 active=token?{server,token}:null;
}
export function clearTabGuest(){active=null}

export async function prepareTabGuest(server,name){
 const storage=tabStorage();
 const identityKey=NAMESPACE+'identity-for:'+server;
 const storageKey='pocket-net:'+server;
 const previousName=storage.getItem(identityKey);
 // A PocketNet guest token is bound to the name used at /session.
 if(previousName&&previousName!==name)storage.removeItem(storageKey);
 let token=null;
 try{token=JSON.parse(storage.getItem(storageKey)||'null')?.token||null}catch{}
 if(token&&channel){
   const challenge=globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2);
   const collision=await new Promise(resolve=>{
     let finished=false;
     const complete=value=>{
       if(finished)return;
       finished=true;
       clearTimeout(timeout);
       channel.removeEventListener('message',reply);
       resolve(value);
     };
     const reply=e=>{
       if(e.data?.kind==='guest-already-active'&&e.data?.challenge===challenge)complete(true);
     };
     channel.addEventListener('message',reply);
     const timeout=setTimeout(()=>complete(false),WAIT_FOR_DUPLICATE_MS);
     channel.postMessage({kind:'who-owns-guest',server,token,challenge});
   });
   if(collision)storage.removeItem(storageKey);
 }
 storage.setItem(identityKey,name);
 rememberTabName(name);
 return storage;
}
