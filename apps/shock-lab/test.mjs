import assert from 'node:assert/strict';
import { ShockField } from './physics.js';
import { TraceRecorder } from './traces.js';

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


const tube=new ShockField(100,70);
tube.geometry('tube');
tube.loadTube(8);
near(tube.sample(24,35).pressure,8,.00001);
near(tube.sample(75,35).pressure,1,.00001);
near(tube.sample(24,35).rho,Math.pow(8,1/1.4),.00001);
assert.equal(tube.sample(50,14).solid,true,'closed tube upper boundary');
const massBefore=tube.scan().totalMass;
const recorder=new TraceRecorder();
assert.equal(recorder.record(tube,true),true);
assert.equal(recorder.samples.length,1);
for(let i=0;i<360;i++){tube.step();recorder.record(tube);}
const massAfter=tube.scan().totalMass;
assert.ok(Math.abs(massAfter-massBefore)/massBefore < .0005,'sealed shock tube conserves mass');
assert.ok(recorder.samples.length>50&&recorder.samples.length<480,'actual timed pressure samples collected');
assert.ok(recorder.arrival.every(n=>n!==null&&n>0),'front reached both pressure sensors');
assert.ok(recorder.arrival[0]<recorder.arrival[1],'front reaches nearer sensor first');
assert.ok(recorder.speed(tube)>0.3&&recorder.speed(tube)<8,'measured front speed in expected range');
assert.ok(tube.sample(65,35).pressure>1.4,'non-animated compression front propagates into low pressure gas');
assert.ok(tube.scan().minP>0,'Riemann tube avoids negative pressure');
const profile=recorder.profile(tube);
assert.equal(profile.length,tube.nx);
assert.ok(profile.some(p=>p===null),'lineout masks solid end walls');
assert.ok(profile.some(p=>p!==null&&p>2),'lineout shows compressed gas');
const csv=recorder.csv();
assert.ok(csv.startsWith('time,P_A_over_P0,P_B_over_P0\n'));
assert.equal(csv.trim().split('\n').length,recorder.samples.length+1);
recorder.moveSensor(0,{x:.62,y:.5});
assert.equal(recorder.samples.length,0,'sensor reposition resets stale measurement histories');
recorder.record(tube,true);
assert.equal(recorder.arrival[0],null,'move clears arrival timing');
tube.loadTube(3);
near(tube.sample(24,35).pressure,3,.00001);
near(tube.time,0,.00001);
assert.ok(tube.solid.some(Boolean),'recharging tube preserves its physical walls');

console.log('SHOCK solver: ambient equilibrium, propagation, symmetry, shock tube mass conservation, transducers and CSV PASS');
