import test from 'node:test';
import assert from 'node:assert/strict';
import {planScaledAudio,createScaledAudioPlanner} from '../../shared/capabilities/scaled-audio.js';
const b={length:48000,sampleRate:48000,numberOfChannels:1,getChannelData(){}};
const buffers={near:b,far:b};
const entities=Array.from({length:1000},(_,i)=>({id:'s'+i,region:'r'+i%4,family:'settlement',detailAsset:'near',regionalAsset:'far',x:(i%10)*4,y:Math.floor(i/10)%10,activity:.7,density:25,priority:1}));
const listener={x:0,y:0};
test('1000 settlements collapse to stable regional identities and capped local sources',()=>{
 const far=planScaledAudio({listener,zoom:0,entities,buffers,maxEmitters:8});
 assert.equal(far.logical,1000);assert.equal(far.regionalGroups,4);assert.equal(far.sources.length,4);assert.ok(far.sources.every(s=>s.id.startsWith('region:')));
 const near=planScaledAudio({listener,zoom:1,entities,buffers,maxEmitters:8});assert.equal(near.sources.length,8);assert.ok(near.sources.every(s=>s.id.startsWith('detail:')));
 assert.deepEqual(far,planScaledAudio({listener,zoom:0,entities:[...entities].reverse(),buffers,maxEmitters:8}));
});
test('camera zoom smoothing uses elapsed time and stable region identities',()=>{
 const p=createScaledAudioPlanner({buffers,maxEmitters:8});const a=p.plan({listener,zoom:0,entities,deltaSeconds:0});
 const x=p.plan({listener,zoom:1,entities,deltaSeconds:.1});assert.ok(x.zoom>0&&x.zoom<.5);
 const y=p.plan({listener:{x:10,y:0},zoom:1,entities,deltaSeconds:2});assert.ok(y.zoom>.99);
 p.reset();assert.equal(p.plan({listener,zoom:0,entities,deltaSeconds:0}).zoom,a.zoom);
});
test('invalid snapshots are rejected',()=>{
 assert.throws(()=>planScaledAudio({listener,zoom:1,entities:[entities[0],entities[0]],buffers}),/Duplicate/);
 assert.throws(()=>planScaledAudio({listener,zoom:1,entities:[{...entities[0],activity:2}],buffers}),/Invalid/);
});
