import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createIdentityTabBridge,ACCOUNT_SIGNAL_KEY} from '../shared/identity-tab-bridge.js';

class Channel {
  static active=[];
  constructor(name){this.name=name;this.listeners=new Set();this.sent=[];Channel.active.push(this);}
  addEventListener(type,fn){if(type==='message')this.listeners.add(fn);}
  removeEventListener(type,fn){if(type==='message')this.listeners.delete(fn);}
  postMessage(data) {
    this.sent.push(data);
    for(const peer of Channel.active)if(peer!==this&&peer.name===this.name)
      for(const fn of peer.listeners)fn({data});
  }
  close(){Channel.active=Channel.active.filter(x=>x!==this);}
}
function fakeWindow(){
  const listeners=new Map();
  return {addEventListener(name,fn){listeners.set(name,fn);},
    removeEventListener(name,fn){if(listeners.get(name)===fn)listeners.delete(name);},
    emit(name,event){listeners.get(name)?.(event);},
    get localStorage(){return {setItem(){}};}};
}
let now=1000,changeA=0,changeB=0;
const wins=[fakeWindow(),fakeWindow()];
const values=[];
const storage={setItem(key,value){values.push({key,value});}};
const a=createIdentityTabBridge({onChange:()=>{changeA++},BroadcastChannelType:Channel,windowTarget:wins[0],storage,clock:()=>now});
const b=createIdentityTabBridge({onChange:()=>{changeB++},BroadcastChannelType:Channel,windowTarget:wins[1],storage,clock:()=>now});

a.notify();
await Promise.resolve();
assert.equal(changeA,0,'sender must not refresh its own identity');
assert.equal(changeB,1,'another tab must ask the server about its session');
assert.equal(values[0].key,ACCOUNT_SIGNAL_KEY);
assert.ok(!values[0].value.includes('account'),'broadcast must not reveal account information');
assert.deepEqual(Channel.active[0].sent,[{type:'session-changed'}]);

wins[1].emit('storage',{key:ACCOUNT_SIGNAL_KEY,newValue:'other-tab'});
await Promise.resolve();
assert.equal(changeB,1,'duplicate storage and broadcast notifications coalesce');
now+=600;
wins[1].emit('storage',{key:ACCOUNT_SIGNAL_KEY,newValue:'new'});
await Promise.resolve();
assert.equal(changeB,2,'storage events work when channel delivery is absent');

now+=1000;
b.notify();
await Promise.resolve();
assert.equal(changeA,1);
a.close();b.close();
now+=1000;
wins[1].emit('storage',{key:ACCOUNT_SIGNAL_KEY,newValue:'after-close'});
await Promise.resolve();
assert.equal(changeB,2,'disposed bridge must not listen to peer messages');
assert.equal(Channel.active.length,0);

const blockedWindow={addEventListener(){},removeEventListener(){},get localStorage(){throw Error('blocked')}};
const blocked=createIdentityTabBridge({onChange:()=>{},BroadcastChannelType:null,windowTarget:blockedWindow,clock:()=>100});
assert.doesNotThrow(()=>blocked.notify(),'storage exceptions must not break Pocket ID');
blocked.close();

// Safety contract: remote events may only read the verified user from Pocket ID.
// They must never trust an ID carried in a cross-tab event payload.
const pocketId=await readFile(new URL('../shared/pocket-id.js',import.meta.url),'utf8');
assert.match(pocketId,/createIdentityTabBridge\(/);
assert.match(pocketId,/const result=await api\('me'\)/);
assert.match(pocketId,/if\(requestVersion!==accountChangeVersion\)return/);
console.log('Pocket ID two-tab session invalidation, storage fallback, deduplication and verified refresh passed.');
