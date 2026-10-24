// Incoming Bazaar offers are derived solely from the player's private PocketNet view.
// No seller or bidder identity may be inferred from the anonymous market.
export function incomingOffers(state){
 if(!state||state.phase!=='play'||!state.you||state.you.bankrupt)return [];
 const me=state.you.id;
 const names=new Map((state.players||[]).map(p=>[p.id,p.name||p.character||'Игрок']));
 const offers=[];
 for(const deal of state.deals||[]){
  if(deal.to!==me)continue;
  offers.push({key:'deal:'+deal.id,kind:'deal',section:'deals',
   title:'Предложение от '+(names.get(deal.from)||'игрока'),
   detail:'Ответить на обмен',targetId:''});
 }
 if(state.blackMarket){
  for(const lot of state.blackLots||[]){
   if(lot.mine||!lot.myBid||!lot.myCounter?.id)continue;
   offers.push({key:'black:'+lot.id+':'+lot.myCounter.id,kind:'black',section:'market',
    title:'Посредник предлагает другую цену',
    detail:'Открыть закрытый торг',targetId:'bazaar-counter-'+lot.id});
  }
 }
 return offers;
}
export function unreadOfferCount(offers,seen,roomId,kind){
 return offers.filter(offer=>(!kind||offer.kind===kind)&&!seen.has(roomId+':'+offer.key)).length;
}
export function bestInboxOffer(offers,seen,roomId){
 return offers.find(offer=>!seen.has(roomId+':'+offer.key))||offers[0]||null;
}
