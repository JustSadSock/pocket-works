import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD,STATS,SCENARIOS,makeGame,orderUnit,getEnds,lineFromEnds,planEnemy,stepBattle,closeRound,strength,status,safeLoad,serialize} from '../core.js';

test('campaign has three valid, independently playable battlefields',()=>{
 assert.equal(SCENARIOS.length,3);
 for(let stage=0;stage<3;stage++){
  const game=makeGame(stage);
  assert.equal(game.stage,stage);
  assert.equal(game.remaining,2);
  assert.equal(game.units.length,SCENARIOS[stage].friend.length+SCENARIOS[stage].enemy.length);
  assert(game.units.every(u=>Number.isFinite(u.x)&&u.x>=0&&u.x<=WORLD.w&&u.maxMen>0));
 }
});
test('two editable formations per turn, repeat modification free',()=>{
 const g=makeGame();
 assert(orderUnit(g,'f0',{x:200,y:550,stance:'advance'}));
 assert.equal(g.remaining,1);
 assert(orderUnit(g,'f0',{width:210}));
 assert.equal(g.remaining,1);
 assert(orderUnit(g,'f1',{stance:'charge'}));
 assert.equal(g.remaining,0);
 assert(!orderUnit(g,'f2',{stance:'advance'}));
 assert(!orderUnit(g,'e0',{stance:'charge'}));
 assert.equal(g.units.find(u=>u.id==='f0').target.width,210);
});
test('hold means halt even after a march order',()=>{
 const g=makeGame();orderUnit(g,'f0',{x:200,y:400,stance:'advance'});
 orderUnit(g,'f0',{stance:'hold'});
 const u=g.units[0];assert.equal(u.target.x,u.x);assert.equal(u.target.y,u.y);
});
test('touch front-line endpoint mapping roundtrips',()=>{
 const a={x:290,y:560,angle:-1.23,width:166};
 const ends=getEnds(a.x,a.y,a.angle,a.width);
 const reversed=lineFromEnds(ends[0],ends[1],a.angle);
 assert(Math.abs(reversed.x-a.x)<1e-7);
 assert(Math.abs(reversed.y-a.y)<1e-7);
 assert(Math.abs(reversed.width-a.width)<1e-7);
 assert(Math.abs(reversed.angle-a.angle)<1e-7);
});
test('pause-save reload keeps valid orders and protects against corrupt saves',()=>{
 const g=makeGame(1);
 orderUnit(g,'f2',{x:440,y:490,width:165,stance:'charge'});
 const restored=safeLoad(serialize(g));
 assert(restored);assert.equal(restored.units[2].target.stance,'charge');
 assert.equal(restored.remaining,1);assert.equal(restored.round,1);
 assert.equal(safeLoad('{ broken'),null);
 assert.equal(safeLoad(JSON.stringify({version:1,stage:1,units:[],round:1})),null);
 const tampered=JSON.parse(serialize(g));tampered.units[0].x=Infinity;
 assert.equal(safeLoad(JSON.stringify(tampered)),null);
});
test('simultaneous battles are deterministic under same orders',()=>{
 const a=makeGame(0),b=makeGame(0);
 for(const g of [a,b]){
  orderUnit(g,'f3',{x:315,y:240,stance:'charge',width:95});
  planEnemy(g);
  for(let i=0;i<171;i++)stepBattle(g,1/30);
  closeRound(g);
 }
 assert.equal(serialize(a),serialize(b));
 assert(a.units.some(u=>Math.abs(u.x-u.target.x)>0.001));
});
test('full campaign battles terminate without invalid unit states',()=>{
 for(let stage=0;stage<3;stage++){
  const g=makeGame(stage);
  const horse=g.units.find(u=>u.side==='friend'&&u.type==='horse');
  orderUnit(g,horse.id,{x:300,y:240,stance:'charge',width:95});
  let executed=0;
  while(!g.winner&&executed<15){
   planEnemy(g);
   for(let i=0;i<171;i++)stepBattle(g,1/30);
   closeRound(g);executed++;
   for(const u of g.units){
    assert(Number.isFinite(u.x)&&Number.isFinite(u.y));
    assert(Number.isFinite(u.cohesion)&&u.cohesion>=0&&u.cohesion<=100);
    assert(Number.isFinite(u.morale)&&u.morale>=0&&u.morale<=100);
    assert(Number.isInteger(u.men)&&u.men>=0&&u.men<=u.maxMen);
   }
  }
  assert(g.winner==='friend'||g.winner==='enemy');
  assert(executed<=SCENARIOS[stage].rounds);
 }
});
test('routing cascades without allowing negative strength',()=>{
 const g=makeGame(0);
 g.units[0].routed=true;g.units[0].men=0;assert.equal(orderUnit(g,'f0',{stance:'charge'}),false);
 assert.equal(strength(g,'friend')>=0,true);
 assert.equal(status(g),null);
});
