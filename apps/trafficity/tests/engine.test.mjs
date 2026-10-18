import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMap,createGame,shortestPath,autoRoute,routeVehicle,stopVehicle,advanceGame,botPlan,winner,offerRoute,roadWidth,weightedPath,replanAdaptive} from '../engine.js';
const game=(s=101,d='standard')=>createGame(s,d);
test('120 seeds: complete networks, bridges, bounded 35-node city, actual layout diversity',()=>{
 const layouts=new Set();
 for(let s=1;s<=120;s++){
  const map=createMap(s),second=createMap(s);
  assert.deepEqual(map,second);
  assert.equal(map.nodes.length,35);assert.equal(map.spots.length,8);
  for(const n of map.nodes)assert.equal(shortestPath(map,0,n.id)[0],0);
  const edges=new Set(map.edges.map(e=>e.slice().sort((a,b)=>a-b).join(':')));
  assert.equal(edges.size,map.edges.length);
  assert.ok(map.edges.length>=34);
  layouts.add([...edges].sort().join('|'));
  for(const [a,b] of map.edges){
   const cross=Math.min(Math.floor(a/5),Math.floor(b/5))===3&&Math.max(Math.floor(a/5),Math.floor(b/5))===4;
   if(cross)assert.ok(map.bridges.includes(a%5));
  }
 }
 assert.ok(layouts.size>50,'seeds must change road topology, not only pixel jitter');
});
test('route, stop, private road state are validated without partial mutation',()=>{
 const g=game(),v=g.vehicles[0],p=shortestPath(g.map,v.at,v.goal).slice(1);
 assert.equal(routeVehicle(g,0,0,p),true);
 assert.equal(routeVehicle(g,1,0,p),false);
 assert.equal(routeVehicle(g,0,0,[999]),false);
 assert.deepEqual(v.route,p);
 assert.equal(stopVehicle(g,0,0,999,3),false);
 assert.equal(stopVehicle(g,0,0,v.at,2),true);
});
test('stopping off lane waits exactly 3 turns',()=>{
 const g=game(),v=g.vehicles[0],path=shortestPath(g.map,v.at,v.goal).slice(1);
 routeVehicle(g,0,0,path);stopVehicle(g,0,0,v.at,3);
 for(let i=0;i<3;i++){advanceGame(g);assert.equal(v.at,0);assert.equal(v.parked,true);}
 advanceGame(g);assert.equal(v.at,path[0]);
});
test('intersection capacity blocks one competing arrival; blocked route remains queued',()=>{
 const g=game(39);let found=null;
 for(const node of g.map.nodes){
  const adjacent=g.map.graph[node.id];
  if(adjacent.length>=3){found={node:node.id,a:adjacent[0],b:adjacent[1]};break;}
 }
 assert.ok(found);
 const [a,b]=[g.vehicles[0],g.vehicles[2]];
 a.at=found.a;b.at=found.b;a.route=[found.node];b.route=[found.node];
 for(const v of [g.vehicles[1],g.vehicles[3]])v.route=[];
 advanceGame(g);
 const arrived=[a,b].filter(v=>v.at===found.node);
 assert.equal(arrived.length,1);
 const loser=[a,b].find(v=>v.at!==found.node);
 assert.equal(loser.route[0],found.node);
 assert.ok(loser.blocked>0);
 assert.ok(g.last.some(e=>e.type==='jam'));
});
test('head-on cars on a narrow street must reroute; wide streets can pass',()=>{
 const g=game(12),pair=g.map.edges.find(([a,b])=>roadWidth(g.map,a,b)==='narrow');
 assert.ok(pair);const [a,b]=pair;
 g.vehicles[0].at=a;g.vehicles[2].at=b;g.vehicles[0].route=[b];g.vehicles[2].route=[a];
 g.vehicles[1].route=[];g.vehicles[3].route=[];
 advanceGame(g);assert.equal(g.vehicles[0].at,a);assert.equal(g.vehicles[2].at,b);
 assert.equal(g.vehicles[0].blocked,1);assert.equal(g.vehicles[2].blocked,1);
});
test('public order is contested, delivered once, and replaced',()=>{
 const g=game(255),old=g.offers[0];assert.equal(g.offers.length,2);
 const v=g.vehicles[0];v.at=old.node;const prev=g.map.graph[v.at][0];v.at=prev;
 v.route=[old.node];g.vehicles.slice(1).forEach(x=>x.route=[]);
 const score=g.scores[0];advanceGame(g);
 assert.ok(g.scores[0]>=score+old.reward);
 assert.ok(g.last.some(e=>e.type==='offer'&&e.points===old.reward));
 assert.ok(!g.offers.some(o=>o.id===old.id));
 assert.equal(g.offers.length,2);
});
test('offer route uses only owned vehicles and current offer ids',()=>{
 const g=game(35),id=g.offers[0].id;
 assert.equal(offerRoute(g,1,0,id),false);
 assert.equal(offerRoute(g,0,0,99999),false);
 assert.equal(offerRoute(g,0,0,id),true);
 assert.equal(g.vehicles[0].route.at(-1),g.offers[0].node);
});
test('auto routes complete private deliveries with immediate replacement',()=>{
 const g=game(111),v=g.vehicles[0],oldGoal=v.goal;
 for(let i=0;i<28&&g.deliveries[0]===0;i++){autoRoute(g,0,0);advanceGame(g);}
 assert.ok(g.deliveries[0]>0);
 assert.ok(g.scores[0]>=10);
 assert.notEqual(v.goal,oldGoal);
});
test('three AI levels make legal progress; deterministic finished scores in 25 worlds',()=>{
 for(const difficulty of ['casual','standard','expert']){
  for(let seed=1;seed<=25;seed++){
   const a=game(seed,difficulty),b=game(seed,difficulty);
   for(const g of [a,b])for(let turn=0;turn<30;turn++){
    for(let id=0;id<2;id++)if(!g.vehicles[id].route.length)autoRoute(g,0,id);
    botPlan(g);const before=g.vehicles.map(x=>x.at);advanceGame(g);
    g.vehicles.forEach((v,i)=>assert.ok(v.at===before[i]||g.map.graph[before[i]].includes(v.at)));
   }
   assert.equal(a.turn,30);assert.equal(a.phase,'finished');assert.deepEqual(a,b);
   assert.ok(a.scores.every(x=>Number.isInteger(x)&&x>=0));
   assert.ok([-1,0,1].includes(winner(a)));
  }
 }
});
test('terminal state cannot accept commands or more turns',()=>{
 const g=game();
 for(let turn=0;turn<30;turn++)advanceGame(g);
 assert.equal(autoRoute(g,0,0),false);assert.equal(advanceGame(g),false);
 assert.equal(routeVehicle(g,0,0,[]),false);assert.equal(stopVehicle(g,0,0,0,1),false);
});


