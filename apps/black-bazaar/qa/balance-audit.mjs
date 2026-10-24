// Repeatable economic audit. NEVER used in production: the seeded RNG is local to QA.
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import game,{TOTAL_ROUNDS} from '../server/module.ts';

const resources=['gold','crystals','parts'];
function mulberry32(seed){
 let a=seed>>>0;
 return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);
  t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
const players=n=>Array.from({length:n},(_,i)=>({id:'bot-'+i,name:'Бот '+i}));
function start(n){
 const people=players(n),{state}=game.createRoom({player:people[0]});
 game.onJoin({state,players:people,player:people[n-1]});
 const start=game.onMessage({state,player:people[0],players:people,payload:{type:'start'}});
 assert.equal(start.events[0]?.type,'state');
 assert.equal(state.contestants.length,n);
 assert.equal(state.phase,'play');
 return state;
}
const command=(s,id,payload)=>game.onMessage({state:s,player:{id},payload}).events?.[0]?.type==='state';
const sum=(a,b)=>a+b;
function chooseWork(p){
 const urgent=p.urgent?.status==='pending'&&resources.find(k=>p.resources[k]<(p.urgent.needs[k]||0));
 return urgent||resources.slice().sort((a,b)=>p.resources[a]/p.quota[a]-p.resources[b]/p.quota[b])[0];
}
function play(size,policy,quotaShift=0){
 const s=start(size);
 // Counterfactual QA only: rotate the same quota set independently from seats.
 // Production rooms always use shift=0, so this does not change game rules.
 assert.ok(Number.isInteger(quotaShift)&&quotaShift>=0&&quotaShift<size);
 const originalQuotas=s.contestants.map(p=>({...p.quota}));
 s.contestants.forEach((p,i)=>{p.quota={...originalQuotas[(i+quotaShift)%size]};});
 const members=new Map(s.contestants.map((p,i)=>[p.id,i]));
 let steps=0,marketDeals=0,brokers=0,work=0;
 while(s.phase==='play'){
  assert.ok(steps++<=TOTAL_ROUNDS*size+size,'simulated game must terminate');
  const me=s.contestants[s.turnIndex],position=members.get(me.id);
  if(!me.bankrupt){
   work+=Number(command(s,me.id,{type:'work',resource:chooseWork(me)}));
   if(policy==='market'){
    const item=me.items.find(x=>x.acquiredRound!==s.round);
    const others=Array.from({length:size-1},(_,offset)=>s.contestants[(position+offset+1)%size]);
    const buyer=others.find(p=>!p.bankrupt&&p.items.length<4&&p.resources.gold>=25);
    if(item&&buyer&&!s.listing&&command(s,me.id,{type:'post',itemId:item.id,ask:{gold:30}})){
     if(command(s,buyer.id,{type:'bid',offer:{gold:25}})){
      const bid=s.bids.find(b=>b.buyer===buyer.id);
      if(bid)marketDeals+=Number(command(s,me.id,{type:'accept',buyer:buyer.id,bidId:bid.id}));
     }
    }
   }else if(policy==='broker'){
    if(me.items.length<4&&me.resources.gold>=170&&s.brokerOffer)
     brokers+=Number(command(s,me.id,{type:'broker_buy'}));
    if(!me.usedPawn&&me.items.length>=3&&me.resources.parts<5){
     const old=me.items.find(i=>i.acquiredRound!==s.round);
     if(old)command(s,me.id,{type:'salvage',itemId:old.id});
    }
   }
  }
  assert.ok(command(s,me.id,{type:'end'}),'active player must be able to end the turn');
 }
 assert.equal(s.round,TOTAL_ROUNDS+1);
 assert.equal(s.ranking.length,size);
 assert.equal(s.contestants.length,size);
 const results=s.contestants.map(p=>{
  const rank=s.ranking.find(x=>x.id===p.id);
  assert.ok(rank);
  return {rank:rank.place,bankrupt:p.bankrupt,complete:rank.complete&&!p.bankrupt,
   quotas:resources.map(k=>p.resources[k]>=p.quota[k]),
   ratios:resources.map(k=>p.resources[k]/p.quota[k]),
   slot:members.get(p.id),quotaSlot:(members.get(p.id)+quotaShift)%size};
 });
 return {results,marketDeals,brokers,work};
}
function sampleReport(){
 const original=Math.random;
 try{
  Math.random=mulberry32(0xB4A22026);
  const count=3600,seats=6,distribution=Array(seats).fill(0);
  for(let i=0;i<count;i++){
   const state=start(seats);
   const index=state.contestants.findIndex(p=>p.id==='bot-0');
   distribution[index]++;
  }
  const expected=count/seats,range=expected*.17;
  for(const amount of distribution)assert.ok(Math.abs(amount-expected)<range,
   'pregame seating must be statistically fair: '+JSON.stringify(distribution));
  const result={seed:'B4A22026',pregame:{trials:count,player0BySlot:distribution,expected},
   styles:{},totalGames:0,totalPlayers:0,note:'Bots are not humans; this is a regression audit, not a predicted human win rate.'};
  for(const policy of ['focus','market','broker']){
   result.styles[policy]={};
   for(const size of [2,3,4,5,6]){
    const rounds=80,stat={games:rounds,players:0,completed:0,bankrupt:0,
     firstPlace:[],quotaCompleted:[0,0,0],quotaRatio:[0,0,0],
     rankBySlot:Array(size).fill(0),winsBySlot:Array(size).fill(0),
     publicTrades:0,brokerPurchases:0,workActions:0};
    for(let i=0;i<rounds;i++){
     const match=play(size,policy);
     stat.publicTrades+=match.marketDeals;stat.brokerPurchases+=match.brokers;stat.workActions+=match.work;
     for(const p of match.results){
      stat.players++;stat.completed+=Number(p.complete);stat.bankrupt+=Number(p.bankrupt);
      if(p.rank===1){stat.firstPlace.push(p.slot);stat.winsBySlot[p.slot]++;}
      stat.rankBySlot[p.slot]+=p.rank;
      for(let k=0;k<3;k++){stat.quotaCompleted[k]+=Number(p.quotas[k]);stat.quotaRatio[k]+=p.ratios[k];}
     }
    }
    assert.equal(stat.players,size*rounds);
    assert.equal(stat.firstPlace.length,rounds);
    stat.completionRate=Number((100*stat.completed/stat.players).toFixed(1));
    stat.bankruptcyRate=Number((100*stat.bankrupt/stat.players).toFixed(1));
    stat.quotaCompletion=stat.quotaCompleted.map(v=>Number((v/stat.players*100).toFixed(1)));
    stat.meanQuotaRatio=stat.quotaRatio.map(v=>Number((v/stat.players).toFixed(2)));
    stat.averageRankBySlot=stat.rankBySlot.map(v=>Number((v/rounds).toFixed(2)));
    delete stat.firstPlace;delete stat.rankBySlot;delete stat.quotaRatio;
    result.styles[policy][size]=stat;result.totalGames+=rounds;result.totalPlayers+=stat.players;
   }
  }
  assert.equal(result.totalGames,1200);
  // In live play, quota index equals turn-order slot. That confounds the
  // baseline ranking data: it cannot show WHICH factor caused an advantage.
  // Diagnose the factors by rotating existing quota assignments across seats
  // in QA-only matches. 120 trials are divisible by every supported size 2..6.
  result.counterfactual={
   purpose:'Isolate quota advantage from first-player advantage; QA-only, not live game rules',
   games:0,styles:{},note:'The rotated-quota scenarios are experiments, not predicted human outcomes.'
  };
  const percent=(count,total)=>Number((100*count/total).toFixed(1));
  const means=(values,count)=>values.map(v=>Number((v/count).toFixed(2)));
  for(const policy of ['focus','market','broker']){
   result.counterfactual.styles[policy]={};
   for(const size of [2,3,4,5,6]){
    const trials=120,seatRank=Array(size).fill(0),quotaRank=Array(size).fill(0);
    const seatWins=Array(size).fill(0),quotaWins=Array(size).fill(0);
    const quotaComplete=Array(size).fill(0),quotaBankrupt=Array(size).fill(0);
    const cross=Array.from({length:size},()=>Array(size).fill(0));
    for(let i=0;i<trials;i++){
     const match=play(size,policy,i%size);
     for(const p of match.results){
      seatRank[p.slot]+=p.rank;quotaRank[p.quotaSlot]+=p.rank;
      seatWins[p.slot]+=Number(p.rank===1);
      quotaWins[p.quotaSlot]+=Number(p.rank===1);
      quotaComplete[p.quotaSlot]+=Number(p.complete);
      quotaBankrupt[p.quotaSlot]+=Number(p.bankrupt);
      cross[p.slot][p.quotaSlot]++;
     }
    }
    // Exactly 120 observations for each seat and each quota, with every
    // seat/quota pairing occurring the same number of times.
    for(const row of cross){
     for(const n of row)assert.equal(n,trials/size,'unbalanced counterfactual seat/quota pairing');
    }
    assert.equal(seatWins.reduce(sum,0),trials);
    assert.equal(quotaWins.reduce(sum,0),trials);
    result.counterfactual.styles[policy][size]={
     games:trials,quotaSeatPairingsPerCell:trials/size,
     firstPlaceRateBySeat:seatWins.map(v=>percent(v,trials)),
     firstPlaceRateByQuota:quotaWins.map(v=>percent(v,trials)),
     averageRankBySeat:means(seatRank,trials),
     averageRankByQuota:means(quotaRank,trials),
     completionRateByQuota:quotaComplete.map(v=>percent(v,trials)),
     bankruptcyRateByQuota:quotaBankrupt.map(v=>percent(v,trials))
    };
    result.counterfactual.games+=trials;
   }
  }
  assert.equal(result.counterfactual.games,1800);
  assert.ok(result.styles.market['4'].publicTrades>0,'market bot must exercise public trades');
  assert.ok(result.styles.broker['4'].brokerPurchases>0,'broker bot must exercise broker purchases');
  return result;
 }finally{Math.random=original;}
}
const result=sampleReport();
const path=process.env.BAZAAR_BALANCE_OUTPUT;
if(path){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(result,null,2)+'\n');}
console.log('BAZAAR_BALANCE_AUDIT '+JSON.stringify(result));
