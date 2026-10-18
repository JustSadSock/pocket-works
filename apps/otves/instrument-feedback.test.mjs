import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rollingEnvelope, impactEnvelope, hapticDuration, createInstrumentAudio
} from './instrument-feedback.js';

test('rolling is silent at rest and rises smoothly without high-frequency chirps',()=>{
  for(const velocity of [0,.06,.14]) assert.equal(rollingEnvelope(velocity).gain,0);
  const samples=[.18,.4,.8,1.4,2.6,4.8,6].map(rollingEnvelope);
  for(let i=1;i<samples.length;i++){
    assert.ok(samples[i].gain >= samples[i-1].gain);
    assert.ok(samples[i].cutoff >= samples[i-1].cutoff);
  }
  for(const p of samples) {
    assert.ok(p.gain<=.24);
    assert.ok(p.cutoff<=1470);
    assert.ok(p.pitch<=138);
  }
});

test('glass collisions have short bounded resonances scaled by speed',()=>{
  const slow=impactEnvelope(.12),fast=impactEnvelope(5.7),absurd=impactEnvelope(Infinity);
  assert.ok(fast.gain>slow.gain);
  assert.ok(fast.secondaryFrequency>fast.frequency);
  assert.ok(fast.duration<.12&&slow.duration>.05);
  for(const data of [slow,fast,absurd]){
    for(const num of Object.values(data)) assert.ok(Number.isFinite(num));
  }
});

test('all tactile signals are intentional and bounded',()=>{
  assert.equal(hapticDuration('click'),5);
  assert.deepEqual(hapticDuration('success'),[12,35,18]);
  assert.equal(hapticDuration('landing'),9);
  assert.ok(hapticDuration('collision',200)<=12);
  assert.equal(hapticDuration('unknown'),0);
});

test('sound engine remains safe on unsupported platforms and when muted',async()=>{
  const previous=globalThis.AudioContext,oldDocument=globalThis.document;
  try {
    globalThis.AudioContext=undefined;
    globalThis.document={
      addEventListener(){},removeEventListener(){},hidden:false
    };
    const audio=createInstrumentAudio({enabled:false});
    assert.equal(audio.enabled,false);
    assert.equal(audio.available,false);
    assert.equal(await audio.unlock(),false);
    assert.equal(audio.play('click'),false);
    assert.equal(audio.impact(2.3),undefined);
    assert.equal(audio.rolling(2.1),undefined);
    audio.setEnabled(true);
    assert.equal(await audio.unlock(),false);
    audio.setPaused(true);
    await audio.destroy();
    await audio.destroy();
  } finally {
    globalThis.AudioContext=previous;
    globalThis.document=oldDocument;
  }
});
