import test from 'node:test';
import assert from 'node:assert/strict';
import {compileRecordedExpression} from './recorded-expression.mjs';

const ratio=cents=>2**(cents/1200);

test('attack bend resolves smoothly to the recorded pitch',()=>{
 const e=compileRecordedExpression({attackBend:{cents:-24,durationSeconds:.08}},.6);
 assert.ok(Math.abs(e.rateAt(0)-ratio(-24))<1e-12);
 assert.ok(Math.abs(e.rateAt(.04)-ratio(-6))<1e-12);
 assert.equal(e.rateAt(.08),1);
 assert.equal(e.rateAt(.3),1);
 assert.equal(e.metadata.attackBend.cents,-24);
});

test('vibrato has a delayed onset, a bounded fade and a deterministic phase',()=>{
 const config={vibrato:{depthCents:20,rateHz:5,delaySeconds:.1,fadeInSeconds:.2,releaseSeconds:.1}};
 const a=compileRecordedExpression(config,1),b=compileRecordedExpression(config,1);
 assert.equal(a.rateAt(.05),1);
 assert.equal(a.rateAt(.1),1);
 assert.ok(a.rateAt(.15)>1);
 assert.ok(a.rateAt(.25)<1);
 assert.equal(a.rateAt(1),1);
 for(const t of [0,.1,.15,.25,.5,.9,1])assert.equal(a.rateAt(t),b.rateAt(t));
 assert.ok(a.metadata.maxDeviationCents<=45);
});

test('combined ornaments remain within the declared pitch envelope',()=>{
 const e=compileRecordedExpression({
  vibrato:{depthCents:18,rateHz:5.2,delaySeconds:.1,fadeInSeconds:.14,releaseSeconds:.1},
  attackBend:{cents:-16,durationSeconds:.065}
 },.5);
 const rates=Array.from({length:24000},(_,i)=>e.rateAt(i/48000));
 assert.ok(rates.every(x=>Number.isFinite(x)&&x>.9&&x<1.1));
 assert.ok(Math.min(...rates)<1);
 assert.ok(Math.max(...rates)>1);
});

test('rejects malformed controls, unknown properties and impossible timings',()=>{
 const invalid=[
  [{vibrato:{depthCents:46}},.5],
  [{vibrato:{rateHz:2}},.5],
  [{vibrato:{delaySeconds:.6}},.5],
  [{attackBend:{cents:81,durationSeconds:.1}},.5],
  [{attackBend:{cents:10,durationSeconds:.6}},.5],
  [{vibrato:{unknown:1}},.5],
  [{unknown:true},.5],
  [{},.5],
  [null,.5]
 ];
 for(const [config,duration] of invalid)assert.throws(()=>compileRecordedExpression(config,duration));
 assert.throws(()=>compileRecordedExpression({vibrato:{depthCents:10}},.1));
 assert.throws(()=>compileRecordedExpression({attackBend:{cents:10,durationSeconds:.05}},NaN));
});
