import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD, MISSIONS, ENGINES, defaultCraft, stageDryMass, craftStats,
  orbitalElements, createFlight, advanceFlight, separateStage, remainingFuel, isValidCraft } from './physics.js';

test('Martian radius and gravitational parameter are physical SI values',()=>{
  assert.equal(WORLD.radius,3389500);
  assert.ok(Math.abs(WORLD.mu/1e13-4.282837)<1e-5);
  assert.ok(WORLD.rho0>0&&WORLD.rho0<.03);
});
test('perfect circular orbit has matching apsides',()=>{
  const r=WORLD.radius+175000, v=Math.sqrt(WORLD.mu/r);
  const o=orbitalElements(0,r,v,0);
  assert.ok(Math.abs(o.periAlt-175000)<1);
  assert.ok(Math.abs(o.apoAlt-175000)<1);
  assert.ok(o.eccentricity<1e-5);
});
test('rocket mass, fuel and stages obey the rocket equation',()=>{
  const c=defaultCraft(),s=craftStats(c,MISSIONS[0].payload);
  assert.ok(s.deltaV>5500&&s.deltaV<7500);
  assert.ok(s.twr>1);
  assert.ok(stageDryMass(c[0],true)>ENGINES[c[0].engine].mass);
  assert.ok(isValidCraft(c));
  assert.equal(isValidCraft([{engine:'vac',tanks:-10,fins:false}]),false);
  const f=createFlight(c,0),mass=remainingFuel(f);
  assert.ok(separateStage(f));
  assert.ok(remainingFuel(f)<mass);
  assert.equal(f.stageIndex,1);
});
test('default rocket reaches the first Mars orbit mission without fictitious orbital forces',()=>{
  const f=createFlight(defaultCraft(),0);
  for(let i=0;i<1600&&!f.outcome;i++)advanceFlight(f,1);
  assert.equal(f.outcome,'success',`reason=${f.reason} t=${f.t}`);
  const o=orbitalElements(f.x,f.y,f.vx,f.vy);
  assert.ok(o.periAlt>=MISSIONS[0].min);
  assert.ok(o.apoAlt<=MISSIONS[0].max);
  assert.ok(f.fuel.every(n=>n>=0));
});
test('larger first-stage design can deliver heavier payloads to their target corridors',()=>{
  const stages=[{tanks:4,engine:'lift',fins:true},{tanks:2,engine:'vac',fins:false}];
  for(const missionIndex of [1,2]){
    const cost=craftStats(stages,MISSIONS[missionIndex].payload).cost;
    assert.ok(cost<=MISSIONS[missionIndex].budget);
    const f=createFlight(stages,missionIndex);
    for(let i=0;i<1900&&!f.outcome;i++)advanceFlight(f,1);
    const o=orbitalElements(f.x,f.y,f.vx,f.vy);
    assert.equal(f.outcome,'success',`mission ${missionIndex}, ap=${o.apoAlt}, pe=${o.periAlt}`);
  }
});
test('dry engine cannot generate acceleration or consume negative propellant',()=>{
  const craft=defaultCraft();
  const f=createFlight(craft,0);
  f.fuel[0]=0;f.auto=false;
  f.throttle=1;const before=Math.hypot(f.vx,f.vy);
  advanceFlight(f,.15);
  assert.equal(f.fuel[0],0);
  assert.ok(Number.isFinite(Math.hypot(f.vx,f.vy)));
  assert.ok(Math.abs(Math.hypot(f.vx,f.vy)-before)<2);
});
