import assert from 'node:assert/strict';
import { ShockField } from './physics.js';
import { TraceRecorder } from './traces.js';
import { LoadHistory } from './load-history.js';

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


// SHOCK 1.2 wind tunnel verification. No preanimated shock rays:
const uniform=new ShockField(74,48);
uniform.geometry('empty');
uniform.startFlow(2);
for(let i=0;i<100;i++)uniform.step();
near(uniform.sample(37,24).pressure,1,.001);
near(uniform.sample(37,24).rho,1,.001);
near(uniform.sample(37,24).mach,2,.001);
assert.equal(uniform.flowActive,true);
assert.ok(uniform.maxMach>=1.99&&uniform.maxMach<=2.01);
assert.ok(uniform.U.length === (uniform.size+1)*4,'conservative inlet ghost cell allocated');
for(const preset of ['wedge','airfoil','cylinder','nozzle']){
  const field=new ShockField(74,48);
  field.geometry(preset);
  assert.ok(field.solid.some(Boolean),preset+' has actual geometry');
  field.startFlow(2);
  assert.ok(field.flowActive&&field.flowMach===2);
  let bounded=true;
  for(let i=0;i<135;i++){
    field.step();
    if(i%15===0 && (!Number.isFinite(field.maxPressure)||field.maxPressure>200))bounded=false;
  }
  assert.ok(bounded,preset+' numerical pressure remains finite');
  assert.ok(field.maxPressure>1.18,preset+' produces a computed compression front');
  assert.ok(field.maxMach>0.3&&field.maxMach<12,preset+' has finite local Mach diagnostics');
  for(let i=0;i<field.U.length;i++)assert.ok(Number.isFinite(field.U[i]),preset+' finite conserved state');
}
const cylinder=new ShockField(74,48);
cylinder.geometry('cylinder');cylinder.startFlow(2);
for(let i=0;i<160;i++)cylinder.step();
assert.ok(cylinder.maxPressure>2,'cylinder builds bow compression');
assert.ok(cylinder.sample(1,24).mach>1.85,'left inlet remains prescribed Mach');
const nozzle=new ShockField(74,48);
nozzle.geometry('nozzle');nozzle.startFlow(1.5);
assert.ok(nozzle.sample(25,1).solid,'nozzle exterior is solid rather than empty gas');
assert.ok(!nozzle.sample(25,24).solid,'nozzle core is open');
for(let i=0;i<120;i++)nozzle.step();
assert.ok(nozzle.maxPressure>1.05,'converging nozzle causes numerical compression');
nozzle.startFlow(.7);
near(nozzle.sample(5,24).mach,.7,.001);
nozzle.step();
assert.ok(Number.isFinite(nozzle.maxPressure));
nozzle.resetGas();
assert.equal(nozzle.flowActive,false,'switching to blast mode clears inflow BC');
near(nozzle.sample(5,24).mach,0,.00001);


const angleTests=[];
for(const incidence of [-10,0,10]){
  const wing=new ShockField(84,52);
  wing.geometry('airfoil',incidence);
  assert.ok(wing.body.some(Boolean),'airfoil mask contains real solid cells');
  wing.startFlow(2);
  for(let i=0;i<130;i++)wing.step();
  const loads=wing.aeroForces();
  assert.ok(loads && loads.faces>20,'pressure surface has measured boundary faces');
  assert.ok(Number.isFinite(loads.cl)&&Number.isFinite(loads.cd)&&Number.isFinite(loads.cm));
  assert.ok(loads.cd>.02,'positive pressure drag');
  assert.equal(loads.type,'airfoil');
  assert.equal(loads.incidence,incidence);
  assert.ok(loads.upper.filter(v=>v!==null).length>30);
  assert.ok(loads.lower.filter(v=>v!==null).length>30);
  assert.ok(loads.chord>20&&loads.q>1);
  angleTests.push(loads);
}
assert.ok(angleTests[0].cl<-.06,'negative angle yields negative lift');
assert.ok(angleTests[2].cl>.06,'positive angle yields positive lift');
assert.ok(Math.abs(angleTests[1].cl)<.01,'symmetric profile at zero angle has near-zero lift');
assert.ok(Math.abs(angleTests[1].cm)<.03,'symmetric profile has near-zero pitching moment');
assert.ok(Math.abs(angleTests[0].cl+angleTests[2].cl)<.03,'lift mirrors for symmetric incidence');
assert.ok(Math.abs(angleTests[0].cm+angleTests[2].cm)<.03,'pitch moment mirrors for symmetric incidence');

