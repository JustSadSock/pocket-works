import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../simulation.js';

const pilot={id:'pilot',name:'Pilot'};
const fresh=()=>game.createRoom({player:pilot,payload:{name:'Pilot'}}).state;
const action=(state,event,payload={})=>game.onMessage({state,player:pilot,payload:{event,payload}});
const send=(state,event,payload={})=>action(state,event,payload).state;
function step(state,elapsed=100,input={}){state.lastTick=Date.now()-elapsed;return send(state,'playerInput',input);}
const failed=result=>result.events.some(e=>e.type==='legacy'&&e.payload.event==='actionError');

test('breaker installation, isolation, reclose and removal change actual connectivity and credits',()=>{
  let s=fresh();
  assert.equal(s.snapshot.ship.breakers.length,0);
  s=send(s,'breakerAction',{x:0,y:0,operation:'install'});
  assert.equal(s.snapshot.ship.credits,158);
  s=send(s,'breakerAction',{x:0,y:0,operation:'toggle'});
  assert.ok(s.snapshot.ship.modules.every(m=>m.powerState==='isolated'));
  s=send(s,'breakerAction',{x:0,y:0,operation:'toggle'});
  assert.ok(s.snapshot.ship.modules.every(m=>m.powered));
  s=send(s,'breakerAction',{x:0,y:0,operation:'remove'});
  assert.equal(s.snapshot.ship.credits,168);
  assert.equal(s.snapshot.ship.breakers.length,0);
});
test('unauthorized combat breaker commands cannot change state or charge resources',()=>{
  let s=fresh();
  s=send(s,'breakerAction',{x:0,y:0,operation:'install'});
  s=send(s,'startWave',{missionId:'scout'});
  const energy=s.snapshot.ship.energy;
  const result=action(s,'breakerAction',{x:0,y:0,operation:'toggle'});
  assert.ok(failed(result));
  assert.equal(result.state.snapshot.ship.breakers[0].closed,true);
  assert.equal(result.state.snapshot.ship.energy,energy);
});
test('repair crew can emergency reclose an isolated breaker',()=>{
  let s=fresh();
  s.room.ship.inventoryShapes.push('block2');
  s=send(s,'addHullShape',{shapeId:'block2',x:4,y:0});
  s.room.ship.inventoryModules.push('repair_bay_mk1');
  s=send(s,'placeModule',{templateId:'repair_bay_mk1',x:4,y:0});
  const repair=s.snapshot.ship.modules.find(m=>m.type==='repair');
  assert.ok(repair);
  s=send(s,'occupyModule',{moduleId:repair.id});
  s=send(s,'breakerAction',{x:0,y:0,operation:'install'});
  s=send(s,'breakerAction',{x:0,y:0,operation:'toggle'});
  s=send(s,'startWave',{missionId:'scout'});
  assert.equal(s.snapshot.ship.modules.find(m=>m.id===repair.id).powered,false);
  const energy=s.snapshot.ship.energy;
  s=send(s,'breakerAction',{x:0,y:0,operation:'toggle'});
  assert.equal(s.snapshot.ship.breakers[0].closed,true);
  assert.ok(s.snapshot.ship.modules.every(m=>m.powered));
  assert.equal(s.snapshot.ship.energy,energy-5);
});
test('power priority actively sheds lower-priority systems and can be reassigned in garage',()=>{
  let s=fresh();
  s=send(s,'powerPriority',{moduleId:'m1',priority:0});
  assert.equal(s.snapshot.ship.modules[0].powerPriority,0);
  for(let i=0;i<5;i++)s.room.ship.modules.push({...s.room.ship.modules[1],id:'extra'+i,templateId:'shield_mk2',occupiedBy:'pilot',x:-2,y:-2,powerPriority:0});
  s=step(s);
  assert.ok(s.snapshot.ship.modules.some(m=>m.powerState==='shed'));
  assert.ok(s.snapshot.ship.gridLoad<=s.snapshot.ship.gridCapacity);
  s=send(s,'startWave',{missionId:'scout'});
  assert.ok(failed(action(s,'powerPriority',{moduleId:'m1',priority:3})));
});
test('new radiator is craftable and cools thermally connected weapons',()=>{
  let control=fresh(),cooled=fresh();
  cooled=send(cooled,'placeModule',{templateId:'radiator_mk1',x:1,y:1});
  const rad=cooled.snapshot.ship.modules.find(m=>m.type==='radiator');
  assert.ok(rad);
  control.room.ship.modules[1].heat=90;
  cooled.room.ship.modules[1].heat=90;
  control=step(control,200);
  cooled=step(cooled,200);
  assert.ok(cooled.snapshot.ship.modules[1].heat<control.snapshot.ship.modules[1].heat-1,
    'radiator must cool adjacent turret more than passive cooling alone');
});
test('radiator operator overdrives cooling in exchange for ship energy',()=>{
  let normal=fresh(),boost=fresh();
  normal=send(normal,'placeModule',{templateId:'radiator_mk1',x:1,y:1});
  boost=send(boost,'placeModule',{templateId:'radiator_mk1',x:1,y:1});
  const id=boost.snapshot.ship.modules.find(m=>m.type==='radiator').id;
  boost=send(boost,'occupyModule',{moduleId:id});
  normal.room.ship.modules[1].heat=96;boost.room.ship.modules[1].heat=96;
  normal=step(normal,200);
  boost.room.players[0][1].input.space=true;
  boost.room.players[0][1].lastInputAt=Date.now();
  boost=step(boost,200,{space:true});
  const radiator=boost.snapshot.ship.modules.find(m=>m.type==='radiator');
  assert.ok(radiator.coolantBoost>2);
  assert.ok(boost.snapshot.ship.modules[1].heat<normal.snapshot.ship.modules[1].heat-1);
  assert.ok(boost.snapshot.ship.energy<normal.snapshot.ship.energy);
});
test('twice-struck unoccupied edge cell detaches without breaking hull connectivity',()=>{
  let s=fresh();s.room.ship.plates['3,-2']=0;s=send(s,'startWave',{missionId:'scout'});
  for(let i=0;i<2;i++){
    s.room.projectiles.push({id:'enemy'+i,x:104,y:-53,vx:0,vy:0,ttl:1,radius:3,friendly:false,damage:22});
    s=step(s,80);
  }
  assert.ok(!s.room.ship.cells.includes('3,-2'));
  assert.equal(s.snapshot.ship.cells.length,31);
  assert.ok(s.snapshot.events.some(e=>e.type==='hull-detached'));
});
test('legacy saves migrate the new breaker and fracture state without corrupting the room',()=>{
  let s=fresh();delete s.room.ship.breakers;delete s.room.ship.fractures;
  for(const m of s.room.ship.modules)delete m.powerPriority;
  s=step(s);
  assert.deepEqual(s.snapshot.ship.breakers,[]);
  assert.ok(s.snapshot.ship.modules.every(m=>Number.isInteger(m.powerPriority)));
  assert.equal(s.snapshot.ship.networkCells.length,32);
});
test('malformed breaker inputs do not charge or mutate room state',()=>{
  let s=fresh();
  for(const bad of [{x:Infinity,y:0,operation:'install'},{x:2,y:0,operation:'steal'},
     {x:55555,y:2,operation:'install'},{x:0,y:0,operation:'toggle'}]){
    const r=action(s,'breakerAction',bad);
    assert.ok(failed(r));
    assert.equal(r.state.snapshot.ship.credits,180);
    assert.equal(r.state.snapshot.ship.breakers.length,0);
    s=r.state;
  }
});

test('load-shed stations do not spam fake power-restored events on every simulation step',()=>{
  let s=fresh();
  for(let i=0;i<5;i++)s.room.ship.modules.push({...s.room.ship.modules[1],id:'shed'+i,
    templateId:'shield_mk2',occupiedBy:'pilot',x:-2,y:-2,powerPriority:0});
  s=step(s,90);
  assert.ok(s.snapshot.ship.modules.some(m=>m.powerState==='shed'));
  s=step(s,90);
  assert.equal(s.snapshot.events.filter(e=>e.type==='power-grid'&&e.powered).length,0,
    'final load-shed state is unchanged and must not trigger a transient restored event');
});
