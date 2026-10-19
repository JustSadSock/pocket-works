import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../simulation.js';

const player={id:'pilot',name:'Engineer'};
const fresh=()=>game.createRoom({player,payload:{name:'Engineer'}}).state;
const send=(state,event,payload={})=>game.onMessage({state,player,payload:{event,payload}}).state;

test('projectile emerges from the rotated turret muzzle (not ship center)',()=>{
  for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    let state=fresh();
    state=send(state,'occupyModule',{moduleId:'m2'});
    state=send(state,'startWave',{missionId:'assault'});
    state.room.physics.a=angle;state.room.physics.av=0;
    state.room.physics.vx=0;state.room.physics.vy=0;
    state.room.players[0][1].input.fire=true;
    state.room.players[0][1].input.aim=angle;
    state.room.players[0][1].lastInputAt=Date.now();
    state.lastTick=Date.now()-120;
    const next=send(state,'playerInput',{fire:true,aim:angle});
    const shots=next.snapshot.events.filter(e=>e.type==='shot');
    assert.equal(shots.length,1);
    const expectedX=64*Math.cos(angle)-0*Math.sin(angle)+38.88*Math.cos(angle);
    const expectedY=64*Math.sin(angle)+0*Math.cos(angle)+38.88*Math.sin(angle);
    assert.ok(Math.abs(shots[0].x-expectedX)<0.05,'muzzle X at '+angle);
    assert.ok(Math.abs(shots[0].y-expectedY)<0.05,'muzzle Y at '+angle);
    const projectile=next.snapshot.projectiles.find(p=>p.friendly);
    assert.ok(projectile,'projectile exists');
    assert.ok(Number.isFinite(projectile.vx)&&Number.isFinite(projectile.vy));
  }
});

test('centre of mass and inertia respond to hull geometry',()=>{
  const state=fresh();
  const before=state.snapshot.ship.massProperties;
  assert.ok(before.mass>30&&before.inertia>8000);
  state.room.ship.cells.push('20,0','20,1','20,2');
  const next=send(state,'playerInput',{});
  const after=next.snapshot.ship.massProperties;
  assert.ok(after.mass>before.mass);
  assert.ok(after.centerX>before.centerX);
  assert.ok(after.inertia>before.inertia);
});

test('combat timer ends the expedition even when enemies remain',()=>{
  let state=fresh();
  state=send(state,'startWave',{missionId:'assault'});
  assert.ok(state.room.enemies.length>0);
  state.room.phaseTime=0.001;state.lastTick=Date.now()-150;
  const next=send(state,'playerInput',{});
  assert.equal(next.snapshot.phase,'build');
  assert.equal(next.snapshot.enemies.length,0);
  assert.ok(next.snapshot.events.some(e=>e.type==='defeat'&&e.reason==='timeout'));
});

test('zero enemies counts as a victory before time runs out',()=>{
  let state=fresh();
  state=send(state,'startWave',{missionId:'scout'});
  state.room.phaseTime=.001;state.room.enemies=[];state.lastTick=Date.now()-150;
  const next=send(state,'playerInput',{});
  assert.equal(next.snapshot.phase,'shop');
  assert.ok(next.snapshot.events.some(e=>e.type==='phase'&&e.phase==='shop'));
  assert.ok(!next.snapshot.events.some(e=>e.type==='defeat'));
});
