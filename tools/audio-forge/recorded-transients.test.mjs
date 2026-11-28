import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTransientNote} from './recorded-transients.mjs';
test('short decaying pitched attack is measured independently of sustain windows',()=>{
 const a=new Float32Array(24000),hz=440*2**(9/1200);
 for(let i=480;i<a.length;i++){const t=(i-480)/48000,p=2*Math.PI*hz*t;a[i]=(.25*Math.sin(p)+.05*Math.sin(2*p))*Math.min(1,(i-480)/150)*Math.exp(-t/.12);}
 const z=prepareTransientNote(a,69);
 assert.ok(Math.abs(z.measuredMidi-69.09)<.12);
 assert.ok(z.offsetFrames>=240&&z.offsetFrames<=720);
 assert.throws(()=>prepareTransientNote(a,57),/disagrees/);
 assert.throws(()=>prepareTransientNote(new Float32Array(24000),69),/Silent/);
});
