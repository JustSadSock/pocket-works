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

test('unified layers follow their state grid, keep phase, and reserve the worst edge',async()=>{
 const {context,nodes,graph,buffers}=fixture();
 const layers={peace:[{id:'pulse',buffer:{...buffers.peace},threshold:.2,width:.6}],battle:[{id:'brass',buffer:{...buffers.battle},threshold:.4,width:.6}]};
 assert.throws(()=>createScoreDirector({context,graph,buffers,layers,maxVoices:3}),/voice reservation/);
 assert.throws(()=>createScoreDirector({context,graph,buffers,layers:{peace:[{id:'bad',buffer:{...buffers.peace,length:10}}]}}),/unaligned/);
 assert.equal(nodes.length,0);
 const p=createScoreDirector({context,graph,buffers,layers,maxVoices:4});
 await p.start();assert.equal(p.state.voices,2);assert.equal(p.state.requiredVoices,4);
 const sources=()=>nodes.filter(n=>n.kind==='source');
 assert.equal(sources()[0].started,sources()[1].started);
 const layerGain=nodes.filter(n=>n.kind==='gain').at(-1).gain;
 context.currentTime=.2;p.setIntensity(.8,{quantize:'beat',fadeSeconds:.1});
 assert.ok(layerGain.events.some(e=>e[0]==='ramp'&&Math.abs(e[1]-1)<1e-9&&Math.abs(e[2]-.65)<1e-9));
 assert.equal(sources().length,2);assert.equal(p.state.startTime,.05);
 p.request('battle',{fadeSeconds:.25});
 assert.equal(p.state.voices,4);assert.equal(sources()[2].started,sources()[3].started);
 context.currentTime=2.31;p.update();assert.equal(p.state.current,'battle');assert.equal(p.state.voices,2);
 assert.equal(p.state.intensity,.8);
 p.setIntensity(0,{fadeSeconds:0});assert.equal(sources().length,4);
 p.destroy();assert.ok(nodes.every(n=>n.disconnected));
});
test('bridge prefix is silent on extra layers and identical loop grid is preserved',async()=>{
 const {context,nodes,graph,buffers}=fixture();
 context.createBuffer=(numberOfChannels,length,sampleRate)=>{
  const data=Array.from({length:numberOfChannels},()=>new Float32Array(length));
  return {numberOfChannels,length,sampleRate,getChannelData:c=>data[c]};
 };
 buffers.battle=context.createBuffer(1,144000,48000);
 const layer=context.createBuffer(1,144000,48000);layer.getChannelData(0).fill(.3);
 const bridge=context.createBuffer(1,24000,48000);bridge.getChannelData(0).fill(.1);
 graph.bridges={'peace:battle':{file:'bridge.wav'}};
 const options={context,graph,buffers,bridgeBuffers:{'peace:battle':bridge},layers:{battle:[{id:'brass',buffer:layer}]}};
 const p=createScoreDirector(options);assert.ok(p.memory.reservedBytes>p.memory.baseBytes);
 await p.start();context.currentTime=.2;p.request('battle');
 const [base,extra]=nodes.filter(n=>n.kind==='source').slice(1);
 assert.equal(base.started,extra.started);assert.equal(base.loopStart,extra.loopStart);
 assert.equal(extra.buffer.getChannelData(0)[23999],0);
 assert.ok(Math.abs(extra.buffer.getChannelData(0)[24000]-.3)<1e-6);
 p.destroy();
});
