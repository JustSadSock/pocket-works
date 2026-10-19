import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_SCARS,sanitizeScars,addScar,scarSignature,deathPose} from '../scars.js';
import {validateRun} from '../stability.js';

test('3000 damage events stay bounded, quantized and keyed to the real organ',()=>{
 let scars=[];
 for(let i=0;i<3000;i++){
  const stage=i%5+1,kind=['blood','burn','rupture'][i%3];
  scars=addScar(scars,stage,i*.11-100,i*.29-100,kind);
  assert.ok(scars.length<=MAX_SCARS);
 }
 assert.equal(scars.length,MAX_SCARS);
 for(const scar of scars){
  assert.ok(Number.isInteger(scar.x*4));assert.ok(Number.isInteger(scar.z*4));
  assert.ok(scar.wave>=1&&scar.wave<=5);
 }
 assert.deepEqual(sanitizeScars(scars),scars);
 const total=Array.from({length:5},(_,i)=>scarSignature(scars,i+1).count).reduce((a,b)=>a+b,0);
 assert.equal(total,MAX_SCARS);
});
test('repeated shots reuse a single mark rather than multiplying invisible objects',()=>{
 let ledger=addScar([],2,3.02,4.08,'burn');
 for(let i=0;i<150;i++)ledger=addScar(ledger,2,3.07,4.04,'burn');
 assert.equal(ledger.length,1);
 assert.equal(scarSignature(ledger,2).burn,1);
 ledger=addScar(ledger,2,3.02,4.08,'rupture');
 assert.equal(ledger.length,2);
 assert.deepEqual(scarSignature(ledger,3),{wave:3,count:0,blood:0,rupture:0,burn:0});
});
test('invalid and malicious scars cannot corrupt session or overflow GPU ledger',()=>{
 const input=[null,{wave:8,x:0,z:0,kind:'blood'},
  {wave:1,x:NaN,z:0,kind:'blood'},{wave:1,x:3,z:4,kind:'script'},
  {wave:1,x:3.125,z:4.25,kind:'blood'}];
 assert.equal(sanitizeScars(input).length,1);
 assert.equal(sanitizeScars(input)[0].x,3.25);
 const old=validateRun({v:5,seed:413,x:3,z:3,wave:3,hp:100});
 assert.deepEqual(old.scars,[]);
 const session=validateRun({v:5,seed:413,x:3,z:3,wave:3,hp:100,scars:input});
 assert.equal(session.scars.length,1);
 assert.deepEqual(validateRun(session),session);
 assert.equal(addScar(session.scars,7,4,5,'blood').length,1);
});
test('death animation has species-specific collapse, then removes ghost after ≤1 second',()=>{
 for(const type of ['crawler','ossuary','synapse','brute','heart']){
  const first=deathPose(type,0,.8),mid=deathPose(type,.4,.8),end=deathPose(type,.81,.8);
  assert.equal(first.complete,false);
  assert.equal(end.complete,true);
  assert.equal(mid.complete,false);
  assert.ok(mid.fall>0&&mid.fall<.31);
  assert.ok(mid.horizontal<1&&mid.horizontal>.19);
  assert.ok(end.vertical>=.36);
 }
 assert.ok(deathPose('ossuary',.6,.8).roll<deathPose('crawler',.6,.8).roll);
 assert.ok(deathPose('synapse',.6,.8).pitch>deathPose('crawler',.6,.8).pitch);
 assert.deepEqual(deathPose('crawler',2,.8),deathPose('crawler',10,.8));
});
