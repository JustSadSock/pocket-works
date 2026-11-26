import test from 'node:test';
import assert from 'node:assert/strict';
import {createVirtualAudioWorld} from '../../shared/capabilities/virtual-audio.js';
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
