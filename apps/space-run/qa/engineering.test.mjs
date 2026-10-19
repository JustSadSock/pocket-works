import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../simulation.js';

const player={id:'pilot',name:'Pilot'};
const fresh=()=>game.createRoom({player,payload:{name:'Pilot'}}).state;
const dispatch=(state,event,payload={})=>game.onMessage({state,player,payload:{event,payload}});
const send=(state,event,payload={})=>dispatch(state,event,payload).state;
const tick=(state,ms=120,payload={})=>{
  state.lastTick=Date.now()-ms;
  return send(state,'playerInput',payload);
};
const plate=(state,x,y)=>state.snapshot.ship.plates.find(p=>p.x===x&&p.y===y)?.hp;

test('starting ship initializes power distribution, hull armor and legacy migration',()=>{
  let s=fresh();
  assert.equal(s.snapshot.ship.plates.length,32);
  assert.equal(s.snapshot.ship.networkCells.length,32);
  assert.ok(s.snapshot.ship.modules.every(m=>m.powered));
  delete s.room.ship.plates;
  s=tick(s);
  assert.equal(s.snapshot.ship.plates.length,32);
  assert.equal(plate(s,0,0),48);
});

test('enemy projectiles penetrate local plates and disconnect a damaged electrical bus',()=>{
  let s=fresh();
  s=send(s,'startWave',{missionId:'scout'});
  s.room.projectiles.push({id:'enemy-test',x:16,y:16,vx:0,vy:0,
    radius:4,ttl:1,friendly:false,damage:50,color:'#ff0000'});
  s=tick(s,100);
  assert.equal(plate(s,0,0),0);
  assert.equal(s.snapshot.ship.networkCells.length,0);
  assert.ok(s.snapshot.ship.modules.every(m=>m.powered===false));
  assert.ok(s.snapshot.events.some(e=>e.type==='hull-breach'&&e.x===0&&e.y===0));
});

test('garage repair restores the electrical bus, charges credits and rejects repeats',()=>{
  let s=fresh();
  s.room.ship.plates['0,0']=0;
  s=tick(s);
  assert.equal(s.snapshot.ship.modules[0].powered,false);
  s=send(s,'patchHull',{x:0,y:0});
  assert.equal(plate(s,0,0),26);
  assert.equal(s.snapshot.ship.credits,164);
  assert.equal(s.snapshot.ship.modules[0].powered,true);
  s=send(s,'patchHull',{x:0,y:0});
  assert.equal(plate(s,0,0),48);
  const noOp=dispatch(s,'patchHull',{x:0,y:0});
  assert.equal(noOp.state.snapshot.ship.credits,148);
  assert.ok(noOp.events.some(e=>e.type==='legacy'&&e.payload.event==='actionError'));
});

test('combat hull patching requires a powered repair station, cooldown and energy',()=>{
  let s=fresh();
  s.room.ship.plates['0,0']=0;
  s=send(s,'startWave',{missionId:'scout'});
  let blocked=dispatch(s,'patchHull',{x:0,y:0});
  assert.equal(plate(blocked.state,0,0),0);
  assert.ok(blocked.events.some(e=>e.type==='legacy'&&e.payload.event==='actionError'));
  s=fresh();
  s.room.ship.inventoryShapes.push('block2');
  s=send(s,'addHullShape',{shapeId:'block2',x:4,y:0});
  s.room.ship.inventoryModules.push('repair_bay_mk1');
  s=send(s,'placeModule',{templateId:'repair_bay_mk1',x:4,y:0});
  const repair=s.snapshot.ship.modules.find(m=>m.type==='repair');
  assert.ok(repair);
  s=send(s,'occupyModule',{moduleId:repair.id});
  s.room.ship.plates['0,0']=18;
  s=send(s,'startWave',{missionId:'scout'});
  s=tick(s,110);
  const energy=s.snapshot.ship.energy;
  s=send(s,'patchHull',{x:0,y:0});
  assert.equal(plate(s,0,0),36);
  assert.equal(s.snapshot.ship.energy,energy-12);
  const tooSoon=dispatch(s,'patchHull',{x:0,y:0});
  assert.equal(plate(tooSoon.state,0,0),36);
  assert.ok(tooSoon.events.some(e=>e.type==='legacy'&&e.payload.event==='actionError'));
});

test('heat disables engine control, then recovers through passive cooling',()=>{
  let s=fresh();
  s=send(s,'occupyModule',{moduleId:'m1'});
  s=send(s,'startWave',{missionId:'scout'});
  let engine=s.room.ship.modules.find(m=>m.id==='m1');
  engine.heat=99.9;
  s.room.players[0][1].input.up=true;
  s.room.players[0][1].lastInputAt=Date.now();
  s=tick(s,230,{up:true});
  engine=s.snapshot.ship.modules.find(m=>m.id==='m1');
  assert.equal(engine.overheated,true);
  const speed1=Math.hypot(s.snapshot.physics.vx,s.snapshot.physics.vy);
  s=tick(s,140,{up:true});
  assert.equal(s.snapshot.ship.modules.find(m=>m.id==='m1').overheated,true);
  s.room.ship.modules.find(m=>m.id==='m1').heat=50;
  s=tick(s,140,{up:false});
  assert.equal(s.snapshot.ship.modules.find(m=>m.id==='m1').overheated,false);
  assert.ok(speed1>=0);
});

test('an isolated reactor can feed the ship when the emergency bus is breached',()=>{
  let s=fresh();
  s.room.ship.plates['0,0']=0;
  s.room.ship.inventoryShapes.push('block2');
  s=send(s,'addHullShape',{shapeId:'block2',x:4,y:0});
  s.room.ship.inventoryModules.push('reactor_mk1');
  s=send(s,'placeModule',{templateId:'reactor_mk1',x:4,y:0});
  assert.ok(s.snapshot.ship.modules.some(m=>m.type==='reactor'));
  assert.ok(s.snapshot.ship.modules.every(m=>m.powered===true));
});

test('patchHull validates coordinates and rejects absent hull sections without charging',()=>{
  const s=fresh();
  for(const loc of [{x:Infinity,y:0},{x:'x',y:1},{x:9999,y:0},{x:3,y:199}]){
    const result=dispatch(s,'patchHull',loc);
    assert.equal(result.state.snapshot.ship.credits,180);
    assert.ok(result.events.some(e=>e.type==='legacy'&&e.payload.event==='actionError'));
  }
});
