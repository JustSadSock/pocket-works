import test from 'node:test';
import assert from 'node:assert/strict';
import {attackSector,attackPacket,condition,contest,rangeBlocked} from './naval-combat.js';
import {maxPoints,getBudget,canPlan} from './turn-budget.js';

function ship(x=100,y=100,angle=0,type='swift'){
 const data={swift:{turn:1.26,speed:59,board:2.2},heavy:{turn:.78,speed:39,board:4.1},bow:{turn:1.04,speed:49,board:2.5}}[type];
 return {id:type,x,y,angle,velocity:22,maxHp:90,hp:90,crew:32,maxCrew:32,morale:100,oars:100,maxOars:100,damage:4,
 ...data,orders:[{kind:'hold',route:[],targetId:null},{kind:'shoot',route:[],targetId:null}]};
}
test('attack sectors follow bow, stern and both broadsides',()=>{
 const d=ship();
 assert.equal(attackSector(d,ship(170,100)),'bow');
 assert.equal(attackSector(d,ship(30,100)),'stern');
 assert.equal(attackSector(d,ship(100,145)),'starboard');
 assert.equal(attackSector(d,ship(100,55)),'port');
});
test('side volleys break oars, while stern hits hurt morale',()=>{
 const defender=ship(),side=attackPacket(ship(100,145),defender),stern=attackPacket(ship(20,100),defender);
 assert.ok(side.oars>stern.oars);
 assert.ok(stern.morale>side.morale);
});
test('movement, turning and next-turn AP decrease when oars are lost',()=>{
 const s=ship(100,100,0,'swift'),before=condition(s),ap=maxPoints(s);
 s.oars=28;
 const after=condition(s);
 assert.ok(after.speed<before.speed*.65);
 assert.ok(after.turn<before.turn*.6);
 assert.ok(maxPoints(s)<ap);
});
test('both orders spend one movement budget and reject overspend',()=>{
 const s=ship(100,100,0,'heavy');
 s.orders[0].route=[{x:170,y:100}];
 s.orders[1].kind='board';
 assert.equal(getBudget(s).total,6);
 assert.equal(getBudget(s).spent,6);
 assert.ok(canPlan(s,s.orders));
 s.orders[0].route=[{x:210,y:100}];
 assert.equal(canPlan(s,s.orders),false);
});
test('boarding bonuses favor the stern and supporting ships',()=>{
 const atk=ship(45,100),def=ship(100,100);
 const unhelped=contest(atk,def,0,0),reinforced=contest(atk,def,2,0);
 assert.ok(reinforced.pressure>unhelped.pressure);
});
test('islands block direct shots',()=>{
 const a=ship(0,0),b=ship(200,0),islands=[{x:100,y:0,rx:40,ry:20}];
 const td=(island,x,y)=>Math.hypot((x-island.x)/island.rx,(y-island.y)/island.ry);
 assert.ok(rangeBlocked(a,b,islands,td));
 assert.ok(!rangeBlocked(a,ship(0,200),islands,td));
});
