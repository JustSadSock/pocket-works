import assert from 'node:assert/strict';
import { ShockField } from './physics.js';

function near(actual, expected, tolerance=1e-5){
  assert.ok(Math.abs(actual-expected)<tolerance,`expected ${actual} ≈ ${expected}`);
}

const flat = new ShockField(64,40);
for(let i=0;i<15;i++)flat.step();
near(flat.sample(30,20).pressure,1);
near(flat.sample(30,20).rho,1);
near(flat.sample(30,20).mach,0);

const blast = new ShockField(90,60);
blast.pulse(36,30,5.5,3.2);
assert.ok(blast.sample(36,30).pressure>3);
for(let i=0;i<65;i++)blast.step();
assert.ok(blast.time>0);
assert.ok(blast.sample(46,30).pressure>1.003,'front has propagated outward');
const obs=blast.scan();
assert.ok(Number.isFinite(obs.totalMass)&&obs.minP>0);
assert.ok(obs.maxP<25,'no runaway pressure');

const symmetry = new ShockField(90,60);
symmetry.pulse(45,30,3.5,3);
for(let i=0;i<28;i++)symmetry.step();
near(symmetry.sample(35,30).pressure,symmetry.sample(55,30).pressure,.004);
near(symmetry.sample(45,20).pressure,symmetry.sample(45,40).pressure,.004);

const walls=new ShockField(90,60);
for(const preset of ['reflector','slits','maze','channel']){
  walls.geometry(preset);
  assert.ok(walls.solid.some(Boolean),preset+' has actual obstacles');
}
walls.geometry('empty');
assert.equal(walls.solid.some(Boolean),false);
walls.stroke(30,30,45,30,true,2);
assert.ok(walls.sample(39,30).solid);
walls.stroke(30,30,45,30,false,2.5);
assert.equal(walls.sample(39,30).solid,false);

const stress=new ShockField(92,64);
stress.geometry('slits');
for(let cycle=0;cycle<8;cycle++){
  stress.pulse(20,32,9.7);
  for(let i=0;i<30;i++)stress.step();
}
const data=stress.scan();
assert.ok(data.minP>=0.024);
assert.ok(Number.isFinite(data.maxP)&&data.maxP<100);
for(let i=0;i<stress.U.length;i++)assert.ok(Number.isFinite(stress.U[i]),'all conservative fields finite');
stress.resetGas();
near(stress.sample(20,32).pressure,1);
near(stress.time,0);
assert.ok(stress.solid.some(Boolean),'reset gas does not erase geometry');

console.log('SHOCK solver: ambient equilibrium, propagation, symmetry, geometry, positivity, stress and reset PASS');
