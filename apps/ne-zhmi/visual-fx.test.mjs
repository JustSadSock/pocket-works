import test from 'node:test';
import assert from 'node:assert/strict';
import {createVisualEffects,EFFECT_PRESETS} from './visual-fx.js';
import {createSoundscape} from './soundscape.js';

test('registered effects exist for all meaningful robot actions',()=>{
 for(const type of ['jump','reverse','push','spring','land','wall','gate','cargo',
   'checkpoint','hazard','respawn','finish','magnet','brake','float'])
   assert.ok(EFFECT_PRESETS[type],type);
});
test('bad coordinates and unknown events cannot create particles',()=>{
 const fx=createVisualEffects();
 assert.equal(fx.emit('missing',1,2),false);
 assert.equal(fx.emit('jump',NaN,2),false);
 assert.equal(fx.emit('jump',1,Infinity),false);
 assert.equal(fx.stats().particles,0);
});
test('particles are bounded under a burst of 200 network events',()=>{
 const fx=createVisualEffects({limit:95});
 for(let i=0;i<200;i++)fx.emit(i%2?'finish':'jump',i*.025,6,1);
 assert.ok(fx.stats().particles<=95);
 assert.ok(fx.stats().rings<=15);
});
test('all particles expire and director resets without residual state',()=>{
 const fx=createVisualEffects();
 fx.emit('finish',5,5);
 for(let i=0;i<300;i++)fx.advance(.04);
 assert.deepEqual(fx.stats().particles,0);
 assert.deepEqual(fx.stats().rings,0);
 fx.emit('wall',8,5);
 fx.clear();assert.equal(fx.stats().particles,0);
 assert.equal(fx.stats().rings,0);
});
test('reduced motion lowers burst density and removes expanding rings',()=>{
 const standard=createVisualEffects(),reduced=createVisualEffects({reducedMotion:true});
 standard.emit('finish',2,2);reduced.emit('finish',2,2);
 assert.ok(reduced.stats().particles<standard.stats().particles);
 assert.equal(reduced.stats().rings,0);
});
test('invalid frame deltas never generate invalid states',()=>{
 const fx=createVisualEffects();
 fx.emit('push',1.5,4);
 for(const dt of [NaN,Infinity,-100,10000,undefined])fx.advance(dt);
 assert.ok(fx.stats().particles>=0);
});
test('muted soundscape never instantiates an audio context or plays',()=>{
 const audio=createSoundscape({audioContext:null});
 audio.setMuted(true);
 assert.equal(audio.play('jump'),false);
 assert.equal(audio.isMuted(),true);
 audio.setMuted(false);
 assert.equal(audio.play('unrecognized'),false);
});
test('soundscape creates two independent short-lived voices for a robot leap',()=>{
 const voices=[];
 const context={state:'running',currentTime:0,destination:{},
  createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};},
  createOscillator(){
   const v={frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},
    connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};
   voices.push(v);return v;
  }
 };
 const audio=createSoundscape({audioContext:context});
 assert.equal(audio.play('jump'),true);
 assert.equal(voices.length,2);
 assert.ok(voices.every(v=>v.started&&v.stopped));
 audio.setMuted(true);audio.play('finish');assert.equal(voices.length,2);
});
