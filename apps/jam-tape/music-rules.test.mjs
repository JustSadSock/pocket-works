import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Versioned PocketNet .ts modules contain plain portable JS. Import through data:
// keeps this test runnable on Node versions without built-in TypeScript support.
const source=await readFile(new URL('./server/module.ts',import.meta.url),'utf8');
const {default:rules,MAX_PLAYERS}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));
const alice={id:'alice',name:'Алиса'},bob={id:'bob',name:'Борис'};
const clip=(id='a')=>({id,inst:'drums',a:0,b:64,notes:[[0,0,1,90],[4,2,2,70]]});
const make=()=>rules.createRoom({player:alice,payload:{bpm:115,inst:'drums',clips:[clip()]}}).state;
const edit=(s,player,action)=>rules.onMessage({state:s,player,payload:{type:'edit',action}});

test('host creates a 4-seat internet studio with a preserved sketch',()=>{
 const s=make();assert.equal(MAX_PLAYERS,4);assert.equal(s.phase,'lobby');
 assert.equal(s.host,'alice');assert.equal(s.bpm,115);assert.equal(s.tracks.alice.length,1);
 assert.equal(s.tracks.alice[0].notes.length,2);
});
test('guest joins without overwriting host notes',()=>{
 const s=make();rules.onJoin({state:s,player:bob,players:[alice,bob]});
 assert.equal(s.players.length,2);assert.deepEqual(s.tracks.bob,[]);
 assert.equal(s.tracks.alice.length,1);
});
test('guest cannot edit another musician\'s clip',()=>{
 const s=make();rules.onJoin({state:s,player:bob,players:[alice,bob]});
 const result=edit(s,bob,{kind:'clip-delete',id:'a'});
 assert.equal(result.events[0].type,'notice');assert.equal(s.tracks.alice.length,1);
});
test('pattern add, update, duplicate and delete are authoritative',()=>{
 const s=make();rules.onJoin({state:s,player:bob,players:[alice,bob]});
 edit(s,bob,{kind:'clip-add',clip:clip('guest')});
 assert.equal(s.tracks.bob.length,1);
 edit(s,bob,{kind:'clip-update',id:'guest',clip:{...clip('guest'),notes:[[15,7,4,100]]}});
 assert.deepEqual(s.tracks.bob[0].notes,[[15,7,4,100]]);
 edit(s,bob,{kind:'clip-add',clip:clip('copy')});assert.equal(s.tracks.bob.length,2);
 edit(s,bob,{kind:'clip-delete',id:'guest'});assert.equal(s.tracks.bob.length,1);
});
test('reject malformed notes and seventh clip',()=>{
 const s=make(),makeBad={...clip('bad'),notes:[[0,0,0,200]]};
 assert.equal(edit(s,alice,{kind:'clip-add',clip:makeBad}).events[0].type,'notice');
 for(let i=1;i<=5;i++)edit(s,alice,{kind:'clip-add',clip:clip('c'+i)});
 assert.equal(s.tracks.alice.length,6);
 assert.equal(edit(s,alice,{kind:'clip-add',clip:clip('seventh')}).events[0].type,'notice');
});
test('only room host can change tempo or reset everyone',()=>{
 const s=make();rules.onJoin({state:s,player:bob,players:[alice,bob]});
 assert.equal(edit(s,bob,{kind:'tempo',bpm:160}).events[0].type,'notice');
 assert.equal(s.bpm,115);
 edit(s,alice,{kind:'tempo',bpm:160});assert.equal(s.bpm,160);
 assert.equal(edit(s,bob,{kind:'reset'}).events[0].type,'notice');
 edit(s,alice,{kind:'reset'});assert.equal(s.tracks.alice.length,0);
});
test('live notes are delivered only to the other online players',()=>{
 const s=make();rules.onJoin({state:s,player:bob,players:[alice,bob]});
 const r=rules.onMessage({state:s,player:alice,payload:{type:'live-on',data:{uid:'note1',inst:'lead',pitch:3,vel:80}}});
 assert.equal(r.events.length,1);assert.equal(r.events[0].to,'bob');
 assert.equal(r.events[0].payload.owner,'alice');
});
test('leaving keeps recorded tracks and transfers leadership',()=>{
 const s=make();rules.onJoin({state:s,player:bob,players:[alice,bob]});
 rules.onLeave({state:s,players:[bob]});
 assert.equal(s.host,'bob');assert.equal(s.tracks.alice.length,1);
 assert.equal(s.players.find(p=>p.id==='alice').online,false);
});
test('full room rejects a fifth participant',()=>{
 const s=make();const joined=[alice];
 for(let i=2;i<=4;i++){const p={id:'p'+i,name:'Guest '+i};joined.push(p);rules.onJoin({state:s,player:p,players:joined.slice()});}
 assert.throws(()=>rules.onJoin({state:s,player:{id:'p5',name:'Guest 5'},players:[...joined,{id:'p5',name:'Guest 5'}]}),/room_full/);
});
