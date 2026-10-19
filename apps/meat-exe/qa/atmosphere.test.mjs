import test from 'node:test';
import assert from 'node:assert/strict';
import {atmosphereProfile,moteAt,organLight,materialProperties,enemyMotion,fxLimits,tissueFamily} from '../atmosphere.js';

test('five stages have real and visibly distinct physical atmosphere presets',()=>{
 const kinds=new Set(),rough=new Set();
 for(let stage=1;stage<=5;stage++){
  const p=atmosphereProfile(stage);
  kinds.add(p.kind);rough.add(p.roughness);
  assert.ok(p.count>0&&p.count<=88);
  assert.equal(atmosphereProfile(stage,'low').count,0);
  assert.equal(atmosphereProfile(stage,'high',true).count,0);
  assert.ok(atmosphereProfile(stage,'high').count>=p.count);
  assert.ok(Number.isFinite(p.pulse)&&p.pulse>0);
 }
 assert.equal(kinds.size,4);assert.equal(rough.size,5);
});
test('thousands of deterministic motes remain bounded to the camera locality at any elapsed time',()=>{
 for(let seed=0;seed<300;seed++)for(let stage=1;stage<=5;stage++)for(let i=0;i<88;i+=7){
  const p=moteAt(seed,stage,i,10_000,3.5,7.25);
  assert.deepEqual(p,moteAt(seed,stage,i,10_000,3.5,7.25));
  assert.ok(p.x>=-.61&&p.x<=7.61);
  assert.ok(p.z>=3.14&&p.z<=11.36);
  assert.ok(p.y>=.26&&p.y<=2.46);
 }
});
test('muzzle/immune lighting never blacks out or explodes the organ',()=>{
 for(let stage=1;stage<=5;stage++)for(let i=0;i<100;i++){
  const light=organLight(stage,i*.23,i/99,i%4===0?1.7:0);
  assert.ok(light.light>=2&&light.light<=18);
  assert.ok(light.fog>=.9&&light.fog<=1.1);
  assert.ok(light.beat>=0&&light.beat<=1);
  assert.ok(light.wetness>=.22&&light.wetness<=.92);
 }
});
test('each enemy class now has its own actual anatomical albedo/relief family',()=>{
 const classes=['crawler','spitter','brute','leech','warden','heart','clot','ossuary','synapse'];
 const materials=classes.map(materialProperties);
 assert.equal(new Set(materials.map(m=>m.family)).size,4);
 assert.equal(tissueFamily('ossuary'),'marrow');assert.equal(tissueFamily('leech'),'neural');
 assert.equal(tissueFamily('spitter'),'gastric');assert.equal(tissueFamily('clot'),'vascular');
 assert.ok(materials.every(m=>m.roughness>=.3&&m.roughness<=.95&&m.bumpScale>0));
});
test('crawler scuttles, synapse suspends and bone boss remains planted; reduced motion honors accessibility',()=>{
 for(let time=0;time<15;time+=.2){
  const scuttle=enemyMotion('crawler',time,31),brain=enemyMotion('synapse',time,31);
  const bone=enemyMotion('ossuary',time,31);
  assert.ok(scuttle.limb>brain.limb);
  assert.ok(brain.bob>=-.2&&brain.bob<=.2);
  assert.ok(Math.abs(bone.roll)<=.02);
  const reduced=enemyMotion('crawler',time,31,1,.5,true);
  assert.equal(reduced.roll,0);assert.equal(reduced.pitch,0);
  assert.equal(reduced.breath,1);
 }
});
test('effect budgets are fixed by quality and conservative WebGL',()=>{
 for(const quality of ['low','medium','high']){
  const p=fxLimits(quality,true),other=fxLimits(quality,false);
  assert.equal(p.motes,0);assert.equal(p.deaths,0);assert.equal(p.additionalLights,0);
  assert.ok(other.motes<=88);assert.ok(other.deaths<=5);assert.ok(other.additionalLights<=1);
 }
});
