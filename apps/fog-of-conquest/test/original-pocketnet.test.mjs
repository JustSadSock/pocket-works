import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../server/module.ts',import.meta.url),'utf8');
const rules=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const player1={id:'p1',name:'Север'},player2={id:'p2',name:'Юг'};
test('original roster, all map sizes, symmetric base placement',()=>{
 for(const [size,rows,cols] of [['tiny',5,8],['small',10,15],['medium',20,30],['large',20,60]]){
  const g=rules.createOriginalMatch({size});
  assert.equal(g.rows,rows);assert.equal(g.cols,cols);
  assert.equal(g.map.length,rows);assert.equal(g.map[0].length,cols);
  assert.equal(g.state.gold[1],5);assert.equal(g.state.gold[2],5);
  assert.equal(g.units.filter(u=>u.owner===1&&u.type==='swordsman')[0].hp,5);
  assert.equal(g.units.filter(u=>u.owner===1&&u.type==='archer')[0].hp,4);
  assert.equal(g.buildings.filter(b=>b.type==='base').length,2);
  assert.equal(new Set(g.buildings.map(b=>b.id)).size,g.buildings.length);
 }
});
test('original bonus unit remains restricted to beta',()=>{
 const basic=rules.createOriginalMatch({size:'medium'});
 const beta=rules.createOriginalMatch({size:'medium',beta:true});
 assert.equal(basic.units.some(u=>u.type==='bog'),false);
 assert.equal(beta.units.filter(u=>u.type==='bog').length,2);
 assert.equal(beta.units.find(u=>u.type==='bog').hp,1000);
});
test('one original move changes only server snapshot and consumes terrain movement',()=>{
 const g=rules.createOriginalMatch({size:'medium'}),u=g.units.find(x=>x.owner===1&&x.type==='swordsman');
 const result=rules.originalAction(g,1,{type:'move',unit:u.id,r:1,c:3});
 assert.equal(result.error,null);assert.equal(g.units.find(x=>x.id===u.id).c,2);
 assert.equal(result.state.units.find(x=>x.id===u.id).c,3);
 assert.equal(result.state.units.find(x=>x.id===u.id).mp,1);
 const repeated=rules.originalAction(result.state,2,{type:'move',unit:u.id,r:1,c:4});
 assert.match(repeated.error,/Ход/);
});
test('original building recruitment deducts money, prevents impossible unit & double occupancy',()=>{
 const g=rules.createOriginalMatch({size:'medium'});
 const base=g.buildings.find(b=>b.owner===1&&b.type==='base');
 const params={type:'spawn',building:base.id,unitType:'swordsman',r:0,c:1};
 const out=rules.originalAction(g,1,params);
 assert.equal(out.error,null);assert.equal(out.state.state.gold[1],2);
 assert.ok(out.state.units.some(u=>u.r===0&&u.c===1&&u.mp===0));
 out.state.state.gold[1]=5; // Verify occupied-cell rejection independently of depleted funds.
 assert.match(rules.originalAction(out.state,1,params).error,/недоступно/);
 assert.equal(rules.originalAction(g,1,{...params,unitType:'mage'}).error!==null,true);
});
test('income, idle recovery, turn switching preserve original order',()=>{
 const g=rules.createOriginalMatch({size:'medium'}),a=g.units.find(u=>u.owner===1&&u.type==='archer');
 a.hp=2;
 const next=rules.originalAction(g,1,{type:'end'}).state;
 assert.equal(next.state.currentPlayer,2);assert.equal(next.state.turn,1);
 assert.equal(next.units.find(u=>u.id===a.id).hp,3);
 assert.equal(next.state.gold[2],6);
 const round=rules.originalAction(next,2,{type:'end'}).state;
 assert.equal(round.state.currentPlayer,1);assert.equal(round.state.gold[1],6);
});
test('network seats, authoritative turn checks and recipient fog',()=>{
 const mod=rules.default,created=mod.createRoom({player:player1}),state=created.state;
 const joined=mod.onJoin({state,player:player2,players:[player1,player2]}).state;
 const started=mod.onMessage({state:joined,player:player1,players:[player1,player2],payload:{type:'start',size:'medium'}}).state;
 assert.equal(started.phase,'battle');assert.equal(started.game.schema,2);
 const p1=mod.viewForPlayer({state:started,player:player1});
 const p2=mod.viewForPlayer({state:started,player:player2});
 assert.equal(p1.side,1);assert.equal(p2.side,2);
 assert.equal(p1.game.state.gold[2],undefined);
 assert.equal(p2.game.state.gold[1],undefined);
 assert.equal(p1.game.units.some(u=>u.owner===2),false);
 assert.equal(p2.game.units.some(u=>u.owner===1),false);
 assert.equal(p1.game.map[19][29],0);
 const forbidden=mod.onMessage({state:started,player:player2,players:[player1,player2],payload:{type:'act',revision:started.game.revision,action:{type:'end'}}});
 assert.equal(forbidden.state.game.revision,started.game.revision);
 assert.equal(forbidden.events[0].type,'notice');
 const valid=mod.onMessage({state:started,player:player1,players:[player1,player2],payload:{type:'act',revision:started.game.revision,action:{type:'end'}}});
 assert.equal(valid.state.game.state.currentPlayer,2);
});
