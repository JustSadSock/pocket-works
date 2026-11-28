import test from 'node:test';
import assert from 'node:assert/strict';
import {createVirtualAudioWorld,planVoiceBudget,createBudgetedAudioScene} from '../../shared/capabilities/virtual-audio.js';
const buffer={length:48000,sampleRate:48000,numberOfChannels:1,getChannelData(){return new Float32Array(48000)}};
const listener={x:0,y:0};
function fixture(options={}){
 const context={currentTime:0,destination:{}},created=[];
 const createEmitter=opts=>{
  const e={opts,async start(params){this.params=params;return true},update(spatial){this.spatial=spatial},setVolume(v){this.volume=v},destroy(){this.destroyed=true}};
  created.push(e);return e;
 };
 const world=createVirtualAudioWorld({context,createEmitter,maxVoices:4,...options});
 return {world,context,created};
}
const at=(id,x,priority=1)=>({id,position:{x,y:0},buffer,priority});
test('1000 logical sources are ranked under a hard cap including retiring voices',async()=>{
 const {world,context,created}=fixture();
 const sources=Array.from({length:1000},(_,i)=>at('s'+i,6+i*.1));
 await world.reconcile({listener,sources});
 assert.equal(world.stats.logical,1000);assert.equal(world.stats.active,4);
 assert.deepEqual(world.activeIds,['s0','s1','s2','s3']);
 const moved=sources.map(s=>({...s,position:{x:s.position.x+90,y:0}}));
 moved[999]={...moved[999],position:listener,priority:10};
 await world.reconcile({listener,sources:moved});
 assert.equal(world.stats.active,4);assert.ok(world.stats.retiring>0);
 context.currentTime=.06;await world.reconcile({listener,sources:moved});
 assert.ok(world.activeIds.includes('s999'));assert.equal(world.stats.peak,4);
 assert.ok(created.some(e=>e.destroyed));world.destroy();assert.ok(created.every(e=>e.destroyed));
});
test('hysteresis retains nearly equivalent sources, priority can override it',async()=>{
 const {world,context}=fixture({maxVoices:1});
 await world.reconcile({listener,sources:[at('a',10),at('b',11)]});
 await world.reconcile({listener,sources:[at('a',10),at('b',9.8)]});
 assert.deepEqual(world.activeIds,['a']);
 await world.reconcile({listener,sources:[at('a',10),at('b',9.8,5)]});
 assert.equal(world.stats.retiring,1);
 context.currentTime=.06;await world.reconcile({listener,sources:[at('a',10),at('b',9.8,5)]});
 assert.deepEqual(world.activeIds,['b']);world.destroy();
});
test('virtual loop activation keeps logical time and rejects invalid snapshots atomically',async()=>{
 const {world,context,created}=fixture({maxVoices:1,maxSources:2});
 await world.reconcile({listener,sources:[at('a',1000)]});
 assert.equal(world.stats.active,0);
 context.currentTime=7.25;await world.reconcile({listener,sources:[at('a',0)]});
 assert.equal(created[0].params.offsetSeconds,7.25);
 assert.equal(created[0].params.fadeInSeconds,.025);
 await assert.rejects(world.reconcile({listener,sources:[at('a',0),at('a',0)]}));
 assert.deepEqual(world.activeIds,['a']);
 await assert.rejects(world.reconcile({listener,sources:[at('a',0),at('b',0),at('c',0)]}));
 world.destroy();
});
test('destroy during asynchronous activation and overlapping updates do not leak voices',async()=>{
 let release;const entries=[],context={currentTime:0,destination:{}};
 const world=createVirtualAudioWorld({context,maxVoices:1,createEmitter:()=>{
  const e={start(){return new Promise(r=>{release=r})},destroy(){this.destroyed=true}};
  entries.push(e);return e;
 }});
 const pending=world.reconcile({listener,sources:[at('a',0)]});
 assert.equal(await world.reconcile({listener,sources:[at('b',0)]}),false);
 world.destroy();release(true);
 assert.equal(await pending,false);assert.equal(world.stats.active,0);assert.ok(entries[0].destroyed);
});

test('voice reservations cannot exceed total, including music stems',()=>{
 assert.deepEqual(planVoiceBudget({total:18,events:4,music:2}),{total:18,events:4,music:2,continuous:12});
 for(const budget of [{total:8,events:8,music:1},{total:100,events:1,music:0},{total:8.5},{total:12,events:0}])assert.throws(()=>planVoiceBudget(budget));
 assert.throws(()=>createBudgetedAudioScene({budget:{total:18,events:4,music:1},stems:[{},{}]}),/reservation/);
});

test('stinger state guard is checked again after decode; only actual starts duck music',async()=>{
 const nodes=[],context={state:'running',currentTime:0,sampleRate:48000,destination:{}};
 const param=()=>({value:1,cancelScheduledValues(){},setValueAtTime(v){this.value=v},linearRampToValueAtTime(v){this.value=v}});
 const node=(props={})=>{const n={connect(){},disconnect(){},...props};nodes.push(n);return n};
 context.createGain=()=>node({gain:param()});
 context.createBufferSource=()=>node({playbackRate:param(),start(){this.started=true},stop(){}});
 context.decodeAudioData=async()=>({length:48000,numberOfChannels:1,sampleRate:48000});
 const b={length:96000,sampleRate:48000,numberOfChannels:1,getChannelData(){}};
 const graph={initial:'peace',states:{peace:{tempo:120,beatsPerBar:4,bars:1},battle:{tempo:120,beatsPerBar:4,bars:1}},edges:{peace:['battle'],battle:['peace']}};
 let release,entered;const waiting=new Promise(r=>{entered=r});
 const scene=createBudgetedAudioScene({context,score:{graph,buffers:{peace:b,battle:b}},budget:{total:8,events:2,music:2},stingers:{discovery:{url:'sample',states:['peace'],duckGain:.4,cooldown:1}},fetcher:()=>{entered();return new Promise(r=>{release=r})}});
 await scene.music.start();
 const pending=scene.playStinger('discovery');await waiting;
 assert.equal(await scene.playStinger('discovery'),false);
 scene.music.request('battle',{quantize:'immediate',fadeSeconds:0});
 release({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});
 assert.equal(await pending,false);assert.equal(scene.stats.musicDucking.gain,1);
 context.currentTime=1;scene.music.update();
 assert.equal(await scene.playStinger('discovery'),false);
 scene.music.request('peace',{quantize:'immediate',fadeSeconds:0});
 context.currentTime=2;scene.music.update();
 assert.equal(await scene.playStinger('discovery'),true);
 context.currentTime=2.1;assert.equal(scene.stats.musicDucking.gain,.4);
 assert.equal(await scene.playStinger('discovery'),false);
 assert.ok(scene.stats.allocated<=8);
 scene.destroy();assert.equal(scene.stats.allocated,0);
});

test('ambience memory limits unique snapshot and active PCM before graph mutation',async()=>{
 const {world}=fixture({maxVoices:2,maxAmbienceDecodedBytes:192000});
 await world.reconcile({listener,sources:[at('a',1),at('b',2)]});
 assert.equal(world.stats.externalSnapshotBytes,192000);
 assert.equal(world.stats.snapshotAndActiveBytes,192000);
 const other={...buffer};await assert.rejects(world.reconcile({listener,sources:[{...at('c',1),buffer:other}]}),/Ambience decoded memory budget/);
 assert.equal(world.stats.active,2);assert.equal(world.stats.snapshotAndActiveBytes,192000);
 world.destroy();assert.equal(world.stats.snapshotAndActiveBytes,0);
});
