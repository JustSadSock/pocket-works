import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMap,createGame,shortestPath,autoRoute,routeVehicle,stopVehicle,advanceGame,botPlan,winner} from '../engine.js';
const G=(s=101)=>createGame(s);
test('seed produces connected cities with identical streets',()=>{
 for(let seed=1;seed<=65;seed++){
  const a=createMap(seed),b=createMap(seed);assert.deepEqual(a,b);
  assert.equal(a.nodes.length,35);assert.equal(a.spots.length,8);
  for(const n of a.nodes)assert.equal(shortestPath(a,0,n.id)[0],0);
  assert.equal(new Set(a.edges.map(e=>e.slice().sort((x,y)=>x-y).join(':'))).size,a.edges.length);
 }
});
test('routes require adjacent streets and same owner',()=>{
 const g=G();const v=g.vehicles[0];const p=shortestPath(g.map,v.at,v.goal).slice(1);
 assert.equal(routeVehicle(g,0,0,p),true);assert.deepEqual(v.route,p);
 assert.equal(routeVehicle(g,1,0,p),false);
 assert.equal(routeVehicle(g,0,0,[999]),false);
 assert.deepEqual(v.route,p);
 assert.equal(stopVehicle(g,0,0,999,3),false);
 assert.equal(stopVehicle(g,0,0,v.at,2),true);
});
test('one tick moves one edge and stop order pauses exactly N turns',()=>{
 const g=G(),v=g.vehicles[0],p=shortestPath(g.map,v.at,v.goal).slice(1);
 routeVehicle(g,0,0,p);const at=v.at;
 stopVehicle(g,0,0,at,3);
 for(let i=0;i<3;i++){advanceGame(g);assert.equal(v.at,at);}
 advanceGame(g);assert.equal(v.at,p[0]);assert.equal(g.turn,4);
});
test('deliveries score and spawn new contract',()=>{
 const g=G(11),v=g.vehicles[0],first=v.goal;
 autoRoute(g,0,0);let guard=0;
 while(g.deliveries[0]===0&&guard++<25)advanceGame(g);
 assert.equal(g.deliveries[0],1);assert.ok(g.scores[0]>=10);
 assert.notEqual(v.goal,first);assert.equal(v.route.length,0);
});
test('bot completes games; every move respects graph and score remains valid',()=>{
 for(let s=0;s<30;s++){
  const g=G(s+1);let old=g.vehicles.map(v=>v.at);
  for(let turn=0;turn<30;turn++){
   botPlan(g);autoRoute(g,0,0);autoRoute(g,0,1);advanceGame(g);
   g.vehicles.forEach((v,i)=>assert.ok(v.at===old[i]||g.map.graph[old[i]].includes(v.at)));
   old=g.vehicles.map(v=>v.at);
  }
  assert.equal(g.phase,'finished');assert.equal(g.turn,30);
  assert.ok(g.scores.every(n=>Number.isInteger(n)&&n>=0));
  assert.ok([-1,0,1].includes(winner(g)));
 }
});
test('invalid commands cannot mutate terminal state',()=>{
 const g=G();for(let i=0;i<30;i++)advanceGame(g);
 assert.equal(autoRoute(g,0,0),false);assert.equal(advanceGame(g),false);
});
