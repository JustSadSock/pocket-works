import test from 'node:test';
import assert from 'node:assert/strict';
import {NetworkManager,normalizeRoomId} from '../network.js';

const old='12345678-aaaa-bbbb-cccc-000000000001';
const incoming='abcdef12-aaaa-bbbb-cccc-000000000002';

function manager({saved=null,connected=false}={}){
  const m=new NetworkManager(),events=[];
  m.connected=connected;
  m.net={
    roomId:saved,
    persist(){events.push(['persist',this.roomId]);},
    leaveRoom(){events.push(['leave']);this.roomId=null;},
    joinRoom(roomId){events.push(['join',roomId]);},
    async connect(){events.push(['connect',this.roomId]);}
  };
  return {m,events};
}

test('short codes and full UUIDs are accepted, malformed IDs are rejected',()=>{
  assert.equal(normalizeRoomId('ABCDEF12'),'abcdef12');
  assert.equal(normalizeRoomId(incoming),incoming);
  assert.equal(normalizeRoomId(' ABCDEF12 '),'abcdef12');
  assert.equal(normalizeRoomId('ABC123'),null);
  assert.equal(normalizeRoomId('zbcdef12'),null);
});
test('friend invitation overrides saved room before connecting',async()=>{
  const {m,events}=manager({saved:old});
  await m.joinRoom(incoming);
  assert.deepEqual(events,[['persist',null],['connect',null],['join',incoming]]);
});
test('changing the active room leaves it first',async()=>{
  const {m,events}=manager({saved:old,connected:true});
  m.currentRoom={id:old};
  await m.joinRoom('ABCDEF12');
  assert.deepEqual(events,[['leave'],['join','abcdef12']]);
  assert.equal(m.currentRoom,null);
});
test('restoring the same room does not duplicate the join',async()=>{
  const {m,events}=manager({saved:incoming});
  await m.joinRoom('ABCDEF12');
  assert.deepEqual(events,[['connect',incoming]]);
});
test('invalid IDs do not reach PocketNet',async()=>{
  const {m,events}=manager({connected:true});
  let error='';
  m.on('error',message=>error=message);
  await m.joinRoom('ABC123');
  assert.match(error,/8-значный/);
  assert.deepEqual(events,[]);
});
test('Pocket Social receives full room ID and Blockies slug',async()=>{
  const {m}=manager({saved:incoming,connected:true});
  m.currentRoom={id:incoming};m.net.accountId='user';
  const oldWindow=globalThis.window,opened=[];
  globalThis.window={PocketSocial:{open(...args){opened.push(args);}}};
  try{await m.inviteFriends();}
  finally{globalThis.window=oldWindow;}
  assert.deepEqual(opened,[[incoming,'blockies']]);
});
