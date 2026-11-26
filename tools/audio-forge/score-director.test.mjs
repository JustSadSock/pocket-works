import test from 'node:test';
import assert from 'node:assert/strict';
import {createScoreDirector} from '../../shared/capabilities/score-director.js';
function fixture(){
 const nodes=[];
 const p=()=>({value:1,events:[],setValueAtTime(v,t){this.events.push(['set',v,t])},linearRampToValueAtTime(v,t){this.events.push(['ramp',v,t])},cancelScheduledValues(){}});
 const node=(kind,extra)=>{const n={kind,connect(){},disconnect(){this.disconnected=true},...extra};nodes.push(n);return n};
 const context={currentTime:0,state:'running',destination:{},createGain:()=>node('gain',{gain:p()}),createBufferSource:()=>node('source',{start(t){this.started=t},stop(t){this.stopped=t??-1}})};
 const graph={initial:'peace',states:{peace:{tempo:120,beatsPerBar:4,bars:1},battle:{tempo:60,beatsPerBar:3,bars:1},after:{tempo:120,beatsPerBar:4,bars:1}},edges:{peace:['battle'],battle:['after'],after:['peace']}};
 const buffers=Object.fromEntries(Object.entries(graph.states).map(([id,s])=>[id,{length:48000*60/s.tempo*s.beatsPerBar,sampleRate:48000,numberOfChannels:1,getChannelData(){}}]));
 return {context,nodes,graph,buffers};
}
test('different score grids switch at a bar and obey graph',async()=>{
 const {context,nodes,graph,buffers}=fixture(),p=createScoreDirector({context,graph,buffers});
 assert.equal(await p.start(),true);assert.equal(p.state.current,'peace');
 assert.equal(p.request('after'),false);context.currentTime=.2;
 assert.equal(p.request('battle',{fadeSeconds:.25}),true);
 assert.equal(p.state.transitionAt,2.05);assert.equal(p.state.voices,2);
 assert.equal(nodes.filter(n=>n.kind==='source')[0].stopped,2.3);
 context.currentTime=2.31;p.update();assert.equal(p.state.current,'battle');assert.equal(p.state.voices,1);
 assert.equal(p.request('after'),true);assert.equal(p.state.transitionAt,5.05);
 p.destroy();assert.equal(p.state.voices,0);assert.ok(nodes.every(n=>n.disconnected));
});
test('queue remains bounded and follows destination graph',async()=>{
 const {context,graph,buffers}=fixture(),p=createScoreDirector({context,graph,buffers});
 await p.start();context.currentTime=.2;p.request('battle');p.request('after');
 assert.equal(p.state.queued,'after');assert.equal(p.state.voices,2);
 context.currentTime=2.36;p.update();assert.equal(p.state.current,'battle');assert.equal(p.state.pending,'after');assert.equal(p.state.voices,2);
 context.currentTime=5.4;p.update();assert.equal(p.state.current,'after');assert.equal(p.state.voices,1);
 p.stop();assert.equal(p.state.current,null);assert.equal(await p.start(),true);p.destroy();
});
test('reject mismatched grids and invalid edges before allocating nodes',()=>{
 const {context,nodes,graph,buffers}=fixture();
 assert.throws(()=>createScoreDirector({context,graph,buffers:{...buffers,peace:{...buffers.peace,length:10}}}),/bar aligned/);
 assert.throws(()=>createScoreDirector({context,buffers,graph:{...graph,edges:{...graph.edges,peace:['missing']}}}),/edges/);
 assert.equal(nodes.length,0);
});

test('authored bridge plays once before destination loop and anchors new musical grid',async()=>{
 const {context,nodes,graph,buffers}=fixture();
 context.createBuffer=(numberOfChannels,length,sampleRate)=>{
  const data=Array.from({length:numberOfChannels},()=>new Float32Array(length));
  return {numberOfChannels,length,sampleRate,getChannelData:c=>data[c]};
 };
 buffers.battle=context.createBuffer(1,144000,48000);
 buffers.battle.getChannelData(0).fill(.2);
 const bridge=context.createBuffer(1,24000,48000);bridge.getChannelData(0).fill(.1);
 graph.bridges={'peace:battle':{file:'bridge.wav'}};
 const p=createScoreDirector({context,graph,buffers,bridgeBuffers:{'peace:battle':bridge}});
 await p.start();context.currentTime=.2;p.request('battle',{fadeSeconds:.12});
 const next=nodes.filter(n=>n.kind==='source')[1];
 assert.equal(next.loopStart,.5);assert.equal(next.loopEnd,3.5);
 assert.equal(next.buffer.length,168000);assert.ok(Math.abs(next.buffer.getChannelData(0)[0]-.1)<1e-6);
 assert.ok(Math.abs(next.buffer.getChannelData(0)[24000]-.2)<1e-6);
 assert.equal(p.state.bridgeUntil,2.55);context.currentTime=2.18;p.update();
 assert.equal(p.state.startTime,2.55);assert.equal(p.state.voices,1);
 p.request('after',{quantize:'immediate'});assert.equal(p.state.transitionAt,2.55);p.destroy();
});

test('score reservation deduplicates source PCM and budgets two bridge composites',()=>{
 const {context,nodes,graph,buffers}=fixture();
 const bridge={length:24000,sampleRate:48000,numberOfChannels:1,getChannelData(){}};
 graph.bridges={'peace:battle':{file:'bridge.wav'}};
 const options={context,graph,buffers,bridgeBuffers:{'peace:battle':bridge}};
 const expected=(96000+144000+96000+24000+2*(144000+24000))*4;
 assert.throws(()=>createScoreDirector({...options,maxDecodedBytes:expected-1}),/memory budget/);
 assert.equal(nodes.length,0);
 const p=createScoreDirector({...options,maxDecodedBytes:expected});
 assert.equal(p.memory.reservedBytes,expected);p.destroy();
});
