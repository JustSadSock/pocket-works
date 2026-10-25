// Offline-only buyer/seller friction stress model. Not a model of human behaviour.
// Uses real PocketNet game commands and player-specific views, not forged settlements.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import game,{TOTAL_ROUNDS} from '../server/module.ts';

export const PROFILES=Object.freeze({
 cautious:{visit:.30,offer:.48,accept:.38,list:.43,black:.26,barter:.18,inspect:.50,broker:.08,counter:.24},
 mixed:{visit:.65,offer:.70,accept:.60,list:.68,black:.48,barter:.36,inspect:.30,broker:.16,counter:.48},
 active:{visit:.88,offer:.90,accept:.78,list:.85,black:.72,barter:.55,inspect:.12,broker:.28,counter:.67}
});
const keys=['gold','crystals','parts'];
const zero=()=>({gold:0,crystals:0,parts:0});
const gold=n=>({gold:n,crystals:0,parts:0});
const roll=p=>Math.random()<p;
const randomInt=(min,max)=>min+Math.floor(Math.random()*(max-min+1));
function mulberry32(seed){
 let a=seed>>>0;
 return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);
  t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
function start(size){
 const people=Array.from({length:size},(_,i)=>({id:'neg-'+i,name:'Торговец '+i}));
 const {state}=game.createRoom({player:people[0]});
 game.onJoin({state,players:people,player:people[size-1]});
 const result=game.onMessage({state,player:people[0],players:people,payload:{type:'start'}});
 assert.equal(result.events?.[0]?.type,'state');
 assert.equal(state.phase,'play');
 return state;
}
const view=(s,id)=>game.viewForPlayer({state:s,player:{id}});
function send(s,id,payload){
 const result=game.onMessage({state:s,player:{id},payload});
 assert.equal(result.events?.[0]?.type,'state',
  'Unexpected rejected command '+JSON.stringify({id,payload,notice:result.events?.[0]?.payload}));
}
function workType(p){
 const shortage=p.urgent?.status==='pending'&&keys.find(k=>p.resources[k]<(p.urgent.needs[k]||0));
 return shortage||keys.reduce((best,k)=>p.resources[k]/p.quota[k]<p.resources[best]/p.quota[best]?k:best,'gold');
}
function remainingGold(p){
 // A deliberately approximate spending reserve; no access to another user's quota.
 return Math.max(60,Math.min(200,Math.ceil(Math.max(0,p.quota.gold-p.resources.gold)/3)));
}
function checkInvariants(s){
 const found=new Set();
 for(const p of s.contestants){
  assert.ok(keys.every(k=>Number.isInteger(p.resources[k])&&p.resources[k]>=0&&p.resources[k]<=9999));
  const locked=(s.blackLots||[]).filter(l=>l.seller===p.id).length;
  assert.ok(p.items.length+locked<=4,'inventory exceeds four slots including escrow');
  for(const item of p.items){assert.ok(!found.has(item.id),'duplicate item ownership');found.add(item.id);}
 }
 for(const lot of s.blackLots||[]){
  assert.ok(!found.has(lot.item.id),'escrow item belongs to two players');
  found.add(lot.item.id);
 }
}
function candidates(s,sellerId){
 const others=s.contestants.filter(p=>p.id!==sellerId&&!p.bankrupt);
 // Fisher–Yates avoids favouring fixed IDs with an invalid random comparator.
 for(let i=others.length-1;i>0;i--){
  const j=randomInt(0,i);[others[i],others[j]]=[others[j],others[i]];
 }
 return others;
}
function tradePublic(s,me,profile,stats){
 if(!roll(profile.list))return;
 const available=me.items.filter(i=>i.acquiredRound!==s.round);
 if(!available.length)return;
 const item=available[randomInt(0,available.length-1)];
 const ask=randomInt(40,105);
 send(s,me.id,{type:'post',itemId:item.id,ask:gold(ask),pitchId:randomInt(0,6)});
 stats.listings++;
 let accepted=false;
 for(const buyer of candidates(s,me.id)){
  if(!roll(profile.visit))continue;
  stats.visits++;
  if(buyer.items.length>=4){stats.noSpace++;continue;}
  const preview=view(s,buyer.id),listing=preview.listing;
  assert.ok(listing&&listing.seller===me.id);
  const perceived=(listing.rarity==='редкий'?92:72)+randomInt(-25,25);
  if(roll(profile.inspect)&&!preview.you.inspections.some(i=>i.itemId===listing.id)&&buyer.resources.gold>=preview.you.inspectionPrices.public){
   send(s,buyer.id,{type:'inspect'});stats.publicInspections++;
   const result=view(s,buyer.id).you.inspections[0];
   if(result?.curse)stats.cursesDiscovered++;
  }
  if(!roll(profile.offer)||perceived<ask*.66){stats.declined++;continue;}
  const offer=Math.max(1,Math.floor(ask*(.64+Math.random()*.36)));
  if(buyer.resources.gold-offer<remainingGold(buyer)){stats.noLiquidity++;continue;}
  send(s,buyer.id,{type:'bid',offer:gold(offer)});stats.publicOffers++;
  const bid=s.bids.find(b=>b.buyer===buyer.id);
  assert.ok(bid);
  if(offer<Math.min(95,35+randomInt(-8,22))||!roll(profile.accept)){
   stats.sellerRejects++;continue;
  }
  send(s,me.id,{type:'accept',buyer:buyer.id,bidId:bid.id});
  stats.publicSales++;accepted=true;break;
 }
 if(!accepted)stats.unfilledListings++;
}
function tradePrivate(s,me,profile,stats){
 if(!roll(profile.barter)||[2,5,8].includes(s.round)||me.resources.gold<110)return;
 const target=candidates(s,me.id).find(p=>p.resources.crystals>=4&&p.resources.gold<9999);
 if(!target)return;
 const payload={type:'deal_propose',to:target.id,give:gold(randomInt(35,55)),
  want:{gold:0,crystals:randomInt(3,4),parts:0}};
 send(s,me.id,payload);stats.privateOffers++;
 const proposal=s.deals.find(d=>d.from===me.id&&d.to===target.id);
 assert.ok(proposal);
 const theirs=view(s,target.id).deals.find(d=>d.id===proposal.id);
 assert.ok(theirs,'recipient must see addressed deal');
 if(roll(profile.accept)){
  send(s,target.id,{type:'deal_accept',dealId:proposal.id});stats.privateSales++;
 }else{
  send(s,me.id,{type:'deal_cancel',dealId:proposal.id});stats.privateRejects++;
 }
}
function tradeBlack(s,me,profile,stats){
 if(![2,5,8].includes(s.round)||me.blackListedRound===s.round||!roll(profile.black))return;
 const available=me.items.filter(i=>i.acquiredRound!==s.round&&i.id!==s.listing?.itemId);
 if(!available.length)return;
 const item=available[randomInt(0,available.length-1)];
 send(s,me.id,{type:'black_post',itemId:item.id,ask:gold(randomInt(35,100))});
 stats.blackListings++;
 const lot=s.blackLots.find(l=>l.seller===me.id&&l.item.id===item.id);
 assert.ok(lot);
 for(const buyer of candidates(s,me.id)){
  if(!s.blackLots.some(l=>l.id===lot.id))break;
  if(!roll(profile.visit))continue;
  const v=view(s,buyer.id),publicLot=v.blackLots.find(l=>l.id===lot.id);
  assert.ok(publicLot&&!publicLot.mine&&!publicLot.bids.length,
   'anonymous lot must not leak competing offers to buyer');
  assert.equal(v.players.find(p=>p.id===me.id).resources,null,
   'anonymous round must mask seller wallet');
  if(buyer.items.length>=4){stats.noSpace++;continue;}
  if(!roll(profile.offer)){stats.declined++;continue;}
  const ask=publicLot.ask.gold;
  const offer=Math.floor(ask*(.62+Math.random()*.4));
  if(buyer.resources.gold-offer<remainingGold(buyer)){stats.noLiquidity++;continue;}
  if(roll(profile.inspect)&&!publicLot.inspection&&buyer.resources.gold>=v.you.inspectionPrices.black){
   send(s,buyer.id,{type:'black_inspect',lotId:lot.id});stats.blackInspections++;
  }
  send(s,buyer.id,{type:'black_bid',lotId:lot.id,offer:gold(offer)});stats.blackOffers++;
  const bid=lot.bids.find(b=>b.buyer===buyer.id);
  assert.ok(bid);
  if(roll(profile.counter)){
   const counterGold=Math.max(offer+1,Math.floor((offer+ask)/2));
   send(s,me.id,{type:'black_counter',lotId:lot.id,bidId:bid.id,offer:gold(counterGold)});
   stats.counterOffers++;
   const counter=view(s,buyer.id).blackLots.find(l=>l.id===lot.id).myCounter;
   assert.equal(counter.bidId,bid.id);
   if(counterGold<buyer.resources.gold-remainingGold(buyer)&&roll(profile.accept)){
    send(s,buyer.id,{type:'black_counter_accept',lotId:lot.id,bidId:bid.id,counterId:counter.id});
    stats.counterSales++;stats.blackSales++;break;
   }
   stats.counterRejects++;
   continue;
  }
  if(offer>=35&&roll(profile.accept)){
   send(s,me.id,{type:'black_accept',lotId:lot.id,bidId:bid.id});
   stats.blackSales++;break;
  }
  stats.sellerRejects++;
 }
}
function oneGame(size,profile,stats){
 const s=start(size);
 let steps=0;
 while(s.phase==='play'){
  assert.ok(steps++<=TOTAL_ROUNDS*size+size,'game must terminate');
  const me=s.contestants[s.turnIndex];
  if(!me.bankrupt){
   send(s,me.id,{type:'work',resource:workType(me)});stats.work++;
   tradePublic(s,me,profile,stats);
   tradePrivate(s,me,profile,stats);
   tradeBlack(s,me,profile,stats);
   if(s.brokerOffer&&me.items.length<4&&me.resources.gold>=180&&roll(profile.broker)){
    send(s,me.id,{type:'broker_buy'});stats.brokerSales++;
   }
  }
  checkInvariants(s);
  send(s,me.id,{type:'end'});
  checkInvariants(s);
 }
 assert.equal(s.round,TOTAL_ROUNDS+1);
 assert.equal(s.ranking.length,size);
 assert.deepEqual(s.ranking.map(p=>p.place),Array.from({length:size},(_,i)=>i+1));
 for(const p of s.contestants){
  const r=s.ranking.find(x=>x.id===p.id);
  stats.players++;
  stats.completed+=Number(r.complete&&!p.bankrupt);
  stats.bankrupt+=Number(p.bankrupt);
 }
}
const countKeys=['work','listings','visits','declined','noSpace','noLiquidity',
 'publicOffers','sellerRejects','publicSales','unfilledListings','privateOffers',
 'privateSales','privateRejects','blackListings','blackOffers','blackSales',
 'blackInspections','publicInspections','cursesDiscovered','counterOffers',
 'counterSales','counterRejects','brokerSales','players','completed','bankrupt'];
