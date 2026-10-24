import assert from 'node:assert/strict';
import test from 'node:test';
import {createStateStreamAssembler} from '../state-stream-assembler.js';
import {packPrivateZamazkaState} from '../../../pocketnet/zamazka-state-stream.mjs';

test('slow continuous large gallery stream survives beyond fifteen seconds',()=>{
 const event={type:'state',payload:{phase:'voting',mine:{title:'Леся 🎨 作品',strokes:'абвєґ'.repeat(86_000)}}};
 const packets=packPrivateZamazkaState('room',event,{streamId:()=> 'big'});
 assert.ok(packets.length>20);
 const decoder=createStateStreamAssembler();let result;
 packets.forEach((packet,i)=>{
  result=decoder.accept(packet.event.payload,100_000+i*1_000);
  assert.equal(result.status,i===packets.length-1?'complete':'pending');
 });
 assert.deepEqual(result.event,event);
 assert.equal(decoder.activeCount,0);
 assert.ok(packets.length*1_000>15_000);
});

test('reordered and duplicate parts are collected once without corruption',()=>{
 const event={type:'state',payload:{mine:{strokes:'ё😊'.repeat(60_000)}}};
 const parts=packPrivateZamazkaState('room',event,{streamId:()=> 'mixed'});
 assert.ok(parts.length>2,'fixture must require stream packets');
 const decoder=createStateStreamAssembler();let result;
 const packets=[...parts.slice(1),parts[0]];
 for(let i=0;i<packets.length;i++){
  result=decoder.accept(packets[i].event.payload,i*50);
  assert.equal(result.status,i===packets.length-1?'complete':'pending');
  if(i===1)assert.equal(decoder.accept(packets[0].event.payload,i*50).status,'pending');
 }
 assert.deepEqual(result.event,event);
});

test('stalled streams expire; reconnection clears pending state',()=>{
 const d=createStateStreamAssembler();
 const part=id=>({stream:id,total:3,index:0,part:'x'});
 d.accept(part('old'),1000);d.accept(part('new'),1000);
 assert.equal(d.activeCount,2);
 d.accept(part('now'),80_000);
 assert.equal(d.activeCount,1);
 d.clear();assert.equal(d.activeCount,0);
});

test('concurrent streams, byte caps and schema are bounded',()=>{
 const d=createStateStreamAssembler({maxStreams:2,maxBytes:10});
 const part=(stream,content)=>({stream,total:2,index:0,part:content});
 d.accept(part('a','A'),0);d.accept(part('b','B'),10);d.accept(part('c','C'),20);
 assert.equal(d.activeCount,2);
 assert.equal(d.accept(part('large','12345678901'),30).status,'error');
 assert.equal(d.accept({stream:'bad',total:513,index:0,part:'x'},40).status,'invalid');
 assert.equal(d.accept({stream:'bad',total:1,index:0,part:'x'.repeat(15_001)},50).status,'invalid');
 assert.equal(d.accept({stream:'bad',total:1,index:0,part:'not json'},60).status,'error');
});
