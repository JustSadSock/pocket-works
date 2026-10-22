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
 // Isolate the ranking contract from stochastic inventory effects.
 for(const p of state.contestants){
   p.items=[];p.resources={gold:1,crystals:1,parts:1};p.legendary=null;
 }
 winner.resources={gold:2000,crystals:800,parts:50};
 other.resources={gold:500,crystals:50,parts:10};
 linked.legendary=winner.id;
 const loop=9*state.contestants.length;
 for(let i=0;i<loop;i++){const p=state.contestants[state.turnIndex];act(state,p.id,{type:'end'});}
 assert.equal(state.ranking[0].id,winner.id);
 // The link is honored only if the linked player survives all urgent waves.
 if(!linked.bankrupt)assert.equal(state.ranking[1].id,linked.id);
});


test('Direct deals support resource swaps across turns; only parties can inspect terms',()=>{
 const {state}=makeRoom(4);
 const [a,b,c]=state.contestants;
 const give={gold:25,crystals:0,parts:0},want={gold:0,crystals:5,parts:0};
 const beforeA={...a.resources},beforeB={...b.resources};
 act(state,a.id,{type:'deal_propose',to:b.id,give,want});
 assert.equal(state.deals.length,1);
 const id=state.deals[0].id;
 const own=game.viewForPlayer({state,player:{id:a.id}});
 const recipient=game.viewForPlayer({state,player:{id:b.id}});
 const stranger=game.viewForPlayer({state,player:{id:c.id}});
 assert.equal(own.deals.length,1);
 assert.equal(recipient.deals.length,1);
 assert.equal(stranger.deals.length,0);
 assert.equal(stranger.players[0].inventory.every(item=>!('positive' in item)&&!('negative' in item)),true);
 assert.equal(own.players.some(p=>'quota' in p||'positiveTarget' in p),false);
 const malicious=act(state,c.id,{type:'deal_accept',dealId:id});
 assert.equal(malicious.events[0].type,'notice');
 assert.equal(state.deals.length,1);
 act(state,b.id,{type:'deal_accept',dealId:id});
 assert.equal(state.deals.length,0);
 assert.equal(a.resources.gold,beforeA.gold-25);
 assert.equal(a.resources.crystals,beforeA.crystals+5);
 assert.equal(b.resources.gold,beforeB.gold+25);
 assert.equal(b.resources.crystals,beforeB.crystals-5);
 const replay=act(state,b.id,{type:'deal_accept',dealId:id});
 assert.equal(replay.events[0].type,'notice');
});
test('Private barter moves both owned items, reveals private attributes to new owners, and enforces resale cooldown',()=>{
 const {state}=makeRoom(2);
 const [a,b]=state.contestants;
 const first=a.items[0],second=b.items[0];
 act(state,a.id,{type:'deal_propose',to:b.id,
   give:{gold:0},want:{crystals:0},giveItemId:first.id,wantItemId:second.id
 });
 assert.equal(state.deals.length,1);
 const id=state.deals[0].id;
 act(state,b.id,{type:'deal_accept',dealId:id});
 assert.ok(b.items.some(item=>item.id===first.id));
 assert.ok(a.items.some(item=>item.id===second.id));
 assert.equal(first.acquiredRound,state.round);
 assert.equal(second.acquiredRound,state.round);
 const view=game.viewForPlayer({state,player:{id:b.id}});
 assert.ok(view.you.items.some(item=>item.id===first.id&&item.positive&&item.negative));
 const fail=act(state,b.id,{type:'deal_propose',to:a.id,give:{gold:0},want:{gold:1},giveItemId:first.id});
 assert.equal(fail.events[0].type,'notice');
 assert.equal(state.deals.length,0);
});
test('Private proposals cannot spend counterfeit balances and expire when their items are sold',()=>{
 const {state}=makeRoom(3);
 const [a,b]=state.contestants;
 const rejected=act(state,a.id,{type:'deal_propose',to:b.id,give:{gold:3000},want:{gold:1}});
 assert.equal(rejected.events[0].type,'notice');
 assert.equal(state.deals.length,0);
 const item=a.items[0];
 act(state,a.id,{type:'deal_propose',to:b.id,give:{gold:1},want:{gold:2},giveItemId:item.id});
 assert.equal(state.deals.length,1);
 act(state,a.id,{type:'post',itemId:item.id,ask:{gold:20}});
 const stale=act(state,b.id,{type:'deal_accept',dealId:state.deals[0].id});
 assert.equal(stale.events[0].type,'notice');
 assert.equal(a.items.some(x=>x.id===item.id),true);
 act(state,b.id,{type:'bid',offer:{gold:20}});
 act(state,a.id,{type:'accept',buyer:b.id});
 assert.equal(state.deals.length,0);
});
test('Two simultaneous proposals cannot double-spend the same funds',()=>{
 const {state}=makeRoom(3);
 const [a,b,c]=state.contestants;
 // Both recipients promise resources, but the origin has only 250 gold.
 for(const target of [b,c])act(state,target.id,{type:'deal_propose',to:a.id,
   give:{gold:1},want:{gold:200}});
 assert.equal(state.deals.length,2);
 const idB=state.deals.find(d=>d.from===b.id).id;
 const idC=state.deals.find(d=>d.from===c.id).id;
 act(state,a.id,{type:'deal_accept',dealId:idB});
 assert.equal(a.resources.gold,51);
 const reply=act(state,a.id,{type:'deal_accept',dealId:idC});
 assert.equal(reply.events[0].type,'notice');
 assert.equal(a.resources.gold,51);
 assert.equal(b.resources.gold,449);
 assert.equal(c.resources.gold,250);
});
test('An urgent personal task can be completed using resources traded during another player turn',()=>{
 const {state}=makeRoom(2);
 const [a,b]=state.contestants;
 // Move to the third round, and stop on the first player's urgent task.
 while(state.round<3){const turn=state.contestants[state.turnIndex];act(state,turn.id,{type:'end'});}
 const onDuty=state.contestants[state.turnIndex],friend=state.contestants.find(p=>p.id!==onDuty.id);
 onDuty.urgent={needs:{gold:0,crystals:3,parts:0},status:'pending'};
 onDuty.resources.crystals=0;
 const before=friend.resources.crystals;
 act(state,onDuty.id,{type:'deal_propose',to:friend.id,give:{gold:1},want:{crystals:3}});
 const id=state.deals[0].id;
 act(state,friend.id,{type:'deal_accept',dealId:id});
 assert.equal(friend.resources.crystals,before-3);
 act(state,onDuty.id,{type:'end'});
 assert.equal(onDuty.urgent.status,'success');
 assert.equal(onDuty.strikes,0);
});
test('Leaving player forfeits; remaining players finish without stalled bankrupt turns',()=>{
 const {state,players}=makeRoom(3);
 const quitter=state.contestants[1];
 const remaining=state.players.filter(p=>p.id!==quitter.id);
 game.onLeave({state,player:{id:quitter.id},players:remaining});
 assert.equal(quitter.bankrupt,true);
 let guard=0;
 while(state.phase==='play'&&guard++<100){
  const turn=state.contestants[state.turnIndex];
  assert.notEqual(turn.id,quitter.id);
  act(state,turn.id,{type:'end'});
 }
 assert.equal(state.phase,'done');
 assert.ok(guard<100);
});


