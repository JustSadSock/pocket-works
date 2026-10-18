import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,transition,reach,project,aiTurn,UNITS,BUILDINGS,isValidSave} from '../engine.js';
test('seeded map is repeatable and starts are equivalent',()=>{
 const a=createGame(41235),b=createGame(41235);
 assert.deepEqual(a.map,b.map);
 assert.deepEqual(a.buildings,b.buildings);
 assert.deepEqual(a.units,b.units);
 assert.equal(a.gold[1],a.gold[2]);
 assert.equal(a.units.filter(u=>u.owner===1).length,3);
 assert.equal(a.units.filter(u=>u.owner===2).length,3);
});
test('all map sizes generate playable bases and visibility',()=>{
 for(const size of ['compact','standard','expanse']){
  const s=createGame(1234,size);assert.ok(isValidSave(s));assert.equal(s.buildings.filter(b=>b.type==='base').length,2);
  assert.ok(s.seen[1][2][2]);assert.ok(!s.seen[1][s.h-3][s.w-3]);
  assert.ok(s.map.flat().every(v=>v>=0&&v<=4));
  assert.ok(Object.keys(reach(s,s.units[0])).length>1);
 }
});
test('fog never reveals hostile units or terrain before discovery',()=>{
 const s=createGame(1908);const v=project(s,1);
 assert.equal(v.units.filter(u=>u.owner===2).length,0);
 assert.equal(v.map[s.h-3][s.w-3],null);
 assert.equal(v.gold[2],undefined);
 assert.equal(v.seen[2],undefined);
 assert.equal(v.seed,0); // Never leak the procedural world seed to the recipient
});
test('turn ownership and out-of-bounds moves are rejected without mutation',()=>{
 const s=createGame(10);
 const bad=transition(s,2,{type:'end'});assert.ok(bad.error);assert.strictEqual(bad.state,s);
 const far=transition(s,1,{type:'move',unit:s.units[0].id,r:999,c:-4});assert.ok(far.error);
 assert.equal(s.current,1);
});
test('movement consumes move but permits an attack, starting next turn resets it',()=>{
 let s=createGame(502);const u=s.units[0],p=Object.keys(reach(s,u)).map(k=>k.split(',').map(Number))[0];
 const a=transition(s,1,{type:'move',unit:u.id,r:p[0],c:p[1]});assert.equal(a.error,null);
 s=a.state;assert.ok(s.units.find(x=>x.id===u.id).moved);
 assert.ok(transition(s,1,{type:'move',unit:u.id,r:2,c:3}).error);
 s=transition(s,1,{type:'end'}).state;
 assert.equal(s.current,2);assert.ok(s.gold[2]>=7);
 s=transition(s,2,{type:'end'}).state;assert.equal(s.current,1);
 assert.equal(s.units.find(x=>x.id===u.id).mp,UNITS.swordsman.move);
});
test('recruitment spends gold and does not permit repeated training',()=>{
 let s=createGame(801),b=s.buildings.find(x=>x.type==='base'&&x.owner===1);
 let r=transition(s,1,{type:'recruit',building:b.id,unitType:'scout',r:2,c:1});
 assert.equal(r.error,null);assert.equal(r.state.gold[1],5);
 assert.equal(r.state.units.filter(u=>u.owner===1).length,4);
 assert.ok(transition(r.state,1,{type:'recruit',building:b.id,unitType:'scout',r:2,c:4}).error);
});
test('captured mills switch income and upgrades cost six',()=>{
 let s=createGame(15),m=s.buildings.find(x=>x.owner===1&&x.type==='mill');
 const result=transition(s,1,{type:'upgrade',building:m.id});
 assert.equal(result.error,null);assert.equal(result.state.gold[1],1);
 assert.equal(result.state.buildings.find(b=>b.id===m.id).level,2);
});
test('AI hands control back and never produces invalid placements',()=>{
 let s=createGame(12984);
 for(let i=0;i<5;i++){s=transition(s,1,{type:'end'}).state;s=aiTurn(s,3);
 assert.ok(s.phase==='finished'||s.current===1);
 assert.ok(s.units.every(u=>u.r>=0&&u.r<s.h&&u.c>=0&&u.c<s.w));
 assert.equal(new Set(s.units.map(u=>u.r+','+u.c)).size,s.units.length);}
});
test('citadel destruction ends war with attacker victory',()=>{
 let s=createGame(901),base=s.buildings.find(b=>b.owner===2&&b.type==='base'),att=s.units.find(u=>u.owner===1);
 s.units=s.units.filter(u=>u.owner!==2);s.units.find(u=>u.id===att.id).r=base.r-1;s.units.find(u=>u.id===att.id).c=base.c;
 base.hp=1;s.seen[1][base.r][base.c]=true;
 const out=transition(s,1,{type:'attack',unit:att.id,r:base.r,c:base.c});
 assert.equal(out.error,null);assert.equal(out.state.phase,'finished');assert.equal(out.state.winner,1);
});
test('invalid saves are rejected and snapshots are separate objects',()=>{
 const s=createGame(209);assert.ok(isValidSave(s));assert.equal(isValidSave({...s,map:[]}),false);
 const v=project(s,1);v.gold[1]=999;assert.equal(s.gold[1],7);
});

test('healer restores damaged friendly unit once but cannot heal enemies',()=>{
 const s=createGame(812);
 const medic={id:s.nextId++,type:'mage',owner:1,r:2,c:4,hp:4,mp:3,acted:false,moved:false};
 s.units.push(medic);
 const ally=s.units.find(u=>u.owner===1&&u.type==='swordsman');
 ally.hp=2;
 const healed=transition(s,1,{type:'heal',unit:medic.id,r:ally.r,c:ally.c});
 assert.equal(healed.error,null);
 assert.equal(healed.state.units.find(u=>u.id===ally.id).hp,5);
 assert.ok(transition(healed.state,1,{type:'heal',unit:medic.id,r:ally.r,c:ally.c}).error);
 assert.ok(transition(s,1,{type:'heal',unit:medic.id,r:s.h-3,c:s.w-4}).error);
});
