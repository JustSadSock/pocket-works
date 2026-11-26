import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSeamlessLoop,createDynamicEmitter,createAdaptiveMusic,stemGainAtIntensity} from '../../shared/capabilities/continuous-audio.js';
function fixture(){
 const nodes=[];
 const param=()=>({value:1,events:[],cancelScheduledValues(t){this.events.push(['cancel',t])},setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t])},linearRampToValueAtTime(v,t){this.value=v;this.events.push(['ramp',v,t])}});
 const node=(kind,props={})=>{const n={kind,connect(){},disconnect(){this.disconnected=true},...props};nodes.push(n);return n};
 const context={state:'running',sampleRate:48000,currentTime:1,destination:{},async resume(){this.state='running'},
  createBuffer(ch,length,rate){const data=Array.from({length:ch},()=>new Float32Array(length));return {numberOfChannels:ch,length,sampleRate:rate,getChannelData:c=>data[c]}},
  createGain:()=>node('gain',{gain:param()}),createBiquadFilter:()=>node('filter',{frequency:param(),Q:param()}),createStereoPanner:()=>node('pan',{pan:param()}),createDelay:()=>node('delay',{delayTime:param()}),
  createBufferSource:()=>node('source',{start(t){this.started=t??0},stop(){this.stopped=true;this.onended?.()}})
 };
 return {nodes,context};
}
const near={source:{x:0,y:0},listener:{x:0,y:0}};
test('loop overlap preserves both channels and matches the original boundary neighbourhood',()=>{
 const {context}=fixture(),b=context.createBuffer(2,8000,8000);
 for(let c=0;c<2;c++)for(let i=0;i<b.length;i++)b.getChannelData(c)[i]=Math.sin(i*.07+c)*.3;
 const loop=makeSeamlessLoop(context,b,{crossfadeSeconds:.1});
 assert.equal(loop.length,7200);
 for(let c=0;c<2;c++){
  const x=b.getChannelData(c),y=loop.getChannelData(c);
  assert.equal(y[0],x[7200]);assert.equal(y[799],x[799]);assert.equal(y.at(-1),x[7199]);
  assert.ok(y.every(Number.isFinite));
 }
 assert.throws(()=>makeSeamlessLoop(context,b,{crossfadeSeconds:.5}));
});
test('emitter updates attenuation and direction without restarting, then tears down',async()=>{
 const {context,nodes}=fixture(),emitter=createDynamicEmitter({context,buffer:context.createBuffer(1,8000,8000),spatial:near});
 assert.equal(await emitter.start(),true);
 const source=nodes.find(n=>n.kind==='source');
 assert.equal(source.loop,true);
 assert.equal(emitter.update({source:{x:0,y:50},listener:{x:0,y:0},occlusion:.8,zone:'forest'}),true);
 assert.equal(nodes.filter(n=>n.kind==='source').length,1);
 assert.equal(nodes.find(n=>n.kind==='pan').pan.value,1);assert.ok(emitter.profile.gain<.02);
 assert.equal(nodes.find(n=>n.kind==='filter').frequency.value,emitter.profile.cutoff);
 emitter.stop();assert.equal(emitter.active,false);assert.ok(nodes.every(n=>n.disconnected));
 assert.equal(await emitter.start(),true);emitter.destroy();assert.equal(await emitter.start(),false);
});
test('adaptive music phase lock, independent targets, restart and immutable grid',async()=>{
 const {context,nodes}=fixture(),buffer=context.createBuffer(1,8000,8000);
 const stems=[{id:'base',buffer,base:1},{id:'high',buffer,threshold:.2,width:.6}];
 const player=createAdaptiveMusic({context,stems});
 assert.equal(await player.start(),true);
 const sources=nodes.filter(n=>n.kind==='source');
 assert.equal(sources.length,2);assert.equal(sources[0].started,sources[1].started);
 assert.equal(player.state.targets.high,0);
 const started=player.state.startTime;player.setIntensity(.5,{fadeSeconds:1});
 assert.ok(Math.abs(player.state.targets.high-.5)<1e-9);assert.equal(player.state.startTime,started);
 assert.equal(nodes.filter(n=>n.kind==='source').length,2);
 player.stop();assert.equal(player.state.active,false);assert.ok(sources.every(n=>n.disconnected));
 context.currentTime=3;assert.equal(await player.start(),true);assert.ok(player.state.startTime>started);
 player.destroy();assert.equal(await player.start(),false);
 assert.throws(()=>createAdaptiveMusic({context,stems:[...stems,{id:'bad',buffer:context.createBuffer(1,8001,8000)}]}));
 assert.equal(stemGainAtIntensity({base:1,gain:.7},0),.7);
});
test('pending unlock cannot start a destroyed emitter or music player',async()=>{
 for(const kind of ['emitter','music']){
  const {context,nodes}=fixture();context.state='suspended';let release;
  context.resume=()=>new Promise(r=>{release=()=>{context.state='running';r()}});
  const buffer=context.createBuffer(1,8000,8000);
  const p=kind==='emitter'?createDynamicEmitter({context,buffer,spatial:near}):createAdaptiveMusic({context,stems:[{id:'base',buffer,base:1}]});
  const pending=p.start();p.destroy();release();assert.equal(await pending,false);
  assert.equal(nodes.filter(n=>n.kind==='source').length,0);
 }
});