test('Private counteroffer reverses parties, swaps items safely, and original offer cannot be replayed',()=>{
 const {state}=makeRoom(3);
 const [a,b,c]=state.contestants;
 const first=a.items[0],second=b.items[0];
 act(state,a.id,{type:'deal_propose',to:b.id,give:{gold:40},want:{crystals:2},giveItemId:first.id});
 const initialId=state.deals[0].id;
 const unauth=act(state,c.id,{type:'deal_counter',dealId:initialId,give:{crystals:2},want:{gold:20}});
 assert.equal(unauth.events[0].type,'notice');
 act(state,b.id,{type:'deal_counter',dealId:initialId,
   give:{crystals:3},want:{gold:25},giveItemId:second.id,wantItemId:first.id});
 assert.equal(state.deals.length,1);
 const revised=state.deals[0];
 assert.equal(revised.from,b.id);
 assert.equal(revised.to,a.id);
 assert.equal(revised.depth,1);
 assert.notEqual(revised.id,initialId);
 assert.equal(revised.giveItemId,second.id);
 assert.equal(revised.wantItemId,first.id);
 assert.equal(game.viewForPlayer({state,player:{id:c.id}}).deals.length,0);
 const replay=act(state,b.id,{type:'deal_accept',dealId:initialId});
 assert.equal(replay.events[0].type,'notice');
 act(state,a.id,{type:'deal_accept',dealId:revised.id});
 assert.equal(state.deals.length,0);
 assert.equal(a.items.some(i=>i.id===second.id),true);
 assert.equal(b.items.some(i=>i.id===first.id),true);
 // Item transfers trigger secret target penalties, unlike plain resource swaps.
 assert.equal(a.resources.gold,225-(b.negativeTarget===a.id?20:0));
 assert.equal(b.resources.gold,275-(a.negativeTarget===b.id?20:0));
});
test('Counteroffers are validated against inventory and resources and have a finite negotiation depth',()=>{
 const {state}=makeRoom(2),[a,b]=state.contestants;
 act(state,a.id,{type:'deal_propose',to:b.id,give:{gold:5},want:{crystals:2}});
 for(let i=0;i<6;i++){
   const d=state.deals[0],recipient=d.to;
   const response=act(state,recipient,{type:'deal_counter',dealId:d.id,give:{crystals:1},want:{gold:1}});
   assert.equal(response.events[0].type,'state');
   assert.equal(state.deals[0].depth,i+1);
 }
 const last=state.deals[0];
 const deny=act(state,last.to,{type:'deal_counter',dealId:last.id,give:{crystals:1},want:{gold:1}});
 assert.equal(deny.events[0].type,'notice');
 assert.equal(state.deals[0].id,last.id);
 const invalid=act(state,last.to,{type:'deal_propose',to:last.from,give:{gold:900},want:{crystals:1}});
 assert.equal(invalid.events[0].type,'notice');
});
test('Players cannot infer quota from public progress while game is live',()=>{
 const {state}=makeRoom(4);
 const view=game.viewForPlayer({state,player:{id:state.contestants[0].id}});
 assert.ok(view.you.quota.gold>0);
 for(const other of view.players){
   assert.equal('progress' in other,false);
   assert.equal('quota' in other,false);
   assert.equal('positiveTarget' in other,false);
   assert.equal(other.inventory.every(x=>!('positive' in x)&&!('negative' in x)),true);
 }
});
test('Counteroffer expires after full round and cannot be accepted in later round',()=>{
 const {state}=makeRoom(2),[a,b]=state.contestants;
 act(state,a.id,{type:'deal_propose',to:b.id,give:{gold:5},want:{parts:1}});
 const id=state.deals[0].id;
 for(let i=0;i<2;i++)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 assert.equal(state.round,2);assert.equal(state.deals.length,0);
 const rejected=act(state,b.id,{type:'deal_accept',dealId:id});
 assert.equal(rejected.events[0].type,'notice');
});


