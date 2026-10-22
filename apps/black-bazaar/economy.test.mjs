import test from 'node:test';
import assert from 'node:assert/strict';
import {forecastEconomy,expense} from './economy.js';
import game from './server/module.ts';

const item=(id,positive,negative)=>({id,positive,negative});
const wallet=(gold,crystals,parts)=>({gold,crystals,parts});
test('Three-resource net balance combines positive and negative effects',()=>{
 const p=forecastEconomy(wallet(100,5,2),[
  item('a',{type:'crystals',value:2},{type:'gold',value:1}),
  item('b',{type:'gold',value:3},{type:'crystals',value:1})
 ]);
 assert.deepEqual(p.delta,{gold:2,crystals:1,parts:0});
 assert.equal(p.inactive.length,0);
});
test('Insufficient upkeep prevents BOTH benefit and cost; reinstates automatically',()=>{
 const collection=[item('a',{type:'crystals',value:4},{type:'parts',value:1})];
 const poor=forecastEconomy(wallet(10,0,0),collection);
 assert.deepEqual(poor.delta,{gold:0,crystals:0,parts:0});
 assert.deepEqual(poor.inactive[0].missing,['parts']);
 const richer=forecastEconomy(wallet(10,0,1),collection);
 assert.deepEqual(richer.delta,{gold:0,crystals:4,parts:-1});
 assert.deepEqual(richer.activeIds,['a']);
});
test('Upkeep is reserved before income: no infinite item feedback loop',()=>{
 const p=forecastEconomy(wallet(0,0,0),[
  item('produces',{type:'parts',value:3},{type:'gold',value:1}),
  item('consumer',{type:'gold',value:7},{type:'parts',value:1})
 ]);
 assert.equal(p.activeIds.length,0);
 assert.equal(p.inactive.length,2);
});
test('Gold-percent upkeep uses available wallet and rounds down',()=>{
 assert.deepEqual(expense({type:'goldPercent',value:18},wallet(99,0,0)),{gold:17,crystals:0,parts:0});
});
test('Server item payout agrees with client preview on ordinary items',()=>{
 const s={round:2,serial:1,contestants:[{
  id:'p1',name:'A',character:'Маг',bankrupt:false,
  resources:wallet(4,0,0),
  items:[
   {id:'a',key:'pig',variant:0,acquiredRound:1,history:[]},
   {id:'b',key:'spider',variant:0,acquiredRound:1,history:[]}
  ]
 }],log:[],metrics:{}};
 const definitions=[
  item('a',{type:'gold',value:36},{type:'crystals',value:3}),
  item('b',{type:'parts',value:1},{type:'gold',value:18})
 ];
 const expected=forecastEconomy(s.contestants[0].resources,definitions);
 // Use a valid match to pass through server roundIncome without running full game.
 const players=[{id:'p1',name:'A'},{id:'p2',name:'B'}];
 const room=game.createRoom({player:players[0]}).state;
 game.onJoin({state:room,players});
 game.onMessage({state:room,player:players[0],payload:{type:'start'}});
 // Inject controlled wallet and owned items, then end every player turn until the round settles.
 const owned=room.contestants.find(p=>p.id==='p1');
 owned.items=s.contestants[0].items;
 owned.resources=wallet(4,0,0);
 // The second contestant can have items, but the target must match the client prediction.
 let steps=0;
 while(room.round===1&&steps++<4){
  const turn=room.contestants[room.turnIndex];
  game.onMessage({state:room,player:{id:turn.id},payload:{type:'end'}});
 }
 assert.deepEqual(owned.resources,expected.after);
});
