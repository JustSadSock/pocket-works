import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRoomRecovery, ROOM_RECOVERY_TTL_MS} from '../room-recovery.js';
const roomId='12345678-1234-1234-1234-123456789abc';
const token='long-session-token-for-player';
const storage=()=>{
 const values=new Map();
 return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
};
test('a valid actor restores the exact room, seat token and host mode',()=>{
 const store=storage();
 const first=createRoomRecovery({storage:store,identityKey:'account-1',now:()=>1000000});
 assert.equal(first.save({roomId,token,mode:'host'}),true);
 assert.deepEqual(createRoomRecovery({storage:store,identityKey:'account-1',now:()=>1000020}).read(),
  {roomId,token,mode:'host',identityKey:'account-1',savedAt:1000000});
});
test('other accounts cannot claim or erase the previous checkpoint',()=>{
 const store=storage();
 const owner=createRoomRecovery({storage:store,identityKey:'account-1',now:()=>123456});
 owner.save({roomId,token,mode:'guest'});
 const stranger=createRoomRecovery({storage:store,identityKey:'account-2',now:()=>123456});
 assert.equal(stranger.read(),null);
 stranger.clear();
 assert.ok(owner.read());
 owner.clear();
 assert.equal(owner.read(),null);
});
test('recovery expires, rejects corrupt or invalid records, and tolerates disabled storage',()=>{
 const store=storage();
 const owner=createRoomRecovery({storage:store,identityKey:'account-1',now:()=>200000});
 assert.equal(owner.save({roomId:'not-a-room',token,mode:'guest'}),false);
 owner.save({roomId,token,mode:'guest'});
 assert.equal(createRoomRecovery({storage:store,identityKey:'account-1',now:()=>200000+ROOM_RECOVERY_TTL_MS+1}).read(),null);
 const disabled={getItem(){throw Error('disabled')},setItem(){throw Error('disabled')},removeItem(){throw Error('disabled')}};
 const fallback=createRoomRecovery({storage:disabled,identityKey:'guest'});
 assert.equal(fallback.read(),null);
 assert.equal(fallback.save({roomId,token,mode:'guest'}),false);
 assert.doesNotThrow(()=>fallback.clear());
});
