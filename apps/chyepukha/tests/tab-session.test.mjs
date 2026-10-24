import test from 'node:test';
import assert from 'node:assert/strict';
const data=new Map(),server='https://pocket.test/pocketnet',key='pocket-net:'+server;
globalThis.sessionStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
const tab=await import('../tab-session.js');
function saved(name='Guest',id='chyepukha-1',token='a'.repeat(64)){
 data.set(key,JSON.stringify({token,roomId:'abcd1234',identityKey:id}));
 data.set('pocket-works:chyepukha:session-owner:'+server,id+':'+name);
}
test('same account and tab retains resumable token',async()=>{
 saved();const storage=await tab.prepareSession(server,'Guest','chyepukha-1');
 assert.equal(JSON.parse(storage.getItem(key)).roomId,'abcd1234');
});
test('verified nickname changes preserve the room seat and migrate legacy tab ownership',async()=>{
 saved('Marta','pocket-id:A');
 const first=await tab.prepareSession(server,'New Name','pocket-id:A');
 assert.equal(JSON.parse(first.getItem(key)).roomId,'abcd1234');
 assert.equal(first.getItem('pocket-works:chyepukha:session-owner:'+server),'pocket-id:A');
 const second=await tab.prepareSession(server,'Another Name','pocket-id:A');
 assert.equal(JSON.parse(second.getItem(key)).roomId,'abcd1234');
});
test('guest name update clears old authentication',async()=>{
 saved();const storage=await tab.prepareSession(server,'Other','chyepukha-1');
 assert.equal(storage.getItem(key),null);
});
test('Pocket ID switch and guest login never share saved token',async()=>{
 saved('Marta','pocket-id:A');let s=await tab.prepareSession(server,'Sofia','pocket-id:B');
 assert.equal(s.getItem(key),null);
 saved();s=await tab.prepareSession(server,'Marta','pocket-id:A');
 assert.equal(s.getItem(key),null);
});
test('duplicate open tab cannot hijack a live token',async t=>{
 if(typeof BroadcastChannel==='undefined'){t.skip('BroadcastChannel unavailable');return}
 const peer=await import('../tab-session.js?test-peer=1');
 saved();peer.markActive(server,'a'.repeat(64));
 try{const s=await tab.prepareSession(server,'Guest','chyepukha-1');assert.equal(s.getItem(key),null)}
 finally{peer.releaseActive()}
});
