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
function acceptOffer(state,buyer){return {type:'accept',buyer,bidId:state.bids.find(b=>b.buyer===buyer)?.id};}
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
 const cost=game.viewForPlayer({state,player:{id:buyer.id}}).you.inspectionPrices.public;
 act(state,buyer.id,{type:'inspect'});
 assert.equal(buyer.resources.gold,before-cost);
 assert.equal(buyer.inspections[0].itemId,item.id);
 act(state,buyer.id,{type:'bid',offer:{gold:65,crystals:1,parts:0}});
 assert.equal(state.bids.length,1);
 const sellerBefore=seller.resources.gold;
 act(state,seller.id,acceptOffer(state,buyer.id));
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
 act(state,a.id,acceptOffer(state,b.id));
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
 // Ensure this test exercises negotiation rather than a random empty wallet.
 onDuty.resources.gold=Math.max(10,onDuty.resources.gold);
 friend.resources.crystals=Math.max(10,friend.resources.crystals);
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
 const stats={matches:0,deals:0,auctions:0,brokerBought:0,salvaged:0,contractsSuccess:0,contractsFailed:0,quotasMet:0,bankrupt:0,
   thresholds:{'50%':0,'60%':0,'70%':0,'80%':0,'90%':0,'100%':0},
   alternatives:{'gold100_crystal85_parts60':0,'gold95_crystal85_parts60':0,
     'gold100_crystal85_parts50':0,'gold90_crystal80_parts50':0},
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
     // Mixed bot policies exercise market supply and destruction, without asserting that these bots play optimally.
     if(!owner.bankrupt&&caseNo%4===1&&owner.resources.gold>=150&&owner.items.length<4&&state.brokerOffer){
       const result=act(state,owner.id,{type:'broker_buy'});
       if(result.events[0]?.type==='state')stats.brokerBought++;
     }
     if(!owner.bankrupt&&caseNo%4===2&&owner.resources.parts<5&&owner.items.length>1){
       const item=owner.items.find(i=>i.acquiredRound!==state.round);
       if(item){
         const result=act(state,owner.id,{type:'salvage',itemId:item.id});
         if(result.events[0]?.type==='state')stats.salvaged++;
       }
     }
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
           const result=act(state,owner.id,acceptOffer(state,buyer.id));
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
     for(const [scenario,g,c,r] of [
       ['gold100_crystal85_parts60',1,.85,.6],
       ['gold95_crystal85_parts60',.95,.85,.6],
       ['gold100_crystal85_parts50',1,.85,.5],
       ['gold90_crystal80_parts50',.9,.8,.5]
     ])if(p.resources.gold>=p.quota.gold*g&&p.resources.crystals>=p.quota.crystals*c&&p.resources.parts>=p.quota.parts*r)
       stats.alternatives[scenario]++;
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


test('Broker generates one sealed offer per turn, and new owner sees secret properties',()=>{
 const {state}=makeRoom(2);const first=state.contestants[state.turnIndex];
 const offer=state.brokerOffer;
 assert.ok(offer&&offer.id);
 const before=first.resources.gold;
 const masked=game.viewForPlayer({state,player:{id:first.id}}).broker;
 assert.equal(masked.id,offer.id);
 assert.equal('positive' in masked,false);
 assert.equal('negative' in masked,false);
 const bought=act(state,first.id,{type:'broker_buy'});
 assert.equal(bought.events[0].type,'state');
 assert.equal(first.resources.gold,before-75);
 assert.equal(state.brokerOffer,null);
 const full=game.viewForPlayer({state,player:{id:first.id}}).you.items.find(i=>i.id===offer.id);
 assert.ok(full.positive&&full.negative);
 assert.equal(full.acquiredRound,state.round);
 const repeated=act(state,first.id,{type:'broker_buy'});
 assert.equal(repeated.events[0].type,'notice');
 const cannotList=act(state,first.id,{type:'post',itemId:offer.id,ask:{gold:75}});
 assert.equal(cannotList.events[0].type,'notice');
 act(state,first.id,{type:'end'});
 assert.ok(state.brokerOffer?.id!==offer.id);
});
test('Dismantling yields parts but burns an item and a pawnshop slot',()=>{
 const {state}=makeRoom(2);const first=state.contestants[state.turnIndex];
 const id=first.items[0].id,prev=first.resources.parts,prevLen=first.items.length;
 const out=act(state,first.id,{type:'salvage',itemId:id});
 assert.equal(out.events[0].type,'state');
 assert.equal(first.items.length,prevLen-1);
 assert.equal(first.resources.parts,prev+2);
 assert.equal(first.usedPawn,true);
 assert.equal(first.items.some(i=>i.id===id),false);
 const reused=act(state,first.id,{type:'exchange',mode:'buy_parts'});
 assert.equal(reused.events[0].type,'notice');
 const again=act(state,first.id,{type:'salvage',itemId:first.items[0].id});
 assert.equal(again.events[0].type,'notice');
});
test('Broker cannot overdraft wallets or exceed four inventory slots',()=>{
 const {state}=makeRoom(2),current=state.contestants[state.turnIndex];
 const offer=state.brokerOffer;
 current.resources.gold=74;
 const low=act(state,current.id,{type:'broker_buy'});
 assert.equal(low.events[0].type,'notice');
 assert.equal(state.brokerOffer.id,offer.id);
 current.resources.gold=300;
 current.items.push({...current.items[0],id:'item-99997'});
 current.items.push({...current.items[0],id:'item-99998'});
 assert.equal(current.items.length,4);
 const full=act(state,current.id,{type:'broker_buy'});
 assert.equal(full.events[0].type,'notice');
 assert.equal(state.brokerOffer.id,offer.id);
 assert.equal(current.resources.gold,300);
});


test('Personal quota variants have comparable work-equivalent effort and distinct priorities',()=>{
 const {state}=makeRoom(6);
 const efforts=state.contestants.map(p=>
   (p.quota.gold-250)/35+(p.quota.crystals-20)/4+(p.quota.parts-3));
 const spread=Math.max(...efforts)-Math.min(...efforts);
 assert.ok(spread<1,'Work-equivalent quota spread: '+spread);
 assert.ok(new Set(state.contestants.map(p=>p.quota.parts)).size>=3);
 assert.ok(new Set(state.contestants.map(p=>p.quota.gold)).size===6);
});


test('First successful public sale awards only one part to the seller per turn',()=>{
 const {state}=makeRoom(3),[seller,buyer1,buyer2]=state.contestants;
 const ids=seller.items.map(i=>i.id),before=seller.resources.parts;
 for(const [index,buyer] of [buyer1,buyer2].entries()){
   act(state,seller.id,{type:'post',itemId:ids[index],ask:{gold:30}});
   act(state,buyer.id,{type:'bid',offer:{gold:30}});
   const accepted=act(state,seller.id,acceptOffer(state,buyer.id));
   assert.equal(accepted.events[0].type,'state');
 }
 assert.equal(seller.marketDeals,2);
 assert.equal(seller.resources.parts,before+1);
 act(state,seller.id,{type:'end'});
 // A new seller will separately earn its first-sale part on the next turn.
 assert.equal(state.contestants[state.turnIndex].marketDeals,0);
});


test('Anonymous black market only runs in rounds 2, 5 and 8; secrets survive different views',()=>{
 const {state}=makeRoom(4);
 const [seller,buyer,stranger]=state.contestants;
 const early=act(state,seller.id,{type:'black_post',itemId:seller.items[0].id,ask:{gold:50}});
 assert.equal(early.events[0].type,'notice');
 while(state.round<2){const turn=state.contestants[state.turnIndex];act(state,turn.id,{type:'end'});}
 const item=seller.items[0];
 act(state,seller.id,{type:'black_post',itemId:item.id,ask:{gold:60}});
 assert.equal(state.blackLots.length,1);
 assert.equal(seller.items.some(i=>i.id===item.id),false);
 const lot=state.blackLots[0], seen=game.viewForPlayer({state,player:{id:stranger.id}});
 assert.equal(seen.blackMarket,true);
 assert.equal(seen.blackLots[0].mine,false);
 assert.equal('seller' in seen.blackLots[0],false);
 assert.equal('buyer' in seen.blackLots[0],false);
 assert.equal(seen.players.find(p=>p.id===seller.id).resources,null);
 assert.equal(seen.players.find(p=>p.id===seller.id).inventory.length,0);
 const sellerView=game.viewForPlayer({state,player:{id:seller.id}});
 assert.equal(sellerView.blackLots[0].mine,true);
 assert.equal(sellerView.you.escrowItems[0].id,item.id);
 assert.ok(sellerView.you.escrowItems[0].positive);
 const buyerView=game.viewForPlayer({state,player:{id:buyer.id}});
 assert.equal(buyerView.blackLots[0].myBid,null);
});
test('Black market sealed bid can be inspected, accepted and processed exactly once',()=>{
 const {state}=makeRoom(3);
 while(state.round<2)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 const [seller,buyer]=state.contestants;
 const item=seller.items[0],before=seller.resources.gold;
 buyer.resources.gold=400;
 // Black-market inspection is discounted when the buyer owns a market lens.
 const inspectionFee=game.viewForPlayer({state,player:{id:buyer.id}}).you.inspectionPrices.black;
 act(state,seller.id,{type:'black_post',itemId:item.id,ask:{gold:100}});
 const lot=state.blackLots[0];
 const info=act(state,buyer.id,{type:'black_inspect',lotId:lot.id});
 assert.equal(info.events[0].type,'state');
 assert.equal(buyer.resources.gold,400-inspectionFee);
 assert.equal(game.viewForPlayer({state,player:{id:buyer.id}}).blackLots[0].inspection.originalName,specName(item));
 act(state,buyer.id,{type:'black_bid',lotId:lot.id,offer:{gold:90}});
 const visible=game.viewForPlayer({state,player:{id:seller.id}});
 const bid=visible.blackLots[0].bids[0];
 assert.equal('buyer' in bid,false);
 assert.equal(bid.offer.gold,90);
 const stranger=game.viewForPlayer({state,player:{id:state.contestants[2].id}});
 assert.equal(stranger.blackLots[0].bids.length,0);
 const ok=act(state,seller.id,{type:'black_accept',lotId:lot.id,bidId:bid.id});
 assert.equal(ok.events[0].type,'state');
 assert.equal(state.blackLots.length,0);
 assert.ok(buyer.items.some(i=>i.id===item.id));
 assert.equal(buyer.items.find(i=>i.id===item.id).history.at(-1),'Анонимный рынок');
 assert.equal(seller.resources.gold,before+81);
 assert.equal(buyer.resources.gold,400-inspectionFee-90-(seller.negativeTarget===buyer.id?20:0));
 assert.equal(game.viewForPlayer({state,player:{id:buyer.id}}).you.items.some(i=>i.id===item.id&&!!i.positive),true);
 const repeat=act(state,seller.id,{type:'black_accept',lotId:lot.id,bidId:bid.id});
 assert.equal(repeat.events[0].type,'notice');
});

test('Black market unsold escrow returns after round and cannot be posted twice',()=>{
 const {state}=makeRoom(2);
 while(state.round<2)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 const seller=state.contestants[0],item=seller.items[0];
 act(state,seller.id,{type:'black_post',itemId:item.id,ask:{crystals:20}});
 const lot=state.blackLots[0],repeat=act(state,seller.id,{type:'black_post',itemId:seller.items[0].id,ask:{gold:1}});
 assert.equal(repeat.events[0].type,'notice');
 const retract=act(state,seller.id,{type:'black_cancel',lotId:lot.id});
 assert.equal(retract.events[0].type,'state');
 assert.ok(seller.items.some(i=>i.id===item.id));
 const again=act(state,seller.id,{type:'black_post',itemId:item.id,ask:{gold:2}});
 assert.equal(again.events[0].type,'notice');
 while(state.round===2)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 assert.equal(state.blackLots.length,0);
 assert.ok(seller.items.some(i=>i.id===item.id));
 assert.equal(seller.items.length,2);
});
test('Repack preserves real effect and original item identity; paid market inspection unmasks name',()=>{
 const {state}=makeRoom(3); const owner=state.contestants[0];
 const item=owner.items[0],id=item.id,positive=item.variant,gold=owner.resources.gold,parts=owner.resources.parts;
 const result=act(state,owner.id,{type:'repack',itemId:id,aliasIndex:0});
 assert.equal(result.events[0].type,'state');
 assert.equal(item.alias,'Талисман достатка');
 assert.equal(item.variant,positive);assert.equal(item.id,id);
 assert.equal(owner.resources.gold,gold-20);assert.equal(owner.resources.parts,parts-1);
 assert.equal(game.viewForPlayer({state,player:{id:owner.id}}).you.items.find(i=>i.id===id).originalName!==item.alias,true);
 const invalid=act(state,owner.id,{type:'repack',itemId:id,aliasIndex:999});
 assert.equal(invalid.events[0].type,'notice');
 while(state.round<2)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 act(state,owner.id,{type:'black_post',itemId:id,ask:{gold:70}});
 const l=state.blackLots[0];
 const outsider=state.contestants[1];
 act(state,outsider.id,{type:'black_inspect',lotId:l.id});
 const actual=game.viewForPlayer({state,player:{id:outsider.id}}).blackLots[0].inspection;
 assert.ok(actual.originalName&&actual.originalName!==item.alias);
 assert.ok(actual.negative);
});
function specName(item){
 // Tests deliberately avoid importing a private helper: derive the true visible
 // original from the owner's item before escrow.
 const names={frog:'Золотая жаба',pig:'Жадная копилка',spider:'Паук-механик',crown:'Корона должника',
   mimic:'Сундук-мимик',cat:'Кот неудачи',mirror:'Зеркало зависти',gear:'Медная шестерня',lens:'Око рынка',
   mushroom:'Гриб прибыли',hourglass:'Песочные часы',amulet:'Амулет расчёта'};
 return names[item.key];
}


test('Escrow reserves a full inventory slot; black-market bid cannot exceed inventory capacity',()=>{
 const {state}=makeRoom(3);
 while(state.round<2)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 const [seller,buyer]=state.contestants;
 const item=seller.items[0];
 act(state,seller.id,{type:'black_post',itemId:item.id,ask:{gold:55}});
 // Buyer has two originals; fill two more, still respecting unique inventory IDs.
 buyer.items.push({...buyer.items[0],id:'item-99001'},{...buyer.items[0],id:'item-99002'});
 buyer.resources.gold=400;
 const lot=state.blackLots[0],bid=act(state,buyer.id,{type:'black_bid',lotId:lot.id,offer:{gold:60}});
 assert.equal(bid.events[0].type,'notice');
 const projected=game.viewForPlayer({state,player:{id:seller.id}});
 assert.equal(projected.blackLots[0].item.id,undefined,'real item IDs must not leak');
});
test('Escrow seller cannot buy extra inventory and unsold lot returns without slot overflow',()=>{
 const {state}=makeRoom(2);
 while(state.round<2)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 const owner=state.contestants[0];
 owner.items.push({...owner.items[0],id:'item-90002'},{...owner.items[0],id:'item-90003'});
 assert.equal(owner.items.length,4);
 act(state,owner.id,{type:'black_post',itemId:owner.items[0].id,ask:{gold:60}});
 assert.equal(owner.items.length,3);
 owner.resources.gold=500;
 while(state.contestants[state.turnIndex].id!==owner.id)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 const fail=act(state,owner.id,{type:'broker_buy'});
 assert.equal(fail.events[0].type,'notice');
 while(state.round===2)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 assert.equal(owner.items.length,4);
});
test('Server authoritative deadline skips stalled players without spending their late commands',()=>{
 const {state}=makeRoom(3);
 const active=state.contestants[state.turnIndex],before=active.resources.gold;
 assert.ok(state.deadlineAt>Date.now());
 // Another connected participant may drive the check without the active player.
 state.deadlineAt=Date.now()-1;
 const bystander=state.contestants[1];
 const res=act(state,bystander.id,{type:'tick'});
 assert.equal(res.events[0].type,'state');
 assert.equal(state.turnIndex,1);
 assert.equal(active.resources.gold,before);
 assert.ok(state.deadlineAt>Date.now());
 const noChange=act(state,bystander.id,{type:'tick'});
 assert.equal(noChange.events.length,0);
 const next=state.contestants[state.turnIndex],turn=state.turnIndex;
 state.deadlineAt=Date.now()-1;
 const sent=act(state,next.id,{type:'work',resource:'gold'});
 assert.equal(sent.events[0].type,'state');
 assert.notEqual(state.turnIndex,turn);
 assert.equal(next.worked,false,'the expired action was not executed');
});
test('Leaving during market escrow returns the seller item and removes stranded offers',()=>{
 const {state}=makeRoom(3);
 while(state.round<2)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 const leaving=state.contestants[1],owned=leaving.items[0],remaining=state.players.filter(p=>p.id!==leaving.id);
 act(state,leaving.id,{type:'black_post',itemId:owned.id,ask:{gold:45}});
 assert.equal(state.blackLots.length,1);
 game.onLeave({state,player:{id:leaving.id},players:remaining});
 assert.equal(state.blackLots.length,0);
 assert.equal(leaving.items.some(i=>i.id===owned.id),true);
 assert.equal(leaving.bankrupt,true);
});


function forceArtifact(item,key){
 item.key=key;item.variant=0;
 if(key==='frog'||key==='hourglass'){
  item.curseDueRound=3;item.curseResolved=false;
 }else{
  delete item.curseDueRound;delete item.curseResolved;
 }
 if(key==='amulet')item.wardCharges=1;
 return item;
}

test('Delayed curse follows the physical frog across public trading and activates once',()=>{
 const {state}=makeRoom(2);
 const [seller,buyer]=state.contestants;
 const cursed=forceArtifact(seller.items[0],'frog');
 seller.items=[cursed];buyer.items=[];
 act(state,seller.id,{type:'post',itemId:cursed.id,ask:{gold:15}});
 act(state,buyer.id,{type:'bid',offer:{gold:15}});
 const sold=act(state,seller.id,acceptOffer(state,buyer.id));
 assert.equal(sold.events[0].type,'state');
 assert.equal(buyer.items[0].curseDueRound,3);
 assert.equal(buyer.items[0].curseResolved,false);
 const first=game.viewForPlayer({state,player:{id:buyer.id}}).you.items[0];
 assert.equal(first.special.kind,'curse');
 assert.equal(first.special.dueRound,3);
 const other=game.viewForPlayer({state,player:{id:seller.id}}).players.find(p=>p.id===buyer.id).inventory[0];
 assert.equal('special' in other,false);
 while(state.round<3)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 buyer.resources.gold=1000;
 // Suppress unrelated urgent contracts: isolate delayed upkeep math.
 // Round 3 upkeep: -18% (180), delayed curse then -30% (246).
 while(state.round===3){
   const current=state.contestants[state.turnIndex];current.urgent=null;
   act(state,current.id,{type:'end'});
 }
 assert.equal(buyer.resources.gold,574);
 assert.equal(cursed.curseResolved,true);
 const resolved=game.viewForPlayer({state,player:{id:buyer.id}}).you.items.find(i=>i.id===cursed.id);
 assert.equal(resolved.special.resolved,true);
 buyer.resources.gold=1000;
 while(state.round===4)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 assert.equal(buyer.resources.gold,820,'curse must never fire twice');
});
test('Hourglass curse persists through black escrow, transfers to buyer, then consumes two parts once',()=>{
 const {state}=makeRoom(2);
 const [seller,buyer]=state.contestants;
 const hourglass=forceArtifact(seller.items[0],'hourglass');
 hourglass.curseDueRound=2;
 seller.items=[hourglass];buyer.items=[];
 while(state.round<2)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 act(state,seller.id,{type:'black_post',itemId:hourglass.id,ask:{gold:5}});
 const lot=state.blackLots[0];
 const inspect=act(state,buyer.id,{type:'black_inspect',lotId:lot.id});
 assert.equal(inspect.events[0].type,'state');
 const info=game.viewForPlayer({state,player:{id:buyer.id}}).blackLots[0].inspection;
 assert.equal(info.curse.dueRound,2);
 act(state,buyer.id,{type:'black_bid',lotId:lot.id,offer:{gold:5}});
 const bid=state.blackLots[0].bids[0];
 act(state,seller.id,{type:'black_accept',lotId:lot.id,bidId:bid.id});
 assert.ok(buyer.items.some(i=>i.id===hourglass.id));
 buyer.resources.parts=10;
 while(state.round===2)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 // Hourglass upkeep: -6 crystals, delayed one-time -2 parts.
 assert.equal(buyer.resources.parts,8);
 assert.equal(hourglass.curseResolved,true);
 buyer.resources.parts=10;
 while(state.round===3){
   const current=state.contestants[state.turnIndex];current.urgent=null;
   act(state,current.id,{type:'end'});
 }
 assert.equal(buyer.resources.parts,10);
});
test('One-use amulet prevents failed urgent order once and keeps spent state across rounds',()=>{
 const {state}=makeRoom(2);const protectedPlayer=state.contestants[0];
 protectedPlayer.items=[forceArtifact(protectedPlayer.items[0],'amulet')];
 while(state.round<3)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 protectedPlayer.resources={gold:0,crystals:0,parts:0};
 protectedPlayer.urgent={needs:{gold:100,crystals:0,parts:0},status:'pending'};
 act(state,protectedPlayer.id,{type:'end'});
 assert.equal(protectedPlayer.strikes,0);
 assert.equal(protectedPlayer.urgent.status,'shielded');
 assert.equal(protectedPlayer.items[0].wardCharges,0);
 assert.equal(game.viewForPlayer({state,player:{id:protectedPlayer.id}}).you.items[0].special.charges,0);
 while(state.round<6)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 protectedPlayer.resources={gold:0,crystals:0,parts:0};
 protectedPlayer.urgent={needs:{gold:100,crystals:0,parts:0},status:'pending'};
 act(state,protectedPlayer.id,{type:'end'});
 assert.equal(protectedPlayer.strikes,1);
 assert.equal(protectedPlayer.urgent.status,'failed');
});
test('Mirror bonus triggers for completed sales only and does not mint repeatedly in one round',()=>{
 const {state}=makeRoom(3);const [seller,buyer,other]=state.contestants;
 const mirror=forceArtifact(seller.items[0],'mirror');
 seller.items=[mirror];buyer.items=[];other.items=[];
 const start=seller.resources.crystals;
 act(state,seller.id,{type:'post',itemId:mirror.id,ask:{gold:10}});
 act(state,buyer.id,{type:'bid',offer:{gold:10}});
 act(state,seller.id,acceptOffer(state,buyer.id));
 assert.equal(seller.resources.crystals,start+3);
 assert.equal(mirror.tradeUsedRound,1);
 // The item can't be resold in the same round.
 const invalid=act(state,buyer.id,{type:'deal_propose',to:other.id,giveItemId:mirror.id,give:{},want:{gold:1}});
 assert.equal(invalid.events[0].type,'notice');
 while(state.round<2)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 const before=buyer.resources.crystals;
 act(state,buyer.id,{type:'deal_propose',to:other.id,giveItemId:mirror.id,give:{},want:{gold:8}});
 const offer=state.deals.find(d=>d.from===buyer.id);
 assert.ok(offer);
 act(state,other.id,{type:'deal_accept',dealId:offer.id});
 assert.equal(buyer.resources.crystals,before+3);
 assert.equal(mirror.tradeUsedRound,2);
});
test('Market lens discounts both forms of inspection, with private prices',()=>{
 const {state}=makeRoom(3);const [seller,buyer]=state.contestants;
 // No accidental lens on the other player: this test isolates exact prices.
 seller.items.forEach(item=>{item.key='pig';item.variant=1;});
 const lens=forceArtifact(buyer.items[0],'lens');
 const item=seller.items[0];
 const personal=game.viewForPlayer({state,player:{id:buyer.id}});
 assert.deepEqual(personal.you.inspectionPrices,{public:8,black:15});
 assert.deepEqual(game.viewForPlayer({state,player:{id:seller.id}}).you.inspectionPrices,{public:15,black:25});
 act(state,seller.id,{type:'post',itemId:item.id,ask:{gold:20}});
 const before=buyer.resources.gold;
 act(state,buyer.id,{type:'inspect'});
 assert.equal(buyer.resources.gold,before-8);
 while(state.round<2)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 act(state,seller.id,{type:'black_post',itemId:item.id,ask:{gold:20}});
 const lot=state.blackLots[0],again=buyer.resources.gold;
 const inspection=act(state,buyer.id,{type:'black_inspect',lotId:lot.id});
 assert.equal(inspection.events[0].type,'state');
 assert.equal(buyer.resources.gold,again-15);
});


test('Anonymous echo bonus credits the seller without leaking their identity to the public journal',()=>{
 const {state}=makeRoom(3);
 while(state.round<2)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 const [seller,buyer]=state.contestants;
 const mirror=forceArtifact(seller.items[0],'mirror');
 const original=seller.resources.crystals;
 buyer.resources.gold=400;
 act(state,seller.id,{type:'black_post',itemId:mirror.id,ask:{gold:30}});
 const lot=state.blackLots[0];
 act(state,buyer.id,{type:'black_bid',lotId:lot.id,offer:{gold:30}});
 const bid=state.blackLots[0].bids[0];
 const sale=act(state,seller.id,{type:'black_accept',lotId:lot.id,bidId:bid.id});
 assert.equal(sale.events[0].type,'state');
 assert.equal(seller.resources.crystals,original+3);
 assert.equal(mirror.tradeUsedRound,2);
 assert.equal(state.log.some(message=>message.includes('Эхо перепродажи')&&message.includes(seller.character)),false);
});


test('Economic events in rounds 4/5/6/8 are identical for all players',()=>{
 for(const seats of [2,3,4,5,6]){
  const {state}=makeRoom(seats);
  assert.equal(Object.keys(state.eventSchedule).join(','),'4,5,6,8');
  assert.equal(state.eventSchedule[5],'shadow_fair');
  assert.deepEqual(new Set([state.eventSchedule[4],state.eventSchedule[6]]),
    new Set(['salvage_boom','mask_festival']));
  assert.ok(['smuggler_holiday','audit_fair'].includes(state.eventSchedule[8]));
  for(let i=0;i<seats;i++){
   const view=game.viewForPlayer({state,player:{id:state.contestants[i].id}});
   assert.equal(view.event,null);
   assert.equal('eventSchedule' in view,false,'future events must not leak before announced');
  }
  let guard=0;
  while(state.phase==='play'&&guard++<100){
   const turn=state.contestants[state.turnIndex];
   const event=game.viewForPlayer({state,player:{id:turn.id}}).event;
   if([4,5,6,8].includes(state.round)){
     assert.equal(event.id,state.eventSchedule[state.round]);
     for(const p of state.contestants){
       assert.deepEqual(game.viewForPlayer({state,player:{id:p.id}}).event,event);
     }
   }else assert.equal(event,null);
   act(state,turn.id,{type:'end'});
  }
  assert.equal(state.phase,'done');
  assert.ok(guard<=100);
  const report=game.viewForPlayer({state,player:{id:state.contestants[0].id}}).report;
  assert.deepEqual(report.events,state.eventSchedule);
 }
});

test('Salvage boom yields three actual parts; event changes only live eligible round',()=>{
 const {state}=makeRoom(2);
 state.eventSchedule={4:'salvage_boom',6:'mask_festival',8:'smuggler_holiday'};
 while(state.round<4)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 const player=state.contestants[state.turnIndex],item=player.items[0];
 player.resources.parts=10;
 assert.equal(game.viewForPlayer({state,player:{id:player.id}}).salvageParts,3);
 const result=act(state,player.id,{type:'salvage',itemId:item.id});
 assert.equal(result.events[0].type,'state');
 assert.equal(player.resources.parts,13);
 assert.equal(state.metrics.salvage,1);
 const rejected=act(state,player.id,{type:'salvage',itemId:player.items[0]?.id});
 assert.equal(rejected.events[0].type,'notice');
 while(state.round===4)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 assert.equal(game.viewForPlayer({state,player:{id:player.id}}).salvageParts,2);
});

test('Mask festival removes the parts cost for repackaging but consumes ten gold',()=>{
 const {state}=makeRoom(2);
 state.eventSchedule={4:'salvage_boom',6:'mask_festival',8:'smuggler_holiday'};
 while(state.round<6)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 const actor=state.contestants[state.turnIndex],item=actor.items[0];
 actor.resources.gold=30;actor.resources.parts=0;
 assert.deepEqual(game.viewForPlayer({state,player:{id:actor.id}}).repackCost,{gold:10,parts:0});
 const ok=act(state,actor.id,{type:'repack',itemId:item.id,aliasIndex:2});
 assert.equal(ok.events[0].type,'state');
 assert.equal(actor.resources.gold,20);
 assert.equal(actor.resources.parts,0);
 assert.equal(item.alias,'Тёмная реликвия');
 assert.equal(state.metrics.repack,1);
});

test('Contraband event applies reduced exact fee, without revealing the anonymous seller',()=>{
 const {state}=makeRoom(3);
 state.eventSchedule={4:'salvage_boom',6:'mask_festival',8:'smuggler_holiday'};
 while(state.round<8)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 const [seller,buyer]=state.contestants;
 seller.items=[{id:'item-9991',key:'pig',variant:1,acquiredRound:1,history:[]}];
 buyer.items=[];seller.resources={gold:0,crystals:0,parts:0};
 buyer.resources.gold=300;
 assert.equal(game.viewForPlayer({state,player:{id:buyer.id}}).marketFeePercent,5);
 act(state,seller.id,{type:'black_post',itemId:'item-9991',ask:{gold:100}});
 const lot=state.blackLots[0];
 act(state,buyer.id,{type:'black_bid',lotId:lot.id,offer:{gold:100}});
 const accepted=act(state,seller.id,{type:'black_accept',lotId:lot.id,bidId:state.blackLots[0].bids[0].id});
 assert.equal(accepted.events[0].type,'state');
 assert.equal(seller.resources.gold,95);
 assert.equal(state.metrics.blackSales,1);
 assert.equal(game.viewForPlayer({state,player:{id:buyer.id}}).blackLots.length,0);
 assert.equal(state.log.some(message=>message.includes('5% комиссии')),true);
});

test('Expert fair halves actual costs, with lens discount applied before halving',()=>{
 const {state}=makeRoom(3);
 state.eventSchedule={4:'salvage_boom',6:'mask_festival',8:'audit_fair'};
 while(state.round<8)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 const [seller,buyer,ordinary]=state.contestants;
 seller.items=[{id:'item-9992',key:'pig',variant:1,acquiredRound:1,history:[]}];
 buyer.items=[{id:'item-9993',key:'lens',variant:0,acquiredRound:1,history:[]}];
 ordinary.items=[];
 buyer.resources.gold=100;ordinary.resources.gold=100;
 assert.deepEqual(game.viewForPlayer({state,player:{id:buyer.id}}).you.inspectionPrices,{public:4,black:8});
 assert.deepEqual(game.viewForPlayer({state,player:{id:ordinary.id}}).you.inspectionPrices,{public:8,black:13});
 act(state,seller.id,{type:'black_post',itemId:'item-9992',ask:{gold:12}});
 const lot=state.blackLots[0];
 act(state,buyer.id,{type:'black_inspect',lotId:lot.id});
 act(state,ordinary.id,{type:'black_inspect',lotId:lot.id});
 assert.equal(buyer.resources.gold,92);
 assert.equal(ordinary.resources.gold,87);
 assert.equal(state.metrics.inspections,2);
});

test('Final playtest metrics reflect only successful operations and hide live totals',()=>{
 const {state}=makeRoom(4);
 const [seller,buyer]=state.contestants;
 assert.equal(game.viewForPlayer({state,player:{id:seller.id}}).report,null);
 const item=seller.items[0];
 act(state,seller.id,{type:'post',itemId:item.id,ask:{gold:20}});
 const bogus=act(state,buyer.id,{type:'bid',offer:{gold:1000000}});
 assert.equal(bogus.events[0].type,'notice');
 assert.equal(state.metrics.publicSales,0);
 act(state,buyer.id,{type:'bid',offer:{gold:20}});
 act(state,seller.id,acceptOffer(state,buyer.id));
 assert.equal(state.metrics.publicSales,1);
 let limit=0;
 while(state.phase==='play'&&limit++<50){
  const p=state.contestants[state.turnIndex];
  act(state,p.id,{type:'end'});
 }
 assert.equal(state.phase,'done');
 const publicReport=game.viewForPlayer({state,player:{id:buyer.id}}).report;
 assert.equal(publicReport.publicSales,1);
 assert.equal(publicReport.privateDeals,0);
 assert.equal(publicReport.blackSales,0);
 assert.ok(publicReport.urgentMet+publicReport.urgentMissed+publicReport.wardUsed<=12);
});

test('Independent four-player client projections converge after complete simulated online game',()=>{
 const {state}=makeRoom(4);
 const names=state.contestants.map(p=>p.id);
 const snapshots=id=>game.viewForPlayer({state,player:{id}});
 const getFull=()=>names.map(snapshots);
 const views=getFull();
 assert.ok(views.every(v=>v.phase==='play'&&v.players.length===4));
 assert.equal(new Set(views.map(v=>v.you.id)).size,4);
 assert.equal(views.every(v=>v.players.every(x=>!('quota' in x))),true);
 let steps=0;
 while(state.phase==='play'&&steps++<45){
  const actor=state.contestants[state.turnIndex];
  // Model each connected client as a distinct network receiver and actor.
  const before=getFull();
  const round=state.round,revision=state.revision;
  if(!actor.bankrupt)act(state,actor.id,{type:'work',resource:'gold'});
  act(state,actor.id,{type:'end'});
  const after=getFull();
  assert.ok(state.revision>revision);
  assert.ok(after.every(v=>v.round>=round&&v.revision===state.revision));
  for(const view of after)assert.equal(view.players.some(x=>'quota' in x),false);
  for(const view of before)assert.equal(view.you.items.every(x=>'positive' in x),true);
 }
 assert.equal(state.phase,'done');
 const done=getFull();
 assert.ok(done.every(v=>JSON.stringify(v.ranking)===JSON.stringify(done[0].ranking)));
 assert.ok(done.every(v=>JSON.stringify(v.report)===JSON.stringify(done[0].report)));
 assert.equal(done[0].ranking.length,4);
});


// -----------------------------------------------------------------------------
// PRE-RELEASE AUTOMATED QA — no human testers and no visual-design dependency.
// These tests exercise the exact PocketNet module API used by real clients.
// The real browser/socket/worker environment is covered separately by CI.
// -----------------------------------------------------------------------------
const QA_RESOURCES=['gold','crystals','parts'];
const qaEmpty=()=>({gold:0,crystals:0,parts:0});
function qaAssets(s){
 const pocket=s.contestants.flatMap(p=>p.items.map(i=>({id:i.id,owner:p.id})));
 const escrow=(s.blackLots||[]).map(l=>({id:l.item.id,owner:l.seller,escrow:true}));
 return [...pocket,...escrow];
}
function qaValidate(s,label){
 assert.ok(['play','done'].includes(s.phase),label+' phase');
 assert.ok(Number.isInteger(s.revision)&&s.revision>=1,label+' revision');
 assert.ok(s.log.length<=18,label+' bounded event log');
 assert.equal(JSON.stringify(JSON.parse(JSON.stringify(s))),JSON.stringify(s),label+' JSON serialization');
 const assets=qaAssets(s),itemIds=assets.map(x=>x.id);
 assert.equal(itemIds.length,new Set(itemIds).size,label+' duplicate owned/escrow items');
 for(const p of s.contestants){
  for(const key of QA_RESOURCES){
   assert.ok(Number.isSafeInteger(p.resources[key])&&p.resources[key]>=0&&p.resources[key]<=9999,
     label+' invalid '+key+' wallet for '+p.id+': '+p.resources[key]);
  }
  assert.ok(assets.filter(x=>x.owner===p.id).length<=4,label+' escrow capacity for '+p.id);
  assert.ok(p.items.every(i=>i.acquiredRound<=s.round),label+' future item acquisition');
  assert.ok(Number.isInteger(p.strikes)&&p.strikes>=0&&p.strikes<=3,label+' strikes');
 }
 if(s.phase==='play'){
  assert.ok(s.round>=1&&s.round<=9,label+' round');
  assert.ok(s.turnIndex>=0&&s.turnIndex<s.contestants.length,label+' seat');
  assert.ok(s.deadlineAt>Date.now()-60_000,label+' stale deadline');
  const a=s.contestants[s.turnIndex];
  assert.ok(!a.bankrupt,label+' active bankrupt seat');
  assert.ok(s.blackLots.every(l=>l.round===s.round&&[2,5,8].includes(s.round)),label+' market wave leak');
  assert.equal(s.eventSchedule[4]===s.eventSchedule[6],false,label+' duplicated event');
 }else{
  assert.equal(s.ranking.length,s.contestants.length,label+' final ranking');
  assert.deepEqual(s.ranking.map(x=>x.place),Array.from({length:s.contestants.length},(_,i)=>i+1));
  assert.equal(new Set(s.ranking.map(x=>x.id)).size,s.contestants.length,label+' duplicate rank');
  assert.equal(s.blackLots.length,0,label+' incomplete escrow cleanup');
 }
}
function qaOffer(s,actor,target){
 const resource=QA_RESOURCES[(s.round+actor.items.length)%3];
 const offer=qaEmpty();offer[resource]=1;
 if(actor.resources[resource]<1)return false;
 act(s,actor.id,{type:'deal_propose',to:target.id,give:offer,want:qaEmpty()});
 const deal=s.deals.find(d=>d.from===actor.id&&d.to===target.id);
 if(!deal)return false;
 const accepted=act(s,target.id,{type:'deal_accept',dealId:deal.id});
 return accepted.events[0]?.type==='state';
}
function qaAutoplay(size,run,stats){
 const {state}=makeRoom(size);
 let turns=0,actions=0;
 const maxTurns=9*size+6;
 while(state.phase==='play'){
  assert.ok(++turns<=maxTurns,'stalled match size '+size+' run '+run);
  const actor=state.contestants[state.turnIndex];
  const other=state.contestants.filter(p=>p.id!==actor.id&&!p.bankrupt);
  const which=(run*11+turns*7)%8;
  if(which===0||which===2||which===4||which===7){
   const missing=QA_RESOURCES.slice().sort((a,b)=>(
      actor.resources[a]/actor.quota[a]-actor.resources[b]/actor.quota[b]))[0];
   if(act(state,actor.id,{type:'work',resource:missing}).events[0]?.type==='state')actions++;
  }
  if(which===1&&other.length&&actor.resources.gold>=2){
   if(qaOffer(state,actor,other[0])){actions++;stats.private++;}
  }
  if(which===2||which===5){
   const item=actor.items.find(i=>i.acquiredRound!==state.round);
   const buyer=other.find(p=>p.items.length+(state.blackLots||[]).filter(l=>l.seller===p.id).length<4&&p.resources.gold>=12);
   if(item&&buyer){
    act(state,actor.id,{type:'post',itemId:item.id,ask:{gold:12}});
    const bid=act(state,buyer.id,{type:'bid',offer:{gold:12}});
    if(bid.events[0]?.type==='state'){
      const traded=act(state,actor.id,acceptOffer(state,buyer.id));
      if(traded.events[0]?.type==='state'){actions++;stats.public++;}
    }
   }
  }
  if(which===3&&actor.resources.gold>=75&&actor.items.length<4&&!state.blackLots.some(l=>l.seller===actor.id)){
   const bought=act(state,actor.id,{type:'broker_buy'});
   if(bought.events[0]?.type==='state'){actions++;stats.broker++;}
  }
  if(which===4&&!actor.usedPawn){
   const item=actor.items.find(i=>i.acquiredRound!==state.round);
   if(item){
    const salvaged=act(state,actor.id,{type:'salvage',itemId:item.id});
    if(salvaged.events[0]?.type==='state'){actions++;stats.salvage++;}
   }
  }
  if(which===6&&state.round===2&&other.length){
    const item=actor.items.find(i=>i.acquiredRound!==state.round);
    if(item){
      const listed=act(state,actor.id,{type:'black_post',itemId:item.id,ask:{gold:17}});
      const lot=state.blackLots.find(l=>l.seller===actor.id);
      const buyer=other.find(p=>p.resources.gold>=17&&p.items.length<4);
      if(listed.events[0]?.type==='state'&&lot&&buyer){
        act(state,buyer.id,{type:'black_bid',lotId:lot.id,offer:{gold:17}});
        const sealed=lot.bids.find(b=>b.buyer===buyer.id);
        if(sealed&&act(state,actor.id,{type:'black_accept',lotId:lot.id,bidId:sealed.id}).events[0]?.type==='state'){
          actions++;stats.black++;
        }
      }
    }
  }
  const previous=state.revision;
  act(state,actor.id,{type:'end'});
  assert.ok(state.revision>previous,'revision did not advance');
  // Project all participants through the same server APIs exposed by PocketNet.
  for(const p of state.contestants){
   const view=game.viewForPlayer({state,player:{id:p.id}});
   assert.equal(view.you.id,p.id);
   assert.equal(view.players.every(entry=>!('quota' in entry)&&!('legendary' in entry)),true);
   assert.ok(view.deals.every(deal=>deal.from===p.id||deal.to===p.id));
   assert.equal(JSON.stringify(view).includes('\"eventSchedule\"'),false);
   if(state.phase==='play'&&[2,5,8].includes(state.round)){
     assert.equal(view.players.filter(x=>x.id!==p.id).every(x=>x.resources===null&&x.inventory.length===0),true);
     assert.equal(view.blackLots.every(lot=>lot.item.id===undefined&&lot.seller===undefined),true);
   }
  }
  qaValidate(state,'size='+size+',run='+run+',turn='+turns);
 }
 stats.games++;
 stats.steps+=turns;
 stats.completed+=state.ranking.filter(x=>x.complete&&!x.bankrupt).length;
 stats.bankrupt+=state.contestants.filter(x=>x.bankrupt).length;
 assert.ok(actions<=turns*5);
}

test('Pre-release: 750 complete games exercise all seat counts, private views, escrow and economy boundaries',()=>{
 const stats={games:0,steps:0,completed:0,bankrupt:0,private:0,public:0,black:0,broker:0,salvage:0};
 for(const seats of [2,3,4,5,6]){
  for(let run=0;run<150;run++)qaAutoplay(seats,run,stats);
 }
 assert.equal(stats.games,750);
 assert.ok(stats.public>0&&stats.private>0&&stats.black>0&&stats.broker>0&&stats.salvage>0);
 console.log('Black Bazaar comprehensive 750-match QA:',JSON.stringify(stats));
});
test('Malformed and forged remote amounts cannot mutate resources, inventory or game revision',()=>{
 const {state}=makeRoom(4);
 const [seller,buyer,stranger]=state.contestants;
 act(state,seller.id,{type:'post',itemId:seller.items[0].id,ask:{gold:40}});
 const malformed=[-1,-0.5,1.5,NaN,Infinity,-Infinity,'10',null,{},[],true,2001,1e100];
 for(const amount of malformed){
  const before=JSON.stringify({wallets:state.contestants.map(p=>p.resources),items:qaAssets(state),revision:state.revision});
  const result=act(state,buyer.id,{type:'bid',offer:{gold:amount}});
  if(amount===null){
   // Null is interpreted as omitted currency (=0) and an empty bid is invalid.
  }
  assert.equal(result.events[0].type,'notice','amount '+String(amount));
  assert.equal(JSON.stringify({wallets:state.contestants.map(p=>p.resources),items:qaAssets(state),revision:state.revision}),before);
 }
 for(const bad of [null,'not an object',[],{gold:-1},{gold:3.33},{parts:'1'},{crystals:NaN}]){
  const before=state.revision;
  const answer=act(state,buyer.id,{type:'deal_propose',to:stranger.id,give:bad,want:{gold:1}});
  assert.equal(answer.events[0].type,'notice');
  assert.equal(state.revision,before);
 }
});
test('Replayed or unauthorized sale commands never mint additional resources',()=>{
 const {state}=makeRoom(3);
 const [seller,buyer,outsider]=state.contestants;
 const item=seller.items[0];
 act(state,seller.id,{type:'post',itemId:item.id,ask:{gold:60}});
 act(state,buyer.id,{type:'bid',offer:{gold:55}});
 const sellerInitial=seller.resources.gold;
 const buyerInitial=buyer.resources.gold;
 const bad=act(state,outsider.id,acceptOffer(state,buyer.id));
 assert.equal(bad.events[0].type,'notice');
 assert.equal(seller.resources.gold,sellerInitial);
 const good=act(state,seller.id,acceptOffer(state,buyer.id));
 assert.equal(good.events[0].type,'state');
 const once=JSON.stringify({wallets:state.contestants.map(p=>p.resources),items:qaAssets(state),revision:state.revision});
 for(let i=0;i<10;i++){
  const result=act(state,seller.id,acceptOffer(state,buyer.id));
  assert.equal(result.events[0].type,'notice');
 }
 assert.equal(JSON.stringify({wallets:state.contestants.map(p=>p.resources),items:qaAssets(state),revision:state.revision}),once);
 assert.equal(seller.resources.gold,sellerInitial+55);
 assert.equal(buyer.resources.gold,buyerInitial-55-(seller.negativeTarget===buyer.id?20:0));
});
test('Multiple black-market bids cannot pay for more than inventory limit, and old bids cannot settle twice',()=>{
 const {state}=makeRoom(4);
 while(state.round<2)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 const [seller1,seller2,buyer]=state.contestants;
 seller1.items=[{id:'item-30001',key:'pig',variant:1,acquiredRound:0,history:[]}];
 seller2.items=[{id:'item-30002',key:'cat',variant:1,acquiredRound:0,history:[]}];
 buyer.items=[];buyer.resources.gold=500;
 for(const seller of [seller1,seller2])act(state,seller.id,{type:'black_post',itemId:seller.items[0].id,ask:{gold:100}});
 const [a,b]=state.blackLots;
 act(state,buyer.id,{type:'black_bid',lotId:a.id,offer:{gold:300}});
 act(state,buyer.id,{type:'black_bid',lotId:b.id,offer:{gold:300}});
 assert.equal(a.bids.length,1);
 assert.equal(b.bids.length,1);
 // First settlement consumes funds; second must be rejected on live balance.
 const first=act(state,seller1.id,{type:'black_accept',lotId:a.id,bidId:a.bids[0].id});
 assert.equal(first.events[0].type,'state');
 const left=buyer.resources.gold;
 const second=act(state,seller2.id,{type:'black_accept',lotId:b.id,bidId:b.bids[0].id});
 assert.equal(second.events[0].type,'notice');
 assert.equal(buyer.resources.gold,left);
 assert.equal(state.blackLots.length,1);
});
test('Voluntary host departure moves control, cancels escrow and lets remaining players finish',()=>{
 const {state}=makeRoom(4);
 while(state.round<2)act(state,state.contestants[state.turnIndex].id,{type:'end'});
 const hostId=state.host,host=state.contestants.find(p=>p.id===hostId);
 const item=host.items.find(i=>i.acquiredRound!==state.round);
 assert.ok(item);
 act(state,host.id,{type:'black_post',itemId:item.id,ask:{gold:12}});
 const currentPlayers=state.players.filter(x=>x.id!==host.id);
 game.onLeave({state,player:{id:host.id},players:currentPlayers});
 assert.ok(!state.players.some(x=>x.id===hostId));
 assert.equal(host.bankrupt,true);
 assert.equal(state.blackLots.some(l=>l.seller===hostId),false);
 assert.equal(host.items.some(x=>x.id===item.id),true);
 assert.equal(state.host,currentPlayers[0].id);
 let steps=0;
 while(state.phase==='play'&&steps++<80){
  const p=state.contestants[state.turnIndex];
  assert.notEqual(p.id,hostId);
  act(state,p.id,{type:'end'});
 }
 assert.equal(state.phase,'done');
 qaValidate(state,'post-host-departure');
});
test('Game server state round-trips through JSON and preserves private outcomes after reconnect',()=>{
 const {state}=makeRoom(4);
 const [a,b,c]=state.contestants;
 act(state,a.id,{type:'deal_propose',to:b.id,give:{gold:5},want:{crystals:1}});
 assert.equal(state.deals.length,1);
 // Simulate durable database save/reload, including variant powers and sealed trades.
 const clone=JSON.parse(JSON.stringify(state));
 const before=game.viewForPlayer({state,player:{id:a.id}});
 const after=game.viewForPlayer({state:clone,player:{id:a.id}});
 assert.deepEqual(after,before);
 const outsider=game.viewForPlayer({state:clone,player:{id:c.id}});
 assert.equal(outsider.deals.length,0);
 const id=clone.deals[0].id;
 const accepted=game.onMessage({state:clone,player:{id:b.id},payload:{type:'deal_accept',dealId:id}});
 assert.equal(accepted.events[0].type,'state');
 assert.equal(clone.deals.length,0);
 assert.equal(state.deals.length,1,'durable snapshots are isolated');
 qaValidate(clone,'roundtrip');
});
test('A late malicious action advances the expired turn but never buys an item or spends funds',()=>{
 const {state}=makeRoom(3);
 const active=state.contestants[state.turnIndex],before={...active.resources};
 state.deadlineAt=Date.now()-1;
 const revision=state.revision;
 const result=act(state,active.id,{type:'broker_buy'});
 assert.equal(result.events[0].type,'state');
 assert.equal(state.turnIndex,1);
 assert.deepEqual(active.resources,before);
 assert.equal(state.revision,revision+1);
});


test('Currency balances saturate at 9999 for urgent rewards, pawnshop and secret relationship gains',()=>{
 // (a) A fully wealthy player's urgent reward must not overflow gold.
 {
  const {state}=makeRoom(2),actor=state.contestants[0];
  actor.resources.gold=9990;actor.resources.crystals=100;actor.resources.parts=100;
  actor.urgent={needs:{gold:0,crystals:1,parts:0},status:'pending'};
  const ended=act(state,actor.id,{type:'end'});
  assert.equal(ended.events[0].type,'state');
  assert.equal(actor.resources.gold,9999);
  assert.equal(actor.urgent.status,'success');
 }
 // (b) Pawnshop pays 45 without exceeding the bank limit.
 {
  const {state}=makeRoom(2),actor=state.contestants[0];
  actor.resources.gold=9990;
  const pawn=act(state,actor.id,{type:'pawn',itemId:actor.items[0].id});
  assert.equal(pawn.events[0].type,'state');
  assert.equal(actor.resources.gold,9999);
 }
 // (c) +3 crystals from a personal relationship also saturate properly.
 {
  const {state}=makeRoom(2),[seller,buyer]=state.contestants;
  buyer.positiveTarget=seller.id;buyer.positiveUsed=0;
  buyer.resources.crystals=9998;
  act(state,seller.id,{type:'post',itemId:seller.items[0].id,ask:{gold:1}});
  act(state,buyer.id,{type:'bid',offer:{gold:1}});
  const sold=act(state,seller.id,acceptOffer(state,buyer.id));
  assert.equal(sold.events[0].type,'state');
  assert.equal(buyer.resources.crystals,9999);
 }
});

test('Reconnect of an existing contestant preserves wallet, holdings, active auction and turn',()=>{
 const {state}=makeRoom(3);
 const [seller,buyer]=state.contestants;
 const id=seller.items[0].id;
 act(state,seller.id,{type:'post',itemId:id,ask:{gold:75,crystals:0,parts:0}});
 act(state,buyer.id,{type:'bid',offer:{gold:75,crystals:0,parts:0}});
 const before={turn:state.turnIndex,round:state.round,deadline:state.deadlineAt,
  wallet:{...buyer.resources},itemIds:buyer.items.map(x=>x.id),bid:state.bids[0].buyer};
 const rejoined=state.players.map(p=>({...p}));
 game.onJoin({state,players:rejoined});
 assert.equal(state.turnIndex,before.turn);
 assert.equal(state.round,before.round);
 assert.equal(state.deadlineAt,before.deadline);
 assert.deepEqual(buyer.resources,before.wallet);
 assert.deepEqual(buyer.items.map(x=>x.id),before.itemIds);
 assert.equal(state.bids[0].buyer,before.bid);
 assert.equal(state.listing.itemId,id);
 const view=game.viewForPlayer({state,player:{id:buyer.id}});
 assert.equal(view.you.id,buyer.id);
 assert.equal(view.listing.id,id);
});
test('Quick-price bid is only a bid; seller acceptance changes ownership exactly once',()=>{
 const {state}=makeRoom(2);
 const [seller,buyer]=state.contestants;
 const item=seller.items[0],before=buyer.resources.gold;
 act(state,seller.id,{type:'post',itemId:item.id,ask:{gold:85,crystals:0,parts:0}});
 act(state,buyer.id,{type:'bid',offer:{gold:85,crystals:0,parts:0}});
 assert.equal(buyer.resources.gold,before);
 assert.equal(state.listing.itemId,item.id);
 assert.equal(state.bids.length,1);
 act(state,seller.id,acceptOffer(state,buyer.id));
 // A seller's secret negative relationship applies an additional 20-gold
 // deduction after the bid settles, but never at the time of bidding.
 const relationshipPenalty=seller.negativeTarget===buyer.id&&seller.negativeUsed===state.round?20:0;
 assert.equal(buyer.resources.gold,before-85-relationshipPenalty);
 assert.equal(state.listing,null);
 assert.equal(buyer.items.filter(x=>x.id===item.id).length,1);
 const replay=act(state,seller.id,acceptOffer(state,buyer.id));
 assert.equal(replay.events[0].type,'notice');
 assert.equal(buyer.items.filter(x=>x.id===item.id).length,1);
});

test('Reconnect with the same member preserves the game and every asset',()=>{
 const {state}=makeRoom(2);const p=state.contestants[1];
 const items=p.items.map(i=>i.id),wallet={...p.resources},turn=state.turnIndex;
 // Socket disconnect does not call onLeave in the PocketNet transport.
 game.onJoin({state,players:state.players.map(x=>({...x}))});
 assert.equal(p.bankrupt,false);
 assert.deepEqual(p.items.map(i=>i.id),items);
 assert.deepEqual(p.resources,wallet);
 assert.equal(state.turnIndex,turn);
 assert.equal(game.viewForPlayer({state,player:{id:p.id}}).you.id,p.id);
});

test('Only one 30-second reconnect allowance per active turn; return resumes the clock',()=>{
 const {state}=makeRoom(2),p=state.contestants[state.turnIndex];
 const original=state.deadlineAt;
 game.onPresence({state,player:{id:p.id},online:false});
 assert.equal(state.deadlineAt,original+30000);
 game.onPresence({state,player:{id:p.id},online:false});
 assert.equal(state.deadlineAt,original+30000);
 game.onPresence({state,player:{id:p.id},online:true});
 assert.ok(state.deadlineAt>=original-300);
 assert.ok(state.deadlineAt<=original+30000);
 assert.equal(state.connectionGraceUntil,null);
 const returned=state.deadlineAt;
 game.onPresence({state,player:{id:p.id},online:false});
 assert.equal(state.deadlineAt,returned);
});
test('Non-active disconnect does not affect timer; grace resets for next turn',()=>{
 const {state}=makeRoom(2),current=state.contestants[state.turnIndex];
 const other=state.contestants.find(p=>p.id!==current.id),initial=state.deadlineAt;
 game.onPresence({state,player:{id:other.id},online:false});
 assert.equal(state.deadlineAt,initial);
 game.onPresence({state,player:{id:current.id},online:false});
 act(state,current.id,{type:'end'});
 const next=state.contestants[state.turnIndex],nextDeadline=state.deadlineAt;
 game.onPresence({state,player:{id:next.id},online:false});
 assert.equal(state.deadlineAt,nextDeadline+30000);
});

test('Host can exclude a lobby guest; member and account bans are durable and private',()=>{
 const host={id:'host',name:'Ведущий',accountId:'account-host'},guest={id:'guest',name:'Нарушитель',accountId:'account-guest'};
 const state=game.createRoom({player:host}).state;
 game.onJoin({state,player:guest,players:[host,guest]});
 const denied=game.onMessage({state,player:guest,players:[host,guest],payload:{type:'kick',targetId:host.id}});
 assert.equal(denied.events[0].type,'notice');
 assert.equal(state.players.length,2);
 const self=game.onMessage({state,player:host,players:[host,guest],payload:{type:'kick',targetId:host.id}});
 assert.equal(self.events[0].type,'notice');
 const result=game.onMessage({state,player:host,players:[host,guest],payload:{type:'kick',targetId:guest.id}});
 assert.equal(result.events.some(e=>e.type==='player_kicked'&&e.to===guest.id),true);
 assert.equal(state.players.length,1);
 assert.deepEqual(state.bannedIds,[guest.id]);
 assert.deepEqual(state.bannedAccounts,[guest.accountId]);
 assert.equal('bannedIds' in game.viewForPlayer({state,player:host}),false);
 assert.throws(()=>game.onJoin({state,player:guest,players:[host,guest]}),/room_kicked/);
 assert.throws(()=>game.onJoin({state,player:{id:'new-token',accountId:guest.accountId},players:[host,{id:'new-token'}]}),/room_kicked/);
 const persisted=JSON.parse(JSON.stringify(state));
 assert.deepEqual(persisted.bannedAccounts,[guest.accountId]);
});
test('Host kick during a live auction cancels bids, returns black escrow and skips kicked turn',()=>{
 const {state,players}=makeRoom(3);
 const host=state.contestants.find(p=>p.id===state.host),guest=state.contestants.find(p=>p.id!==state.host);
 const hostMember={id:host.id,name:host.name},guestMember={id:guest.id,name:guest.name};
 state.turnIndex=state.contestants.indexOf(host);
 state.listing=null;
 const auction=host.items[0];
 act(state,host.id,{type:'post',itemId:auction.id,ask:{gold:45}});
 act(state,guest.id,{type:'bid',offer:{gold:45}});
 assert.equal(state.bids.length,1);
 const blackItem=guest.items.pop();
 state.blackLots=[{id:'black-debug',seller:guest.id,item:blackItem,ask:{gold:20,crystals:0,parts:0},bids:[],round:state.round}];
 state.turnIndex=state.contestants.indexOf(guest);
 const before=guest.items.length;
 const result=game.onMessage({state,player:hostMember,players:[hostMember,guestMember,{id:players[2].id,name:players[2].name}],payload:{type:'kick',targetId:guest.id}});
 assert.ok(result.events.some(e=>e.type==='player_kicked'&&e.to===guest.id));
 assert.equal(guest.bankrupt,true);
 assert.equal(guest.items.length,before+1);
 assert.equal(guest.items.some(i=>i.id===blackItem.id),true);
 assert.equal(state.blackLots.length,0);
 assert.equal(state.bids.some(b=>b.buyer===guest.id),false);
 assert.notEqual(state.contestants[state.turnIndex].id,guest.id);
 assert.ok(state.players.some(p=>p.id===host.id));
 assert.ok(!state.players.some(p=>p.id===guest.id));
 const revision=state.revision;
 const repeat=game.onMessage({state,player:hostMember,players:[hostMember,{id:players[2].id}],payload:{type:'kick',targetId:guest.id}});
 assert.equal(repeat.events[0].type,'notice');
 assert.equal(state.revision,revision);
});

test('Last simultaneous disconnect freezes turn, inventory, auction and bid across a two-hour offline gap',()=>{
 const {state,players}=makeRoom(3);
 const seller=state.contestants[state.turnIndex];
 const buyer=state.contestants.find(p=>p.id!==seller.id);
 const other=state.contestants.find(p=>p.id!==seller.id&&p.id!==buyer.id);
 const item=seller.items[0];
 act(state,seller.id,{type:'post',itemId:item.id,ask:{gold:45,crystals:0,parts:0}});
 act(state,buyer.id,{type:'bid',offer:{gold:45,crystals:0,parts:0}});
 assert.equal(state.bids.length,1);
 state.deadlineAt=Date.now()+42_000;
 const balances=state.contestants.map(p=>JSON.stringify({id:p.id,wallet:p.resources,items:p.items.map(i=>i.id)}));
 const nonActive=game.onPresence({state,player:{id:buyer.id},online:false,onlineIds:[seller.id,other.id]});
 assert.equal(nonActive.events.length,0);
 const lostSeller=game.onPresence({state,player:{id:seller.id},online:false,onlineIds:[other.id]});
 assert.ok(lostSeller.events.length>0);
 assert.ok(state.connectionGraceUntil>Date.now());
 const paused=game.onPresence({state,player:{id:other.id},online:false,onlineIds:[]});
 assert.ok(paused.events.length>0);
 assert.equal(state.offlinePaused,true);
 assert.equal(state.deadlineAt,null);
 assert.equal(state.connectionGraceUntil,null);
 assert.ok(state.pauseRemainingMs>65_000&&state.pauseRemainingMs<=72_000);
 const remaining=state.pauseRemainingMs,revision=state.revision;
 const repeated=game.onPresence({state,player:{id:other.id},online:false,onlineIds:[]});
 assert.equal(repeated.events.length,0);
 assert.equal(state.revision,revision);
 const saved=JSON.parse(JSON.stringify(state));
 assert.equal(saved.offlinePaused,true);
 assert.equal(saved.listing.itemId,item.id);
 assert.equal(saved.bids[0].buyer,buyer.id);
 assert.deepEqual(saved.contestants.map(p=>JSON.stringify({id:p.id,wallet:p.resources,items:p.items.map(i=>i.id)})),balances);
 const originalNow=Date.now, later=originalNow()+2*60*60_000;
 let revived;
 try{
  Date.now=()=>later;
  revived=game.onPresence({state:saved,player:{id:other.id},online:true,onlineIds:[other.id]});
 }finally{Date.now=originalNow;}
 assert.ok(revived.events.length>0);
 assert.equal(saved.offlinePaused,false);
 assert.equal(saved.pauseRemainingMs,null);
 assert.ok(saved.deadlineAt-later>=remaining-5&&saved.deadlineAt-later<=remaining+1000);
 assert.equal(saved.turnIndex,state.turnIndex);
 assert.equal(saved.round,state.round);
 assert.equal(saved.host,state.host);
 assert.equal(saved.bids.length,1);
 assert.equal(saved.listing.itemId,item.id);
 const resumedAgain=game.onPresence({state:saved,player:{id:seller.id},online:true,onlineIds:[seller.id,other.id]});
 assert.equal(resumedAgain.events.length,0,'late host reconnect cannot extend clock a second time');
 assert.equal(saved.deadlineAt,later+Math.max(1000,remaining));
});
test('Losing all members while non-active resumes without unfair forfeiture',()=>{
 const {state}=makeRoom(2);
 const [active,second]=[state.contestants[state.turnIndex],state.contestants[1-state.turnIndex]];
 state.deadlineAt=Date.now()+18_000;
 const before=state.deadlineAt-Date.now();
 game.onPresence({state,player:{id:active.id},online:false,onlineIds:[second.id]});
 game.onPresence({state,player:{id:second.id},online:false,onlineIds:[]});
 assert.equal(state.offlinePaused,true);
 const pausedTime=state.pauseRemainingMs;
 assert.ok(pausedTime>before+25_000);
 const wake=game.onPresence({state,player:{id:second.id},online:true,onlineIds:[second.id]});
 assert.ok(wake.events.length>0);
 assert.equal(state.offlinePaused,false);
 assert.equal(state.contestants[state.turnIndex].id,active.id);
 assert.ok(state.deadlineAt-Date.now()>=pausedTime-5);
});

test('Changed bids cannot be accepted using a stale public offer ID',()=>{
 const {state}=makeRoom(2),[seller,buyer]=state.contestants;
 const item=seller.items[0];
 act(state,seller.id,{type:'post',itemId:item.id,ask:{gold:90}});
 act(state,buyer.id,{type:'bid',offer:{gold:80}});
 const previous=game.viewForPlayer({state,player:{id:seller.id}}).bids[0];
 assert.ok(previous.id.startsWith('bid-'));
 act(state,buyer.id,{type:'bid',offer:{gold:1}});
 const latest=game.viewForPlayer({state,player:{id:seller.id}}).bids[0];
 assert.notEqual(previous.id,latest.id);
 const gold=seller.resources.gold;
 assert.equal(act(state,seller.id,{type:'accept',buyer:buyer.id,bidId:previous.id}).events[0].type,'notice');
 assert.equal(seller.resources.gold,gold);
 assert.equal(act(state,seller.id,{type:'accept',buyer:buyer.id,bidId:latest.id}).events[0].type,'state');
 assert.equal(seller.resources.gold,gold+1);
 assert.ok(buyer.items.some(x=>x.id===item.id));
});
test('Repacked items keep their original name private in the sale journal',()=>{
 const {state}=makeRoom(2),[seller,buyer]=state.contestants;
 const item=seller.items[0],original=game.viewForPlayer({state,player:{id:seller.id}}).you.items[0].originalName;
 assert.equal(act(state,seller.id,{type:'repack',itemId:item.id,aliasIndex:2}).events[0].type,'state');
 act(state,seller.id,{type:'post',itemId:item.id,ask:{gold:50}});
 assert.equal(game.viewForPlayer({state,player:{id:buyer.id}}).listing.name,'Тёмная реликвия');
 act(state,buyer.id,{type:'bid',offer:{gold:50}});
 assert.equal(act(state,seller.id,acceptOffer(state,buyer.id)).events[0].type,'state');
 const view=game.viewForPlayer({state,player:{id:buyer.id}});
 assert.equal(view.you.items.find(x=>x.id===item.id).originalName,original);
 assert.ok(view.log[0].includes('«Тёмная реликвия»'));
 assert.ok(!view.log[0].includes('«'+original+'»'));
});

test('Nine cosmetic avatars are individually selectable, duplicable and bound to the requesting seat',()=>{
 const members=Array.from({length:6},(_,i)=>({id:'avatar-'+i,name:'Проверенный ник '+i}));
 const {state}=game.createRoom({player:members[0]});
 game.onJoin({state,players:members,player:members[5]});
 const avatars=['mage','mushroom','fluffy_monster','sheep_wolf','toy','prince','many_eyed_cat','flower','old_man'];
 for(let i=0;i<6;i++){
   const prior=state.revision;
   const answer=game.onMessage({state,player:members[i],payload:{type:'select_avatar',avatarId:avatars[i]}});
   assert.equal(answer.events[0].type,'state');
   if(state.players[i].avatarId!==avatars[i])throw Error('Avatar not applied');
   assert.ok(state.revision>=prior);
 }
 const before=JSON.stringify(state.players);
 for(const invalid of [null,undefined,0,[],{},'custom','mage<script>','../../mage','']){
   const denied=game.onMessage({state,player:members[0],payload:{type:'select_avatar',avatarId:invalid}});
   assert.equal(denied.events[0].type,'notice');
   assert.equal(JSON.stringify(state.players),before);
 }
 game.onMessage({state,player:members[0],payload:{type:'select_avatar',avatarId:'old_man'}});
 game.onMessage({state,player:members[1],payload:{type:'select_avatar',avatarId:'old_man'}});
 assert.equal(state.players[0].avatarId,'old_man');
 assert.equal(state.players[1].avatarId,'old_man','duplicates are allowed');
 assert.equal(state.players[2].avatarId,'fluffy_monster','choosing avatar cannot modify someone else');
 game.onMessage({state,player:members[0],payload:{type:'start'}});
 assert.equal(state.phase,'play');
 for(const p of state.contestants){
  assert.equal(p.name,members.find(m=>m.id===p.id).name);
  assert.equal(p.character,p.name,'trade log display name must be the verified nickname');
  assert.equal(p.avatarId,state.players.find(m=>m.id===p.id).avatarId);
 }
 const view=game.viewForPlayer({state,player:members[0]});
 assert.equal(view.players.length,6);
 assert.ok(view.players.every(p=>p.name===p.character&&avatars.includes(p.avatarId)));
 assert.ok(!view.players.some(p=>'quota' in p||'positiveTarget' in p));
 const pre=JSON.stringify(state.contestants.map(p=>p.avatarId));
 const denied=game.onMessage({state,player:members[0],payload:{type:'select_avatar',avatarId:'mage'}});
 assert.equal(denied.events[0].type,'notice');
 assert.equal(JSON.stringify(state.contestants.map(p=>p.avatarId)),pre);
});
test('Avatar selection persists when members rejoin and host returns to the lobby',()=>{
 const players=[{id:'one',name:'Ник одного'},{id:'two',name:'Ник второго'}];
 const {state}=game.createRoom({player:players[0]});
 game.onJoin({state,players,player:players[1]});
 game.onMessage({state,player:players[1],payload:{type:'select_avatar',avatarId:'flower'}});
 game.onJoin({state,players,player:players[1]});
 assert.equal(state.players.find(p=>p.id==='two').avatarId,'flower');
 game.onMessage({state,player:players[0],payload:{type:'start'}});
 assert.equal(state.contestants.find(p=>p.id==='two').avatarId,'flower');
 state.phase='done';
 state.ranking=[...state.contestants.map(p=>({id:p.id,name:p.name,avatarId:p.avatarId}))];
 const denied=game.onMessage({state,player:players[1],payload:{type:'return_lobby'}});
 assert.equal(denied.events[0].type,'notice','non-host cannot return to lobby');
 assert.equal(state.phase,'done');
 game.onMessage({state,player:players[0],payload:{type:'return_lobby'}});
 assert.equal(state.phase,'lobby');
 assert.equal(state.players.find(p=>p.id==='two').avatarId,'flower');
 game.onMessage({state,player:players[1],payload:{type:'select_avatar',avatarId:'many_eyed_cat'}});
 assert.equal(state.players.find(p=>p.id==='two').avatarId,'many_eyed_cat');
 game.onMessage({state,player:players[0],payload:{type:'start'}});
 assert.equal(state.contestants.find(p=>p.id==='two').avatarId,'many_eyed_cat');
});

test('Server alarm advances an unattended expired turn exactly once and never spends a stale action',()=>{
 const persons=Array.from({length:3},(_,i)=>({id:'alarm'+i,name:'Тестер '+i}));
 const {state}=game.createRoom({player:persons[0]});
 game.onJoin({state,players:persons,player:persons[2]});
 game.onMessage({state,player:persons[0],players:persons,payload:{type:'start'}});
 const previous=state.contestants[state.turnIndex],index=state.turnIndex,rev=state.revision;
 const beforeGold=previous.resources.gold;
 state.deadlineAt=Date.now()-1;
 const first=game.onDeadline({state,now:Date.now()});
 assert.equal(first.events[0].type,'state');
 assert.equal(state.revision,rev+1);
 assert.notEqual(state.turnIndex,index,'next seat selected without a client heartbeat');
 assert.equal(previous.resources.gold,beforeGold);
 const afterRevision=state.revision,afterRound=state.round,afterIndex=state.turnIndex;
 const duplicate=game.onDeadline({state,now:Date.now()});
 assert.deepEqual(duplicate.events,[]);
 assert.equal(state.revision,afterRevision);
 assert.equal(state.round,afterRound);
 assert.equal(state.turnIndex,afterIndex);
 const onTime=game.onDeadline({state,now:state.deadlineAt-1});
 assert.deepEqual(onTime.events,[]);
 assert.equal(state.revision,afterRevision);
 const privateView=game.viewForPlayer({state,player:persons[1]});
 assert.ok(Number.isFinite(privateView.serverNow),'projected server timestamp calibrates client clock');
});
test('Server deadline never advances offline-paused or finished rooms',()=>{
 const people=[{id:'host-alarm',name:'А'},{id:'guest-alarm',name:'Б'}];
 const {state}=game.createRoom({player:people[0]});
 game.onJoin({state,players:people,player:people[1]});
 game.onMessage({state,player:people[0],players:people,payload:{type:'start'}});
 const rev=state.revision;
 state.deadlineAt=Date.now()-1000;
 state.offlinePaused=true;
 assert.deepEqual(game.onDeadline({state,now:Date.now()}).events,[]);
 assert.equal(state.revision,rev);
 state.offlinePaused=false;state.phase='done';
 assert.deepEqual(game.onDeadline({state,now:Date.now()}).events,[]);
 assert.equal(state.revision,rev);
});

test('v21 seller claims are chosen from an authoritative whitelist and are not appraisals',()=>{
 const {state}=makeRoom(3);
 const seller=state.contestants[state.turnIndex];
 const buyer=state.contestants.find(p=>p.id!==seller.id);
 const item=seller.items[0];
 const revision=state.revision;
 const bad=act(state,seller.id,{type:'post',itemId:item.id,ask:{gold:70},pitchId:'2'});
 assert.equal(state.revision,revision);
 assert.equal(state.listing,null);
 assert.match(bad.events[0].payload,/бирка/);
 const forged=act(state,seller.id,{type:'post',itemId:item.id,ask:{gold:70},pitchId:999});
 assert.equal(forged.events[0].type,'notice');
 assert.equal(state.listing,null);
 const posted=act(state,seller.id,{type:'post',itemId:item.id,ask:{gold:70},pitchId:2});
 assert.equal(posted.events[0].type,'state');
 const buyerView=game.viewForPlayer({state,player:{id:buyer.id}});
 assert.equal(buyerView.listing.pitch,'Проверял лично. Почти.');
 assert.equal(typeof buyerView.listing.name,'string');
 assert.equal('positive' in buyerView.listing,false,'a seller slogan must not reveal a hidden good');
 assert.equal('negative' in buyerView.listing,false);
 assert.equal(buyerView.players.find(p=>p.id===seller.id).reputation.title,'Новичок рынка');
 assert.equal(buyerView.you.sellerPitches.length,7);
 assert.equal('tradeStats' in buyerView.players[0],false,'private cumulative figures are not blindly projected');
 const duplicate=act(state,seller.id,{type:'post',itemId:seller.items[1].id,ask:{gold:80},pitchId:0});
 assert.equal(duplicate.events[0].type,'notice','a seller cannot silently replace a pending public auction');
 assert.equal(state.listing.itemId,item.id);
 assert.equal(state.listing.pitchId,2);
});
test('v21 reputation follows only completed public transactions, and comic rankings use actual facts',()=>{
 const {state}=makeRoom(3);
 const seller=state.contestants[state.turnIndex];
 const buyer=state.contestants.find(p=>p.id!==seller.id);
 const item=seller.items[0];
 act(state,seller.id,{type:'post',itemId:item.id,ask:{gold:40},pitchId:5});
 assert.equal(seller.tradeStats.withdrawals,0);
 act(state,seller.id,{type:'cancel'});
 assert.equal(seller.tradeStats.withdrawals,1);
 assert.equal(game.viewForPlayer({state,player:{id:buyer.id}}).players.find(x=>x.id===seller.id).reputation.withdrawals,1);
 act(state,seller.id,{type:'post',itemId:item.id,ask:{gold:40},pitchId:6});
 const offer=act(state,buyer.id,{type:'bid',offer:{gold:40}});
 assert.equal(offer.events[0].type,'state');
 assert.equal(seller.tradeStats.sales,0,'unaccepted bids are not sales');
 const bid=state.bids.find(x=>x.buyer===buyer.id);
 const completed=act(state,seller.id,{type:'accept',buyer:buyer.id,bidId:bid.id});
 assert.equal(completed.events[0].type,'state');
 assert.equal(seller.tradeStats.sales,1);
 assert.equal(buyer.tradeStats.bids,1);
 assert.equal(state.listing,null);
 const buyerView=game.viewForPlayer({state,player:{id:buyer.id}});
 const sellerBadge=buyerView.players.find(x=>x.id===seller.id).reputation;
 assert.equal(sellerBadge.title,'Первая удачная сделка');
 assert.deepEqual({sales:sellerBadge.sales,withdrawals:sellerBadge.withdrawals},{sales:1,withdrawals:1});
 // The final newspaper must be based on recorded actions, not randomized awards.
 for(let n=0;n<60&&state.phase==='play';n++){
  const turn=state.contestants[state.turnIndex].id;
  act(state,turn,{type:'end'});
 }
 assert.equal(state.phase,'done');
 const final=game.viewForPlayer({state,player:{id:buyer.id}});
 assert.equal(final.ranking.length,3);
 const sellerResult=final.ranking.find(x=>x.id===seller.id);
 assert.equal(sellerResult.tradeStats.sales,1);
 assert.equal(sellerResult.epithet.title,'Повелитель прилавка');
 assert.equal(sellerResult.epithet.detail,'1 · продажи');
 assert.equal(final.ranking.find(x=>x.id===buyer.id).tradeStats.bids,1);
});
test('v21 anonymous sales do not update the named seller public reputation',()=>{
 const {state}=makeRoom(3);
 const seller=state.contestants[state.turnIndex];
 const buyer=state.contestants.find(p=>p.id!==seller.id);
 // Black market is available in rounds 2/5/8 and escrow hides identity.
 state.round=2;
 const item=seller.items[0];
 const before=game.viewForPlayer({state,player:{id:buyer.id}});
 const previous=before.players.find(x=>x.id===seller.id).reputation;
 const p=act(state,seller.id,{type:'black_post',itemId:item.id,ask:{gold:50}});
 assert.equal(p.events[0].type,'state');
 const lot=state.blackLots[0];
 assert.ok(lot);
 assert.equal(JSON.stringify(game.viewForPlayer({state,player:{id:buyer.id}}).blackLots).includes(seller.id),false);
 act(state,buyer.id,{type:'black_bid',lotId:lot.id,offer:{gold:50}});
 const id=lot.bids[0].id;
 act(state,seller.id,{type:'black_accept',lotId:lot.id,bidId:id});
 const after=game.viewForPlayer({state,player:{id:buyer.id}});
 assert.deepEqual(after.players.find(x=>x.id===seller.id).reputation,previous,
  'a named badge must never reveal ownership of a closed anonymous auction');
});

test('v22 secret counteroffers use verified bid IDs and settle atomically without identities',()=>{
 const {state}=makeRoom(3);
 const seller=state.contestants[state.turnIndex];
 const buyer=state.contestants.find(x=>x.id!==seller.id);
 const outsider=state.contestants.find(x=>x.id!==seller.id&&x.id!==buyer.id);
 state.round=5; // Fixed event: cheaper midnight commission and inspection.
 const view=game.viewForPlayer({state,player:{id:buyer.id}});
 assert.equal(view.event.id,'shadow_fair');
 assert.equal(view.marketFeePercent,3);
 assert.equal(view.you.inspectionPrices.black,15);
 const item=seller.items[0],startingGold=seller.resources.gold,buyerGold=buyer.resources.gold;
 assert.equal(act(state,seller.id,{type:'black_post',itemId:item.id,ask:{gold:60}}).events[0].type,'state');
 const lot=state.blackLots[0];
 assert.equal(act(state,buyer.id,{type:'black_bid',lotId:lot.id,offer:{gold:45}}).events[0].type,'state');
 const bid=lot.bids[0],before=state.revision;
 assert.equal(act(state,outsider.id,{type:'black_counter',lotId:lot.id,bidId:bid.id,offer:{gold:75}}).events[0].type,'notice');
 assert.equal(state.revision,before);
 assert.equal(act(state,seller.id,{type:'black_counter',lotId:lot.id,bidId:'bbid-forged',offer:{gold:75}}).events[0].type,'notice');
 assert.equal(act(state,seller.id,{type:'black_counter',lotId:lot.id,bidId:bid.id,offer:{gold:-1}}).events[0].type,'notice');
 assert.equal(act(state,seller.id,{type:'black_counter',lotId:lot.id,bidId:bid.id,offer:{gold:75}}).events[0].type,'state');
 const counter=bid.counter;
 assert.match(counter.id,/^bcounter-/);
 assert.equal(act(state,seller.id,{type:'black_counter',lotId:lot.id,bidId:bid.id,offer:{gold:500}}).events[0].type,'notice');
 const sellerView=game.viewForPlayer({state,player:{id:seller.id}});
 const buyerView=game.viewForPlayer({state,player:{id:buyer.id}});
 const outsiderView=game.viewForPlayer({state,player:{id:outsider.id}});
 assert.deepEqual(sellerView.blackLots[0].bids[0].counter.offer,{gold:75,crystals:0,parts:0});
 assert.equal('buyer' in sellerView.blackLots[0].bids[0],false);
 assert.deepEqual(buyerView.blackLots[0].myCounter,{bidId:bid.id,id:counter.id,offer:{gold:75,crystals:0,parts:0}});
 assert.equal(outsiderView.blackLots[0].myCounter,null);
 assert.deepEqual(outsiderView.blackLots[0].bids,[]);
 assert.equal(JSON.stringify(buyerView.blackLots).includes(seller.id),false,'secret seller must not leak');
 const stable=state.revision;
 assert.equal(act(state,outsider.id,{type:'black_counter_accept',lotId:lot.id,bidId:bid.id,counterId:counter.id}).events[0].type,'notice');
 assert.equal(act(state,buyer.id,{type:'black_counter_accept',lotId:lot.id,bidId:bid.id,counterId:'bcounter-fake'}).events[0].type,'notice');
 assert.equal(state.revision,stable);
 assert.equal(act(state,buyer.id,{type:'black_counter_accept',lotId:lot.id,bidId:bid.id,counterId:counter.id}).events[0].type,'state');
 assert.equal(state.blackLots.length,0);
 assert.equal(buyer.resources.gold,buyerGold-75-(seller.negativeTarget===buyer.id?20:0),'secret relationship penalty still applies to counter trades');
 assert.equal(seller.resources.gold,startingGold+72,'3% fee rounded up, seller gets 72');
 assert.ok(buyer.items.some(x=>x.id===item.id));
 assert.equal(buyer.items.find(x=>x.id===item.id).history.at(-1),'Анонимный рынок');
 assert.equal(seller.tradeStats.sales,0,'counter settlement remains anonymous and does not change public reputation');
 assert.equal(act(state,buyer.id,{type:'black_counter_accept',lotId:lot.id,bidId:bid.id,counterId:counter.id}).events[0].type,'notice');
 assert.equal(seller.resources.gold,startingGold+72,'replay cannot double-pay');
});
test('v22 repricing a secret bid invalidates its previous counteroffer',()=>{
 const {state}=makeRoom(3);state.round=2;
 const seller=state.contestants[state.turnIndex],buyer=state.contestants.find(x=>x.id!==seller.id);
 act(state,seller.id,{type:'black_post',itemId:seller.items[0].id,ask:{gold:50}});
 const lot=state.blackLots[0];
 act(state,buyer.id,{type:'black_bid',lotId:lot.id,offer:{gold:35}});
 const original=lot.bids[0];
 act(state,seller.id,{type:'black_counter',lotId:lot.id,bidId:original.id,offer:{gold:55}});
 const old=original.counter.id;
 act(state,buyer.id,{type:'black_bid',lotId:lot.id,offer:{gold:42}});
 assert.notEqual(lot.bids[0].id,original.id);
 assert.equal(game.viewForPlayer({state,player:{id:buyer.id}}).blackLots[0].myCounter,null);
 assert.equal(act(state,buyer.id,{type:'black_counter_accept',lotId:lot.id,bidId:original.id,counterId:old}).events[0].type,'notice');
 assert.equal(state.blackLots.length,1);
});