test('Every player gets one urgency challenge in each resource, with equal work-equivalent difficulty per wave',()=>{
 for(const size of [2,3,4,5,6]){
  const {state}=makeRoom(size);
  const byPlayer=new Map(state.contestants.map(p=>[p.id,[]]));
  let steps=0;
  while(state.phase==='play'&&steps++<80){
   const turn=state.contestants[state.turnIndex];
   if(turn.urgent?.status==='pending'){
     const card=turn.urgent.needs;
     const key=['gold','crystals','parts'].find(k=>card[k]>0);
     byPlayer.get(turn.id).push([state.round,key,card[key]]);
   }
   act(state,turn.id,{type:'end'});
  }
  assert.equal(state.phase,'done');
  const expected=[2,3,4];
  for(const cards of byPlayer.values()){
   assert.equal(cards.length,3);
   assert.deepEqual(cards.map(x=>x[0]),[3,6,9]);
   assert.equal(new Set(cards.map(x=>x[1])).size,3);
   for(let j=0;j<3;j++){
     const [,key,amount]=cards[j];
     assert.equal(amount,expected[j]*({gold:35,crystals:4,parts:1}[key]));
   }
  }
 }
});
test('Simulated 2–6 person complete matches preserve invariants through barter, auction and deadlines',()=>{
 const stats={matches:0,deals:0,auctions:0,contractsSuccess:0,contractsFailed:0,quotasMet:0,bankrupt:0,
   thresholds:{'50%':0,'60%':0,'70%':0,'80%':0,'90%':0,'100%':0},
   meanRatios:{gold:0,crystals:0,parts:0},players:0,bySize:{}};
 for(const size of [2,3,4,5,6]){
  for(let caseNo=0;caseNo<24;caseNo++){
   const {state}=makeRoom(size);let steps=0;
   while(state.phase==='play'){
     if(steps++>TOTAL_ROUNDS*size+5)throw Error('stalled match with '+size+' players');
     const owner=state.contestants[state.turnIndex],others=state.contestants.filter(p=>p.id!==owner.id&&!p.bankrupt);
     const urgent=owner.urgent?.status==='pending'?owner.urgent.needs:null;
     const short=urgent&&['gold','crystals','parts'].find(k=>owner.resources[k]<urgent[k]);
     const best=short||['gold','crystals','parts'].sort((a,b)=>
       owner.resources[a]/owner.quota[a]-owner.resources[b]/owner.quota[b])[0];
     if(!owner.bankrupt)act(state,owner.id,{type:'work',resource:best});
     if(others.length&&caseNo%3===0&&!owner.bankrupt){
       const counterparty=others[0];
       if(owner.resources.gold>=10&&counterparty.resources.crystals>=1){
         act(state,owner.id,{type:'deal_propose',to:counterparty.id,
           give:{gold:10},want:{crystals:1}});
         const deal=state.deals.find(d=>d.from===owner.id);
         if(deal){act(state,counterparty.id,{type:'deal_accept',dealId:deal.id});stats.deals++;}
       }
     }
     if(others.length&&caseNo%4===0&&!owner.bankrupt){
       const buyer=others.find(p=>p.items.length<4&&p.resources.gold>=18);
       const item=owner.items.find(i=>i.acquiredRound!==state.round);
       if(buyer&&item){
         act(state,owner.id,{type:'post',itemId:item.id,ask:{gold:20}});
         if(state.listing){
           act(state,buyer.id,{type:'bid',offer:{gold:18}});
           const result=act(state,owner.id,{type:'accept',buyer:buyer.id});
           if(result.events[0]?.type==='state')stats.auctions++;
         }
       }
     }
     act(state,owner.id,{type:'end'});
     for(const p of state.contestants){
       for(const key of ['gold','crystals','parts']){
         assert.ok(Number.isInteger(p.resources[key])&&p.resources[key]>=0&&p.resources[key]<=9999);
       }
       assert.ok(p.items.length<=4);
       assert.equal(new Set(p.items.map(i=>i.id)).size,p.items.length);
     }
     const allItems=state.contestants.flatMap(p=>p.items.map(i=>i.id));
     assert.equal(new Set(allItems).size,allItems.length);
   }
   assert.equal(state.phase,'done');
   assert.equal(state.ranking.length,size);
   for(const p of state.contestants){
     stats.contractsFailed+=p.strikes;
     stats.contractsSuccess+=3-p.strikes;
     stats.bankrupt+=Number(p.bankrupt);
     stats.players++;
     for(const key of ['gold','crystals','parts'])stats.meanRatios[key]+=p.resources[key]/p.quota[key];
     for(const pct of [50,60,70,80,90,100]){
       if(['gold','crystals','parts'].every(key=>p.resources[key]>=p.quota[key]*pct/100))
         stats.thresholds[pct+'%']++;
     }
     (stats.bySize[size]??={players:0,met:0}).players++;
     stats.bySize[size].met+=Number(['gold','crystals','parts'].every(key=>p.resources[key]>=p.quota[key]));
   }
   stats.quotasMet+=state.ranking.filter(p=>p.complete&&!p.bankrupt).length;
   stats.matches++;
  }
 }
 assert.equal(stats.matches,120);
 assert.ok(stats.deals>0&&stats.auctions>0);
 for(const key of ['gold','crystals','parts'])stats.meanRatios[key]=Math.round(stats.meanRatios[key]/stats.players*100)/100;
 console.log('Black Bazaar economy smoke simulation:',JSON.stringify(stats));
});
