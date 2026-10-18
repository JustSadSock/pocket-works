import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SOUND_PALETTE,soundDuration,createArenaSoundscape} from '../audio-design.js';
import {initialMatch,simulateRound} from '../engine.js';
import {paintArena,perimeterOrder,gravityProgress,drawArenaCanvas} from '../combat-visuals.js';

test('all eleven cues have independent durations, including fall and long collapse',()=>{
 assert.equal(Object.keys(SOUND_PALETTE).length,11);
 for(const name of ['tap','plan','move','attack','shield','block','hit','fall','collapse','win','error'])
  assert.ok(soundDuration(name)>=.1,name);
 assert.ok(soundDuration('collapse')>soundDuration('hit')*2);
});
test('sound respects mute and volume without ever opening an audio context',()=>{
 let attempts=0;
 const fake=class{constructor(){attempts++}};
 const session=createArenaSoundscape({AudioContextClass:fake});
 assert.equal(session.play('hit',{enabled:false,volume:100}),false);
 assert.equal(session.play('hit',{enabled:true,volume:0}),false);
 assert.equal(session.play('nonexistent',{enabled:true,volume:75}),false);
 assert.equal(attempts,0);
});
test('eleven acoustic recipes schedule multiple finite audio voices and shared single context',()=>{
 const data={contexts:0,oscillators:0,sources:0,started:0,stopped:0,masterConnections:0};
 const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}});
 class MockNode{
  constructor(){this.gain=param();this.frequency=param();this.pan=param();this.threshold=param();
   this.knee=param();this.ratio=param();this.attack=param();this.release=param()}
  connect(){data.masterConnections++;return this}
  start(){data.started++}
  stop(){data.stopped++}
 }
 class MockAudio{
  constructor(){data.contexts++;this.currentTime=5;this.sampleRate=4096;this.destination=new MockNode();this.state='running'}
  createDynamicsCompressor(){return new MockNode()}
  createGain(){return new MockNode()}
  createOscillator(){data.oscillators++;return new MockNode()}
  createBiquadFilter(){return new MockNode()}
  createStereoPanner(){return new MockNode()}
  createBuffer(){return {duration:1,getChannelData:()=>new Float32Array(4096)}}
  createBufferSource(){data.sources++;return new MockNode()}
  close(){return Promise.resolve()}
 }
 const audio=createArenaSoundscape({AudioContextClass:MockAudio});
 for(const key of Object.keys(SOUND_PALETTE))assert.equal(audio.play(key,{volume:70,enabled:true}),true);
 assert.equal(data.contexts,1);
 assert.ok(data.sources>=10);
 assert.ok(data.oscillators>=18);
 assert.equal(data.started,data.stopped);
 audio.stop();
});
test('falling slabs are 16 actual perimeter tiles with distinct release orders',()=>{
 const seen=[];
 for(let y=0;y<5;y++)for(let x=0;x<5;x++){
  const index=perimeterOrder(x,y);
  if(x===0||x===4||y===0||y===4)seen.push(index);
  else assert.equal(index,-1);
 }
 assert.equal(seen.length,16);
 assert.equal(new Set(seen).size,16);
 assert.deepEqual(seen.slice().sort((a,b)=>a-b),Array.from({length:16},(_,i)=>i));
 assert.equal(gravityProgress(0),0);assert.equal(gravityProgress(1),1);
 assert.ok(gravityProgress(.5)<.5,'fall accelerates under gravity');
});
test('collapse originates in authoritative round four and canvas retains a permanent void',async()=>{
 const original=initialMatch();original.round=4;
 const plans={A:['up','down','left','right','shield'],B:['up','down','left','right','shield']};
 const frame=simulateRound(original,plans).record.frames[0];
 assert.ok(frame.events.some(e=>e.type==='collapse'));
 const css=await readFile(new URL('../styles.css',import.meta.url),'utf8');
 const visuals=await readFile(new URL('../combat-visuals.js',import.meta.url),'utf8');
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(visuals,/if\(perimeter&&edges\)cell\.classList\.add\('lava','void'\)/);
 assert.match(css,/\.cell\.shatter::before/);
 assert.match(css,/@keyframes arenaSlabGravity/);
 assert.match(css,/translate3d\(var\(--fall-drift/);
 assert.match(css,/\.board> *\.piece\.falling/);
 assert.match(visuals,/state\.collapse\?Math\.max\(450,720/);
 assert.match(visuals,/ctx\.fillStyle=lava\?'#070c15'/);
 assert.match(app,/import \{createArenaSoundscape\} from '.\/audio-design\.js'/);
});
