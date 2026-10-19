import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise the actual Durable Object methods with a focused in-memory fake.
// This catches a regression where every client pulse pushes the next alarm out.
const hub=await readFile(new URL('../../../pocketnet/hub.mjs',import.meta.url),'utf8');
function section(start,end){
 const i=hub.indexOf(start),j=hub.indexOf(end,i+start.length);
 assert.ok(i!==-1&&j>i,'PocketNetHub method anchors available');
 return hub.slice(i,j);
}
const Hub=new Function('ROOM_TTL',`return class TestHub {
${section('  ensureAlarm() {','  recordZamazkaRewards(')}
${section('  async alarm() {','\n}\n')}
}`)(30*60_000);

function fakeHub(){
 const obj=new Hub();
 let alarm=null;
 obj.ctx={storage:{
  getAlarm:async()=>alarm,
  setAlarm:async when=>{alarm=when}
 }};
 obj.module=(_game,version)=>version==='v6'?{onTick(){}}:null;
 obj.sql=(query)=>{
  if(query.includes("SELECT version FROM rooms"))return {toArray:()=>[{version:'v6'}]};
  if(query.includes('achievement_outbox'))return {toArray:()=>[]};
  return {toArray:()=>[]};
 };
 obj.countRooms=()=>1;
 return {obj,read:()=>alarm};
}
test('repeated client writes keep the earliest one-second alarm',async()=>{
 const {obj,read}=fakeHub();
 obj.ensureAlarm();
 await new Promise(setImmediate);
 const first=read();
 assert.ok(first>Date.now());
 assert.ok(first-Date.now()<1050);
 for(let i=0;i<10;i++)obj.ensureAlarm();
 await new Promise(setImmediate);
 assert.equal(read(),first,'client pulses must not postpone the scheduled server tick');
});

test('the real PocketNetHub alarm calls an authoritative game module for a room',async()=>{
 const {obj}=fakeHub(),now=Date.now();
 const calls=[];
 const room={id:'room-1',gameId:'blockies',version:'v6',
  state:{phase:'playing',tick:0},updatedAt:now};
 obj.sql=query=>({toArray:()=>query.includes('SELECT id, updated_at')?[{id:room.id,updated_at:now}]:[]});
 obj.countRooms=()=>1;
 obj.module=()=>({onTick({state,onlineIds,now:tickNow}){
  calls.push({onlineIds,now:tickNow});
  return {state:{...state,tick:state.tick+1},events:[{type:'state',payload:{}}]};
 }});
 obj.flushAwards=async()=>{};
 obj.readRoom=()=>room;
 obj.sockets=()=>[{deserializeAttachment:()=>({id:'a'})}];
 obj.persist=()=>{};
 obj.emit=(_room,events)=>{assert.equal(events.length,1)};
 obj.closeRoom=async()=>{throw Error('Unexpected closure')};
 await obj.alarm();
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0].onlineIds,['a']);
 assert.equal(room.state.tick,1);
});