test('arterial avenues are continuous wide roads and both bridges align to them',()=>{
 for(let seed=1;seed<=40;seed++){
  const m=createMap(seed);
  for(const c of [1,3])for(let r=0;r<6;r++){
   const a=r*5+c,b=(r+1)*5+c;
   assert.ok(m.graph[a].includes(b));
   assert.equal(roadWidth(m,a,b),'wide');
  }
  for(const row of [1,5])for(let c=0;c<4;c++){
   const a=row*5+c,b=a+1;
   assert.ok(m.graph[a].includes(b));
   assert.equal(roadWidth(m,a,b),'wide');
  }
 }
});
test('adaptive player navigation avoids a blocked first junction but manual routes remain unchanged',()=>{
 const g=createGame(1),v=g.vehicles[2],raw=shortestPath(g.map,v.at,v.goal);
 assert.ok(raw.length>=3);
 const blocked=raw[1];
 g.vehicles[0].at=blocked;g.vehicles[0].parked=false;g.vehicles[0].route=[];
 assert.ok(autoRoute(g,1,2));
 assert.equal(v.navigation,'adaptive');assert.equal(v.route[0],9);
 const alternative=v.route.slice();
 assert.equal(routeVehicle(g,1,2,raw.slice(1)),true);
 assert.equal(v.navigation,'manual');
 assert.equal(replanAdaptive(g,v,true),false);
 assert.deepEqual(v.route,raw.slice(1));
});
test('narrow-road deadlocks yield after two blocked turns, rather than repeat forever',()=>{
 const g=createGame(32),edge=g.map.edges.find(([a,b])=>roadWidth(g.map,a,b)==='narrow');
 const [a,b]=edge;
 g.vehicles[0].at=a;g.vehicles[2].at=b;
 g.vehicles[0].route=[b];g.vehicles[2].route=[a];
 g.vehicles[1].route=[];g.vehicles[3].route=[];
 for(let i=0;i<2;i++)advanceGame(g);
 assert.equal(g.vehicles[0].at,a);assert.equal(g.vehicles[2].at,b);
 advanceGame(g);
 assert.equal(g.vehicles[0].at,b);assert.equal(g.vehicles[2].at,a);
 assert.ok(g.last.some(e=>e.type==='yield'));
 assert.equal(g.vehicles[0].waiting,1);
});
test('expert AI preserves offer choice instead of oscillating at every planning call',()=>{
 const g=createGame(7,'expert');botPlan(g);
 const choices=g.vehicles.filter(v=>v.side===1).map(v=>JSON.stringify(v.target));
 for(let i=0;i<5;i++)botPlan(g);
 assert.deepEqual(g.vehicles.filter(v=>v.side===1).map(v=>JSON.stringify(v.target)),choices);
});
