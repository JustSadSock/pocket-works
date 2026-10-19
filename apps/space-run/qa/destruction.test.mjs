import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../simulation.js';

const player={id:'pilot',name:'Pilot'};
const fresh=()=>game.createRoom({player,payload:{name:'Pilot'}}).state;
const send=(state,event,payload={})=>game.onMessage({state,player,payload:{event,payload}}).state;
const tick=(state,ms=110)=>{state.lastTick=Date.now()-ms;return send(state,'playerInput',{});};
function hostile(x,y,damage=24,id='hostile'){
  return {id,x,y,vx:0,vy:0,ttl:2,radius:3,friendly:false,damage};
}
function active(state){
  return send(state,'startWave',{missionId:'scout'});
}

test('detached plating becomes independent inertial fragments with bounded lifetime',()=>{
  let state=fresh();
  state.room.ship.plates['3,-2']=0;
  state=active(state);
  for(let i=0;i<2;i++){
    state.room.projectiles.push(hostile(107,-54,22,'e'+i));
    state=tick(state);
  }
  assert.equal(state.snapshot.ship.cells.length,31);
  assert.equal(state.snapshot.debris.length,4);
  assert.ok(state.snapshot.debris.every(d=>Number.isFinite(d.vx)&&
    Number.isFinite(d.vy)&&Number.isFinite(d.angle)&&d.life>0));
  const before=state.snapshot.debris[0].x;
  state=tick(state);
  assert.notEqual(state.snapshot.debris[0].x,before);
});
test('debris collection is capped to prevent runaway server and client snapshots',()=>{
  let s=fresh();
  s=active(s);
  for(let i=0;i<45;i++){
    const m=s.room.ship.modules[0];
    m.heat=130;m.lastThermalIncident=-9999;
    s=tick(s);
    // Keep the test ship alive while intentionally exercising repeated accident visuals.
    s.room.ship.hull=s.room.ship.hullMax;
  }
  assert.ok(s.snapshot.debris.length<=120);
});
test('non-critical saves without a debris array resume safely',()=>{
  let s=fresh();delete s.room.debris;
  s=tick(s);
  assert.deepEqual(s.snapshot.debris,[]);
});
test('heat above the threshold triggers a local event, hull damage and nearby heat',()=>{
  let s=fresh();
  s=active(s);
  const engine=s.room.ship.modules.find(m=>m.templateId==='engine_mk1');
  const turret=s.room.ship.modules.find(m=>m.templateId==='turret_mk1');
  engine.heat=129;engine.lastThermalIncident=-9999;
  const before={hp:engine.hp,hull:s.room.ship.hull,neighbor:turret.heat};
  s=tick(s);
  assert.ok(s.snapshot.events.some(e=>e.type==='thermal-incident'&&e.moduleId===engine.id));
  assert.ok(s.snapshot.ship.modules.find(m=>m.id===engine.id).hp<before.hp);
  assert.ok(s.snapshot.ship.hull<before.hull);
  assert.ok(s.snapshot.debris.some(d=>d.material==='slag'));
  assert.ok(s.snapshot.ship.plates.some(p=>p.hp<48));
});
test('accidents have a five-second cooldown even if heat remains critical',()=>{
  let s=fresh();s=active(s);
  let m=s.room.ship.modules[0];m.heat=128;m.lastThermalIncident=-9999;
  s=tick(s);
  const first=s.snapshot.ship.modules[0].hp;
  m=s.room.ship.modules[0];m.heat=128;
  s=tick(s);
  assert.equal(s.snapshot.ship.modules[0].hp,first);
  assert.ok(!s.snapshot.events.some(e=>e.type==='thermal-incident'));
});
test('projectile impact imparts momentum, including off-axis ship rotation',()=>{
  let s=fresh();s=active(s);
  s.room.projectiles.push({...hostile(70,20),vx:180});
  s=tick(s);
  assert.ok(s.snapshot.physics.vx>3);
  assert.ok(Math.abs(s.snapshot.physics.av)>0.00001);
  assert.ok(s.snapshot.events.some(e=>e.type==='impact-impulse'));
});
test('debris from a ruptured reactor uses the reactor material and larger blast',()=>{
  let s=fresh();
  s.room.ship.inventoryShapes.push('block2');
  s=send(s,'addHullShape',{shapeId:'block2',x:4,y:0});
  s.room.ship.inventoryModules.push('reactor_mk1');
  s=send(s,'placeModule',{templateId:'reactor_mk1',x:4,y:0});
  const r=s.snapshot.ship.modules.find(m=>m.type==='reactor');
  assert.ok(r);
  s=active(s);
  const reactor=s.room.ship.modules.find(m=>m.id===r.id);
  reactor.heat=129;reactor.lastThermalIncident=-9999;
  s=tick(s);
  const explosion=s.snapshot.events.find(e=>e.type==='thermal-incident'&&e.reactor);
  assert.ok(explosion);
  assert.ok(s.snapshot.debris.some(d=>d.material==='reactor'));
});
