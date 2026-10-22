import test from 'node:test';
import assert from 'node:assert/strict';
import game,{TOTAL_ROUNDS} from './server/module.ts';

function makeRoom(n=4){
 const players=Array.from({length:n},(_,i)=>({id:'p'+i,name:'Торговец '+i}));
 const {state}=game.createRoom({player:players[0]});
 game.onJoin({state,players});
 game.onMessage({state,player:players[0],payload:{type:'start'}});
 assert.equal(state.phase,'play');
 return {state,players};
}
function act(state,id,payload){return game.onMessage({state,player:{id},payload});}
test('Room supports 2–6 players and starts with unique characters, wallets and secrets',()=>{
 for(const count of [2,3,4,5,6]){
  const {state}=makeRoom(count);
  assert.equal(state.contestants.length,count);
  assert.equal(new Set(state.contestants.map(x=>x.character)).size,count);
  for(const player of state.contestants){
   assert.equal(player.items.length,2);
   assert.equal(player.resources.gold,250);
   assert.ok(player.positiveTarget!==player.id);
   assert.ok(player.negativeTarget!==player.id);
   assert.equal(player.quota.parts>0,true);
  }
 }
});
test('Per-player network projection hides other players quota, items and relationships',()=>{
 const {state}=makeRoom();
 const own=game.viewForPlayer({state,player:{id:state.contestants[0].id}});
 const other=game.viewForPlayer({state,player:{id:state.contestants[1].id}});
 assert.equal(own.you.items.length,2);
 assert.ok(own.you.quota.gold>0);
 assert.ok(other.you.quota.gold>0);
 assert.equal(own.players.some(p=>'quota' in p),false);
 assert.equal(other.players.some(p=>'positiveTarget' in p),false);
 assert.equal(own.you.id,state.contestants[0].id);
 assert.equal(other.you.id,state.contestants[1].id);
});
test('Seller lists an item, buyer can inspect its hidden downside and place a bid',()=>{
 const {state}=makeRoom(2);
 const [seller,buyer]=state.contestants;
 const item=seller.items[0];
 act(state,seller.id,{type:'post',itemId:item.id,ask:{gold:100,crystals:0,parts:0}});
 assert.equal(state.listing.itemId,item.id);
 const before=buyer.resources.gold;
 act(state,buyer.id,{type:'inspect'});
 assert.equal(buyer.resources.gold,before-15);
 assert.equal(buyer.inspections[0].itemId,item.id);
 act(state,buyer.id,{type:'bid',offer:{gold:65,crystals:1,parts:0}});
 assert.equal(state.bids.length,1);
 const sellerBefore=seller.resources.gold;
 act(state,seller.id,{type:'accept',buyer:buyer.id});
 assert.equal(state.listing,null);
 assert.equal(buyer.items.some(i=>i.id===item.id),true);
 assert.equal(seller.items.some(i=>i.id===item.id),false);
 assert.equal(seller.resources.gold,sellerBefore+65);
 assert.equal(item.acquiredRound,1);
});
test('Invalid trades do not mutate state, cannot buy own listing, and cannot resell immediately',()=>{
 const {state}=makeRoom(2);
 const [a,b]=state.contestants;
 const gold=a.resources.gold;
 act(state,b.id,{type:'post',itemId:b.items[0].id,ask:{gold:1}});
 assert.equal(state.listing,null);
 act(state,a.id,{type:'post',itemId:a.items[0].id,ask:{gold:-10}});
 assert.equal(state.listing,null);
 act(state,a.id,{type:'post',itemId:a.items[0].id,ask:{gold:100}});
 act(state,b.id,{type:'bid',offer:{gold:40000}});
 assert.equal(state.bids.length,0);
 assert.equal(a.resources.gold,gold);
});
test('Urgent tasks activate in rounds 3/6/9; penalties and round economy advance to a final ranking',()=>{
 const {state}=makeRoom(2);
 const seen=[];
 while(state.phase==='play'){
  const person=state.contestants[state.turnIndex];
  if(person.urgent)seen.push([state.round,person.id]);
  const id=person.id;
  const before=state.revision;
  act(state,id,{type:'end'});
  assert.ok(state.revision>before);
 }
 assert.equal(state.phase,'done');
 assert.equal(seen.filter(x=>x[0]===3).length,2);
 assert.equal(seen.filter(x=>x[0]===6).length,2);
 assert.equal(seen.filter(x=>x[0]===9).length,2);
 assert.equal(state.round,TOTAL_ROUNDS+1);
 assert.deepEqual(state.ranking.map(x=>x.place),[1,2]);
 assert.ok(state.contestants.every(p=>Object.values(p.resources).every(n=>n>=0)));
});
test('Rare legendary destiny can claim second, never first, when linked player wins',()=>{
 const {state}=makeRoom(4);
 const [winner,other,linked,last]=state.contestants;
 for(const p of state.contestants){p.resources={gold:1,crystals:1,parts:1};p.legendary=null;}
 winner.resources={gold:999,crystals:999,parts:99};
 other.resources={gold:500,crystals:50,parts:10};
 linked.legendary=winner.id;
 const loop=9*state.contestants.length;
 for(let i=0;i<loop;i++){const p=state.contestants[state.turnIndex];act(state,p.id,{type:'end'});}
 assert.equal(state.ranking[0].id,winner.id);
 // The link is honored only if the linked player survives all urgent waves.
 if(!linked.bankrupt)assert.equal(state.ranking[1].id,linked.id);
});