export function runNegotiationAudit({seed=0xB4A22027,trials=24}={}){
 assert.ok(Number.isInteger(seed)&&seed>=0&&seed<=0xFFFFFFFF);
 assert.ok(Number.isInteger(trials)&&trials>=1&&trials<=1000);
 const previous=Math.random;
 try{
  Math.random=mulberry32(seed);
  const report={seed:seed.toString(16),trialsPerScenario:trials,games:0,
   disclaimer:'Scripted negotiation friction is not an estimate of human behaviour or game balance.',
   profiles:{}};
  for(const [name,profile] of Object.entries(PROFILES)){
   const scenarios={};
   for(let size=2;size<=6;size++){
    const stats=Object.fromEntries(countKeys.map(k=>[k,0]));
    for(let i=0;i<trials;i++){oneGame(size,profile,stats);report.games++;}
    assert.equal(stats.players,size*trials);
    assert.ok(stats.publicSales<=stats.publicOffers);
    assert.ok(stats.blackSales<=stats.blackOffers);
    assert.ok(stats.privateSales<=stats.privateOffers);
    assert.equal(stats.publicSales+stats.unfilledListings,stats.listings);
    stats.completionPercent=Number((stats.completed*100/stats.players).toFixed(1));
    stats.bankruptcyPercent=Number((stats.bankrupt*100/stats.players).toFixed(1));
    stats.publicConversionPercent=stats.publicOffers?Number((stats.publicSales*100/stats.publicOffers).toFixed(1)):null;
    scenarios[size]=stats;
   }
   report.profiles[name]=scenarios;
  }
  assert.equal(report.games,trials*15);
  assert.ok(report.profiles.mixed[4].unfilledListings>0,'friction scenarios must include unsold goods');
  assert.ok(report.profiles.mixed[4].publicSales>0,'negotiations must include completed deals');
  assert.ok(report.profiles.mixed[4].publicOffers>report.profiles.mixed[4].publicSales,
   'negotiations must not force every submitted bid into a sale');
  return report;
 }finally{Math.random=previous;}
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const report=runNegotiationAudit({trials:80});
 const path=process.env.BAZAAR_NEGOTIATION_OUTPUT;
 if(path){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(report,null,2)+'\n');}
 console.log('BAZAAR_NEGOTIATION_AUDIT '+JSON.stringify(report));
}