const bodyOnly=new ShockField(84,52);
bodyOnly.geometry('airfoil',6);
const countBefore=bodyOnly.body.reduce((sum,v)=>sum+v,0);
bodyOnly.stroke(12,11,24,11,true,2);
assert.equal(bodyOnly.body.reduce((sum,v)=>sum+v,0),countBefore,'custom wall is not counted as wing surface');
bodyOnly.startFlow(2);for(let i=0;i<15;i++)bodyOnly.step();
assert.ok(Number.isFinite(bodyOnly.aeroForces().cl));
bodyOnly.geometry('nozzle');
assert.equal(bodyOnly.aeroForces(),null,'no fictitious wing forces on nozzle walls');
bodyOnly.geometry('cylinder');bodyOnly.startFlow(2);
for(let i=0;i<120;i++)bodyOnly.step();
assert.ok(bodyOnly.aeroForces().cd>.3,'cylinder carries strong positive pressure drag');
bodyOnly.resetGas();
assert.equal(bodyOnly.aeroForces(),null,'blast mode does not report wind tunnel coefficients');


const wingThin=new ShockField(100,64),wingThick=new ShockField(100,64);
wingThin.geometry('airfoil',0,{camber:0,thickness:6});
wingThick.geometry('airfoil',0,{camber:0,thickness:19});
const thinCount=wingThin.body.reduce((a,b)=>a+b,0);
const thickCount=wingThick.body.reduce((a,b)=>a+b,0);
assert.ok(thickCount>thinCount*2,'thickness slider changes actual solid cell count');
const wingCurved=new ShockField(100,64);
wingCurved.geometry('airfoil',0,{camber:5,thickness:11});
assert.ok(wingCurved.body.some((v,i)=>v&&!wingThin.body[i]),'camber creates a distinct boundary');
const wingMirror=new ShockField(100,64);
wingMirror.geometry('airfoil',0,{camber:-5,thickness:11});
assert.ok(wingCurved.body.some((v,i)=>v&&!wingMirror.body[i]),'positive/negative camber differ');
const oldWing=new ShockField(100,64);
oldWing.geometry('airfoil');
assert.ok(oldWing.bodyBounds&&oldWing.bodyBounds.chord>35,'old saved shapes use stable defaults');
const gustField=new ShockField(80,50);
gustField.geometry('airfoil',4,{camber:3,thickness:14});
gustField.setGust(9,4);
gustField.startFlow(2);
assert.ok(gustField.flowActive);
let peaked=false,nonzeroWake=false,positive=false,negative=false;
const gustRecorder=new LoadHistory();
for(let i=0;i<300;i++){
  gustField.step();gustRecorder.record(gustField);
  const angle=gustField.gustAngle;
  peaked=peaked||Math.abs(angle)>7.5;
  positive=positive||angle>4;
  negative=negative||angle< -4;
  if(i%25===0){
    const ω=gustField.wakeVorticity();
    assert.ok(Number.isFinite(ω.rms)&&ω.rms>=0,'calculated curl remains finite');
    nonzeroWake=nonzeroWake||ω.rms>.001;
  }
}
assert.ok(peaked&&positive&&negative,'periodic inlet genuinely reverses transverse flow');
assert.ok(nonzeroWake,'vorticity emerges from solved velocity gradients');
const k=gustField.size*4,ghost=gustField.U;
near(ghost[k],1,.00001);
const u=ghost[k+1],v=ghost[k+2],E=ghost[k+3];
near(Math.hypot(u,v),2*Math.sqrt(1.4),.0005);
near(.4*(E-.5*(u*u+v*v)),1,.0005);
assert.ok(gustRecorder.samples.length>40,'unsteady loads are recorded over solver time');
const stats=gustRecorder.stats();
assert.ok(stats.count>25&&stats.clRms>0&&stats.omegaRms>0,'RMS load and wake diagnostics contain actual variations');
assert.ok(gustRecorder.samples.some(x=>x.gust>3)&&gustRecorder.samples.some(x=>x.gust< -3));
assert.ok(gustRecorder.csv().startsWith('time,CL,CD_pressure,Cm_quarter_chord,wake_vorticity_rms,inlet_gust_degrees\n'));
assert.equal(gustRecorder.csv().trim().split('\n').length,gustRecorder.samples.length+1);
gustRecorder.clear();assert.equal(gustRecorder.samples.length,0);
assert.equal(gustRecorder.stats(),null);
gustField.setGust(0,6);
gustField.step();near(gustField.gustAngle,0,.00001);
const uniformGust=new ShockField(64,40);
uniformGust.geometry('empty');uniformGust.setGust(0,7);uniformGust.startFlow(1.8);
for(let i=0;i<45;i++)uniformGust.step();
near(uniformGust.wakeVorticity().rms,0,.0001);
near(uniformGust.sample(20,20).mach,1.8,.0002);

console.log('SHOCK: legacy Euler, parametric profiles, gust cycle, real vorticity and load time series PASS');
