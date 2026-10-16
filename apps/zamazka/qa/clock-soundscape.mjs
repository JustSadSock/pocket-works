import assert from 'node:assert/strict';
import {CLOCK_START_SECONDS,CLOCK_ALERTS,stepClockSound} from '../clock-soundscape.js';
import {MuseumAudio,MUSEUM_SOUND_EVENTS} from '../museum-audio.js';

assert.equal(CLOCK_START_SECONDS,15);
assert.deepEqual(CLOCK_ALERTS.map(x=>[x.at,x.event]),[[10,'watch-warning'],[5,'watch-five'],[0,'time-up']]);
for(const kind of ['watch-warning','watch-five','time-up','token'])
 assert(MUSEUM_SOUND_EVENTS.includes(kind));

let previous=null;
const take=(key,ms)=>{
 const result=stepClockSound(previous,key,ms);
 previous=result.state;
 return result;
};
assert.deepEqual([take('preview',19000).ticking,take('preview',15200).ticking,take('preview',14900).ticking],[false,false,true]);
assert.equal(take('preview',10700).cue,null);
assert.equal(take('preview',10050).cue,null);
assert.equal(take('preview',9950).cue,'watch-warning');
assert.equal(take('preview',9700).cue,null,'warning is emitted only once');
assert.equal(take('preview',5100).cue,null);
assert.equal(take('preview',4920).cue,'watch-five');
assert.equal(take('preview',4500).cue,null,'five-second chime must not repeat');
assert.equal(take('preview',100).cue,null);
const zero=take('preview',-75);
assert.equal(zero.cue,'time-up');
assert.equal(zero.ticking,false);
assert.equal(take('preview',-700).cue,null,'time-over chime must never loop');
assert.equal(take('drawing',14900).cue,null,'new phase resets threshold state');
assert.equal(take('drawing',9980).cue,'watch-warning','each round phase gets its own cues');
assert.equal(take('drawing',4300).cue,'watch-five','one delayed UI frame may still play the five-second cue');
assert.equal(take('drawing',1000).cue,null,'do not replay outdated cues after resume');
assert.equal(take('drawing',-150).cue,'time-up');
assert.equal(take('drawing',-900).cue,null);
assert.equal(stepClockSound(null,'late-room',300).cue,null,'do not ring for newly entered already-expired stage');

const silent=new MuseumAudio(false);
assert.equal(silent.play('watch-warning',true),false);
assert.equal(silent.syncCountdown('preview',15000,0),false,'muted countdown must not make an audio context');
assert.equal(silent.context,null);
silent.dispose();

// Minimal fake Web Audio checks the actual tick scheduler without loud playback.
class Param{
 constructor(){this.value=1;this.events=[]}
 setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t])}
 exponentialRampToValueAtTime(v,t){this.value=v;this.events.push(['exp',v,t])}
 setTargetAtTime(v,t,d){this.value=v;this.events.push(['target',v,t,d])}
 cancelScheduledValues(t){this.events.push(['cancel',t])}
}
class Node{
 constructor(context){this.ctx=context;this.gain=new Param();this.frequency=new Param();this.Q=new Param();this.playbackRate=new Param()}
 connect(){return this}
 disconnect(){this.disconnected=true}
 start(t){this.ctx.starts.push(t)}
 stop(t){this.ctx.stops.push(t)}
}
class FakeContext{
 constructor(){this.currentTime=30;this.sampleRate=10000;this.state='running';this.destination={};this.starts=[];this.stops=[]}
 createGain(){return new Node(this)}
 createBufferSource(){return new Node(this)}
 createBiquadFilter(){return new Node(this)}
 createOscillator(){return new Node(this)}
 createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)}}
 close(){this.state='closed';return Promise.resolve()}
}
const original=globalThis.AudioContext;
globalThis.AudioContext=FakeContext;
try{
 const synth=new MuseumAudio(true);
 assert.equal(synth.play('press',true),true,'a player action unlocks Web Audio');
 assert.equal(synth.syncCountdown('room/drawing',15000,0),true,'clock starts exactly at 15s');
 assert(synth.clock,'the clock has its own gain bus');
 const oldBus=synth.clock.bus;
 assert(synth.context.starts.length>=5,'tick and tock are scheduled ahead of UI updates');
 const before=synth.context.starts.length;
 assert.equal(synth.syncCountdown('room/drawing',15000,0),true);
 assert.equal(synth.context.starts.length,before,'same UI tick does not schedule duplicate clock sounds');
 assert.equal(synth.play('watch-warning'),true);
 assert(oldBus.gain.events.some(e=>e[0]==='target'&&e[1]===.10),'Clockmaker ducks mechanical ticking');
 synth.setVolume(.13);assert.equal(synth.volume,.13);
 synth.setEnabled(false);assert.equal(synth.clock,null,'muting stops the mechanical bed immediately');
 assert.equal(synth.play('watch-five'),false,'muted five-second bell stays silent');
 synth.dispose();
}finally{
 if(original===undefined)delete globalThis.AudioContext;
 else globalThis.AudioContext=original;
}
console.log('ZAMAZKA: 15s escapement, one-shot 10/5/0 Clockmaker, volume, mute, dedup and priority ducking OK');
