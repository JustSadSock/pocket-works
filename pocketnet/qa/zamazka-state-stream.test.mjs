import assert from 'node:assert/strict';
import test from 'node:test';
import {packPrivateZamazkaState} from '../zamazka-state-stream.mjs';

const bytes=value=>Buffer.byteLength(typeof value==='string'?value:JSON.stringify(value),'utf8');

test('small private state retains the ordinary event protocol',()=>{
 const event={type:'state',payload:{phase:'drawing',mine:{art:4}}};
 assert.deepEqual(packPrivateZamazkaState('room1',event),[{roomId:'room1',event}]);
});

test('very large private gallery round-trips through bounded Unicode stream',()=>{
 const privateEvent={type:'state',payload:{
  phase:'voting',serverNow:1234,owner:'participantA',
  gallery:[{title:'Портрет 😀 漢字',strokes:Array.from({length:2400},(_,i)=>({
   c:i%2?'#112233':'#334455',p:[[i%600,i%450],[i%599+0.1,i%449+0.4]],
   label:'восстановление 🎨 произведения 絵画'
  }))}]
 }};
 const own=JSON.stringify(privateEvent),room='test-room';
 assert.ok(bytes(own)>256*1024,'fixture must exceed ordinary event limit');
 const packets=packPrivateZamazkaState(room,privateEvent,{streamId:()=> 'stream-test'});
 assert.ok(packets.length>1,'large state must be streamed');
 assert.ok(packets.length<=512,'client requires bounded part count');
 let joined='';
 packets.forEach((packet,index)=>{
  const {stream,total,part}=packet.event.payload;
  assert.equal(packet.roomId,room);
  assert.equal(packet.event.type,'state_stream');
  assert.equal(stream,'stream-test');
  assert.equal(total,packets.length);
  assert.equal(packet.event.payload.index,index);
  assert.ok(bytes(part)<=12_000,'individual UTF-8 chunks must remain under 12KB');
  assert.ok(part.length<=15_000,'browser decoder must accept each part');
  assert.ok(bytes({wireVersion:1,type:'game_event',...packet})<=16*1024,
   'transport packets must fit a 16KiB WebSocket budget');
  joined+=part;
 });
 assert.equal(joined,own,'no surrogate pairs or long strokes may be lost');
 assert.deepEqual(JSON.parse(joined),privateEvent);
});

test('each projected player view is serialized without leaking a different view',()=>{
 const own={type:'state',payload:{mine:{secret:'my-portrait'},other:'hidden'}};
 const competitor={type:'state',payload:{mine:{secret:'other-private-draft'}}};
 const largeOwn={...own,payload:{...own.payload,padding:'м'.repeat(150_000)}};
 const transfer=packPrivateZamazkaState('room',largeOwn,{streamId:()=> 'x'});
 const payload=transfer.map(part=>part.event.payload?.part||JSON.stringify(part.event)).join('');
 assert.ok(payload.includes('my-portrait'));
 assert.ok(!payload.includes('other-private-draft'));
 assert.ok(!payload.includes(JSON.stringify(competitor)));
});

test('enforce hard state/part caps without partial success',()=>{
 const huge={type:'state',payload:{strokes:'X'.repeat(400_000)}};
 assert.throws(()=>packPrivateZamazkaState('room',huge,{maxStateBytes:300_000}),/event_too_large/);
 assert.throws(()=>packPrivateZamazkaState('room',huge,{maxParts:2}),/event_too_large/);
});
