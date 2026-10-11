import {strict as assert} from 'node:assert';

class Storage{
 constructor(entries=[]){this.data=new Map(entries)}
 getItem(key){return this.data.has(key)?this.data.get(key):null}
 setItem(key,value){this.data.set(key,String(value))}
 removeItem(key){this.data.delete(key)}
 clone(){return new Storage([...this.data])}
}
const server='https://demo.trycloudflare.com';
const identity='pocket-net:'+server;
// Import the module twice to represent two independent browser tabs.
const owner=await import('../../tab-guests.js?test=owner');
const duplicate=await import('../../tab-guests.js?test=duplicate');
const ownerStorage=new Storage();
globalThis.sessionStorage=ownerStorage;
let storage=await owner.prepareTabGuest(server,'Alice');
assert.equal(storage,ownerStorage);
assert.equal(owner.tabGuestName(),'Alice');
ownerStorage.setItem(identity,JSON.stringify({token:'token-from-first-tab',roomId:'room-1'}));
owner.markTabGuest(server,'token-from-first-tab');

// Real new tab starts with no token although the site shares localStorage.
const freshStorage=new Storage();
globalThis.sessionStorage=freshStorage;
const fresh=await duplicate.prepareTabGuest(server,'Bob');
assert.equal(fresh.getItem(identity),null);
assert.equal(duplicate.tabGuestName(),'Bob');

// Browser "Duplicate tab" clones sessionStorage, including the token.
// Other active tabs must report a collision, requiring a fresh guest session.
const copy=ownerStorage.clone();
globalThis.sessionStorage=copy;
await duplicate.prepareTabGuest(server,'Alice');
assert.equal(copy.getItem(identity),null,'cloned tab re-used an active guest token');

// Same real tab and name retain their own token after refreshing.
globalThis.sessionStorage=ownerStorage;
await owner.prepareTabGuest(server,'Alice');
assert.equal(JSON.parse(ownerStorage.getItem(identity)).token,'token-from-first-tab');

// Editing the nickname invalidates the old signed guest token.
await owner.prepareTabGuest(server,'Renamed Alice');
assert.equal(ownerStorage.getItem(identity),null,'old guest token must not keep the old nickname');
assert.equal(owner.tabGuestName(),'Renamed Alice');
owner.clearTabGuest();duplicate.clearTabGuest();
console.log('PASS: independent names, fresh tab guest, duplicated-tab collision, reload identity and nickname changes');
