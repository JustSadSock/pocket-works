import test from 'node:test';
import assert from 'node:assert/strict';
import { activeRoomId, roomList, addRoom, saveRoom, loadRoom, deleteRoom, selectRoom } from './rooms.js';
import { starter } from './state.js';

const INDEX='pocket-works:komnatka:rooms-v1';
const ACTIVE='pocket-works:komnatka:active-room-v1';

function storage(failKey=null){
 const entries=new Map();
 globalThis.localStorage={
  getItem:key=>entries.get(key)??null,
  setItem:(key,value)=>{if(key===failKey)throw Error('QuotaExceededError');entries.set(key,String(value));},
  removeItem:key=>entries.delete(key)
 };
 return entries;
}

test('deleting an active room updates the active slot and preserves other rooms',()=>{
 const entries=storage();
 assert.equal(activeRoomId(),'first');
 const extra=addRoom({name:'Study',purpose:'study'});
 assert.ok(extra);
 assert.equal(activeRoomId(),extra.id);
 assert.ok(deleteRoom(extra.id));
 assert.equal(entries.get(ACTIVE),'first');
 assert.equal(activeRoomId(),'first');
 assert.equal(roomList().length,1);
});

test('saving a room reports a failed index write instead of reporting success',()=>{
 const entries=storage();
 roomList();
 const originalSet=globalThis.localStorage.setItem;
 globalThis.localStorage.setItem=(key,val)=>{
  if(key===INDEX)throw Error('QuotaExceededError');
  return originalSet(key,val);
 };
 assert.equal(saveRoom('first',starter()),false);
});

test('an unsuccessful room creation does not leave orphaned rooms',()=>{
 const entries=storage();
 roomList();
 const originalSet=globalThis.localStorage.setItem;
 globalThis.localStorage.setItem=(key,val)=>{
  if(key===ACTIVE)throw Error('QuotaExceededError');
  return originalSet(key,val);
 };
 const created=addRoom({name:'Unwritten'});
 assert.equal(created,null);
 assert.equal(roomList().length,1);
 assert.equal([...entries.keys()].filter(k=>k.includes(':room:')).length,1);
});

test('room selection reports unavailable storage and does not claim success',()=>{
 storage();
 roomList();
 const originalSet=globalThis.localStorage.setItem;
 globalThis.localStorage.setItem=(key,val)=>{
  if(key===ACTIVE)throw Error('QuotaExceededError');
  return originalSet(key,val);
 };
 assert.equal(selectRoom('first'),false);
});
