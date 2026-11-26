import test from 'node:test';
import assert from 'node:assert/strict';
import {spatialProfile,createSpatialMixer} from '../../shared/capabilities/spatial-audio.js';
import {createSoundFamilyPlayer} from '../../shared/capabilities/sound-family.js';
const listener={x:0,y:0};
const profile=(source,opts={})=>spatialProfile({source,listener,...opts});
test('distance attenuation, smooth boundary and heading-dependent pan',()=>{
  assert.equal(profile(listener).gain,1);assert.equal(profile(listener).pan,0);
  assert.equal(profile({x:0,y:10}).pan,1);assert.equal(profile({x:0,y:-10}).pan,-1);
  assert.ok(Math.abs(profile({x:10,y:0},{heading:Math.PI/2}).pan+1)<1e-12);
  assert.ok(profile({x:20,y:0}).gain<profile({x:10,y:0}).gain);
  assert.equal(profile({x:120,y:0}).gain,0);
  assert.ok(profile({x:119.9,y:0}).gain<.001);
});
test('forest absorption, occlusion and stone reflection are distinct',()=>{
  const p={x:30,y:0},dry=profile(p),forest=profile(p,{zone:'forest'}),wall=profile(p,{occlusion:1});
  assert.ok(forest.gain<dry.gain&&forest.cutoff<dry.cutoff);
  assert.ok(wall.gain<dry.gain&&wall.cutoff<dry.cutoff);
  assert.ok(profile(p,{zone:'stone'}).reflection>dry.reflection);
  assert.throws(()=>profile(p,{zone:'unknown'}));assert.throws(()=>profile(p,{occlusion:2}));
  assert.throws(()=>profile({x:NaN,y:0}));
});
function fixture(){
  const nodes=[];
  const param=()=>({value:1,setTargetAtTime(value){this.value=value}});
  const make=(kind,props={})=>{const node={kind,connections:[],connect(dest){this.connections.push(dest)},disconnect(){this.connections=[];this.disconnected=true},...props};nodes.push(node);return node};
  const context={state:'running',sampleRate:48000,currentTime:0,destination:{},createGain:()=>make('gain',{gain:param()}),createBiquadFilter:()=>make('filter',{frequency:param(),Q:param()}),createStereoPanner:()=>make('pan',{pan:param()}),createDelay:()=>make('delay',{delayTime:param()}),createBufferSource:()=>make('source',{playbackRate:param(),start(){this.started=true},stop(){this.onended?.()}}),async decodeAudioData(){return {length:480,numberOfChannels:1}},createDynamicsCompressor:()=>make('compressor',Object.fromEntries(['threshold','knee','ratio','attack','release'].map(k=>[k,param()])))};
  return {context,nodes};
}
test('mixer bus isolation, volume and teardown',()=>{
  const {context,nodes}=fixture(),m=createSpatialMixer({context});
  const a=m.bus('combat'),b=m.bus('music');
  assert.notEqual(a,b);assert.equal(a,m.bus('combat'));
  m.setBusVolume('combat',.2);assert.equal(a.gain.value,.2);assert.equal(b.gain.value,1);
  m.setVolume(.4);assert.equal(nodes[0].gain.value,.4);m.destroy();m.destroy();
  assert.ok(nodes.every(n=>n.disconnected));assert.throws(()=>m.bus('combat'));
});
test('family player builds acoustic graph and cleans reflections',async()=>{
  const {context,nodes}=fixture();let requests=0;
  const player=createSoundFamilyPlayer({context,random:()=>.5,families:{hit:{variants:['a'],pitchCents:0,gainSpread:0}},fetcher:async()=>{requests++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}}});
  assert.equal(await player.play('hit',{spatial:{listener,source:{x:200,y:0}}}),false);assert.equal(requests,0);
  const spatial={listener,source:{x:0,y:10},zone:'stone',occlusion:.5};
  assert.equal(await player.play('hit',{spatial}),true);
  const p=spatialProfile(spatial);
  assert.equal(nodes.find(n=>n.kind==='filter').frequency.value,p.cutoff);
  assert.equal(nodes.find(n=>n.kind==='pan').pan.value,1);
  assert.equal(nodes.find(n=>n.kind==='delay').delayTime.value,p.delay);
  const src=nodes.find(n=>n.kind==='source');src.onended();
  assert.equal(player.stats.voices,1);
  player.stopAll();assert.equal(player.stats.voices,0);assert.ok(nodes.every(n=>n.disconnected));
  player.destroy();
});
