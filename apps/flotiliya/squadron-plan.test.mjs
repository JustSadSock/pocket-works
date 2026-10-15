import test from 'node:test';
import assert from 'node:assert/strict';
import {planSquadronShip} from './squadron-plan.js';
import {getBudget,canPlan} from './turn-budget.js';

const ship=(type,other={})=>({
 id:'ally',type,x:330,y:850,angle:-Math.PI/2,
 speed:type==='heavy'?39:59,turn:type==='heavy'?.78:1.26,
 range:type==='heavy'?155:172,crew:30,maxCrew:30,morale:100,
 oars:100,orders:[],...other
});
test('squadron assistance never exceeds either stage or action limits',()=>{
 for(const type of ['swift','heavy'])for(const oars of [100,60,15]){
  const ally=ship(type,{oars});
  const foe={id:'enemy',x:330,y:145,angle:Math.PI/2};
  const orders=planSquadronShip(ally,foe,{islands:[]});
  assert.ok(canPlan(ally,orders),JSON.stringify({type,oars,budget:getBudget(ally,orders)}));
  assert.ok(orders.every(o=>o.route.length<=1));
 }
});
test('breakthrough mission produces an explicit northward waypoint',()=>{
 const ally=ship('swift');
 const order=planSquadronShip(ally,{id:'enemy',x:330,y:145},{mission:'breakout'});
 assert.ok(order[0].route[0].y<ally.y);
 assert.ok(canPlan(ally,order));
});
