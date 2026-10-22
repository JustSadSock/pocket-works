// ЧЁРНАЯ БАРАХОЛКА / mechanical alpha.
// Authoritative rules. Secrets are only exposed through viewForPlayer.
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const TOTAL_ROUNDS = 9;
export const RESOURCES = ['gold','crystals','parts'];
const CHARACTERS = ['Волшебник','Мак','Слайм','Мимик','Ведьма','Жабий барон'];
// Each quota is about 6.4–7.0 additional work-equivalent units
// above the same 250 gold / 20 crystal / 3 parts starting wallet.
// Different players NEED different things, without unequal total effort.
const QUOTAS = [
  {gold:430,crystals:26,parts:3},
  {gold:300,crystals:36,parts:4},
  {gold:340,crystals:28,parts:5},
  {gold:390,crystals:32,parts:3},
  {gold:315,crystals:34,parts:4},
  {gold:370,crystals:30,parts:4}
];
const GOODS = [
  {key:'frog',name:'Золотая жаба',rarity:'редкий',variants:[
    [{type:'crystals',value:6},{type:'goldPercent',value:18}],
    [{type:'gold',value:42},{type:'parts',value:1}]
  ]},
  {key:'pig',name:'Жадная копилка',rarity:'обычный',variants:[
    [{type:'gold',value:36},{type:'crystals',value:3}],
    [{type:'gold',value:25},{type:'parts',value:1}]
  ]},
  {key:'spider',name:'Паук-механик',rarity:'обычный',variants:[
    [{type:'parts',value:1},{type:'gold',value:18}],
    [{type:'parts',value:1},{type:'crystals',value:4}]
  ]},
  {key:'crown',name:'Корона должника',rarity:'редкий',variants:[
    [{type:'gold',value:62},{type:'crystals',value:5}],
    [{type:'gold',value:45},{type:'parts',value:1}]
  ]},
  {key:'mimic',name:'Сундук-мимик',rarity:'обычный',variants:[
    [{type:'crystals',value:8},{type:'gold',value:33}],
    [{type:'gold',value:52},{type:'crystals',value:5}]
  ]},
  {key:'cat',name:'Кот неудачи',rarity:'редкий',variants:[
    [{type:'parts',value:1},{type:'crystals',value:6}],
    [{type:'crystals',value:7},{type:'goldPercent',value:12}]
  ]},
  {key:'mirror',name:'Зеркало зависти',rarity:'редкий',variants:[
    [{type:'crystals',value:7},{type:'gold',value:24}],
    [{type:'gold',value:55},{type:'crystals',value:4}]
  ]},
  {key:'gear',name:'Медная шестерня',rarity:'обычный',variants:[
    [{type:'parts',value:1},{type:'gold',value:12}],
    [{type:'gold',value:29},{type:'crystals',value:2}]
  ]},
  {key:'lens',name:'Око рынка',rarity:'обычный',variants:[
    [{type:'crystals',value:5},{type:'gold',value:12}],
    [{type:'gold',value:32},{type:'crystals',value:3}]
  ]},
  {key:'mushroom',name:'Гриб прибыли',rarity:'обычный',variants:[
    [{type:'gold',value:50},{type:'parts',value:1}],
    [{type:'crystals',value:9},{type:'gold',value:28}]
  ]},
  {key:'hourglass',name:'Песочные часы',rarity:'редкий',variants:[
    [{type:'gold',value:48},{type:'crystals',value:6}],
    [{type:'crystals',value:9},{type:'parts',value:1}]
  ]},
  {key:'amulet',name:'Амулет расчёта',rarity:'обычный',variants:[
    [{type:'crystals',value:5},{type:'goldPercent',value:8}],
    [{type:'gold',value:30},{type:'crystals',value:2}]
  ]}
];
// Each pair is [positive effect, upkeep]. The second entry is ALWAYS a cost.
// Extra hidden traits belong to VARIANT ZERO of selected kinds; they persist
// on the artifact instance across public sales, private barter and escrow.
const TRAITS = {
  frog:{kind:'curse',title:'Алчность жабы',effect:{type:'goldPercent',value:30},delay:2},
  hourglass:{kind:'curse',title:'Последний песок',effect:{type:'parts',value:2},delay:2},
  amulet:{kind:'ward',title:'Печать отсрочки',charges:1},
  mirror:{kind:'sellerBonus',title:'Эхо перепродажи',effect:{type:'crystals',value:3}},
  lens:{kind:'appraisal',title:'Зоркий торговец',publicCost:8,blackCost:15}
};
function trait(item){return item.variant===0?TRAITS[item.key]||null:null;}
function inspectCurse(item){
  const t=trait(item);
  return t?.kind==='curse'?{
    title:t.title,effect:{...t.effect},dueRound:item.curseDueRound??null,
    resolved:item.curseResolved===true
  }:null;
}
function privateTrait(item){
  const t=trait(item);
  if(!t)return null;
  if(t.kind==='curse')return {kind:'curse',...inspectCurse(item)};
  if(t.kind==='ward')return {kind:'ward',title:t.title,charges:item.wardCharges??1};
  if(t.kind==='sellerBonus')return {kind:'sellerBonus',title:t.title,effect:{...t.effect},lastRound:item.tradeUsedRound||0};
  return {kind:'appraisal',title:t.title,publicCost:t.publicCost,blackCost:t.blackCost};
}
function inspectionCost(p,black=false,s=null){
  const haveLens=p.items.some(i=>trait(i)?.kind==='appraisal');
  const normal=haveLens?(black?TRAITS.lens.blackCost:TRAITS.lens.publicCost):
    (black?BLACK_INSPECTION_GOLD:15);
  return s&&eventIs(s,'audit_fair')?Math.ceil(normal/2):normal;
}
// Each item starts with a full two-round delayed fuse. Buying or disguising
// it never changes the due round. No second activation after it fires.

const MAX_ITEMS = 4;
const BLACK_ROUNDS = [2,5,8];
const DISGUISES = ['Талисман достатка','Забытый сувенир','Тёмная реликвия','Дар неизвестного'];
const MARKET_COMMISSION = .10;
// A public event lasts a whole round, so it affects all seats equally.
// Event assignment is decided once when a match starts and never changes
// on reconnect, turn expiry, or a module reload.
const EVENT_CARDS={
  salvage_boom:{title:'Ярмарка запчастей',description:'Разбор старого предмета приносит 3 детали вместо 2.'},
  mask_festival:{title:'Бал масок',description:'Перепаковка стоит 10 золота и не требует деталей.'},
  smuggler_holiday:{title:'Ночь контрабандистов',description:'Комиссия анонимного рынка снижена с 10% до 5%.'},
  audit_fair:{title:'День экспертов',description:'Экспертиза стоит вдвое меньше (округление вверх).'}
};
const eventId=s=>s.eventSchedule?.[s.round]||null;
const eventIs=(s,id)=>eventId(s)===id;
const eventCard=s=>{const id=eventId(s);return id?{id,...EVENT_CARDS[id]}:null;};
const blackFee=s=>eventIs(s,'smuggler_holiday') ? 0.05 : MARKET_COMMISSION;
const salvageYield=s=>eventIs(s,'salvage_boom')?3:2;
const repackPrice=s=>eventIs(s,'mask_festival')?{gold:10,parts:0}:{gold:REPACK_GOLD,parts:REPACK_PARTS};
const increment=(s,key)=>{if(s.metrics)s.metrics[key]=(s.metrics[key]||0)+1;};

const BLACK_INSPECTION_GOLD = 25;
const REPACK_GOLD = 20;
const REPACK_PARTS = 1;
const turnDurationMs = seats => seats<=2?90_000:seats<=4?80_000:65_000;
const isBlackRound = s => s.phase==='play' && BLACK_ROUNDS.includes(s.round);
const itemLocked = (s,id) => s.blackLots?.some(l=>l.item.id===id) || s.listing?.itemId===id;
const inventoryCount = (s,p) => p.items.length+(s.blackLots||[]).filter(l=>l.seller===p.id).length;

const sample = xs => xs[Math.floor(Math.random()*xs.length)];
const shuffled = xs => [...xs].sort(()=>Math.random()-.5);
const zero = () => ({gold:0,crystals:0,parts:0});
const clampInt = (value,max=2000) => Number.isInteger(value)&&value>=0&&value<=max?value:null;
function wallet(input){
  if(!input||typeof input!=='object'||Array.isArray(input))return null;
  const out={};
  for(const key of RESOURCES){const value=clampInt(input[key]??0);if(value===null)return null;out[key]=value;}
  return out;
}
const has = (p,c) => RESOURCES.every(k=>p.resources[k]>=c[k]);
const nonzero = w => RESOURCES.some(k=>w[k]>0);
const add = (p,w,mult=1) => {for(const k of RESOURCES)p.resources[k]=Math.max(0,Math.min(9999,p.resources[k]+w[k]*mult));};
function issue(s,message){s.log.unshift(message);s.log=s.log.slice(0,18);}
function newItem(s){
  const kind=sample(GOODS),variant=Math.floor(Math.random()*kind.variants.length);
  const item={id:'item-'+(++s.serial),key:kind.key,variant,acquiredRound:0,history:[]};
  const t=trait(item);
  if(t?.kind==='curse'){item.curseDueRound=(s.round||1)+t.delay;item.curseResolved=false;}
  if(t?.kind==='ward')item.wardCharges=t.charges;
  return item;
}
function spec(item){
  const def=GOODS.find(x=>x.key===item.key);
  const pair=def.variants[item.variant]||def.variants[0];
  return {name:def.name,rarity:def.rarity,positive:pair[0],negative:pair[1]};
}
function publicItem(item){const d=spec(item);return {id:item.id,name:item.alias||d.name,rarity:d.rarity};}
function privateItem(item){return {...publicItem(item),originalName:spec(item).name,disguised:!!item.alias,positive:spec(item).positive,negative:spec(item).negative,special:privateTrait(item),acquiredRound:item.acquiredRound,history:item.history};}
function balance(p){
  return RESOURCES.reduce((sum,k)=>sum+Math.min(1,p.resources[k]/p.quota[k]),0)/3;
}
function rankPlayers(s){
  const rows=s.contestants.map(p=>({
    id:p.id,name:p.name,character:p.character,
    complete:RESOURCES.every(k=>p.resources[k]>=p.quota[k]),bankrupt:p.bankrupt,
    progress:Math.round(balance(p)*1000)/10,
    wealth:p.resources.gold+8*p.resources.crystals+70*p.resources.parts
  }));
  rows.sort((a,b)=>Number(a.bankrupt)-Number(b.bankrupt)||Number(b.complete)-Number(a.complete)||b.progress-a.progress||b.wealth-a.wealth||a.id.localeCompare(b.id));
  // A rare bond can claim second place, but cannot dethrone its target.
  if(rows.length>=3 && rows[0]&&!rows[0].bankrupt){
    const bonded=s.contestants.find(p=>p.legendary===rows[0].id&&!p.bankrupt&&p.id!==rows[0].id);
    if(bonded){const i=rows.findIndex(p=>p.id===bonded.id);if(i>1)rows.splice(1,0,rows.splice(i,1)[0]);}
  }
  return rows.map((r,i)=>({...r,place:i+1}));
}
// Equal urgency burden measured in the number of ordinary work actions:
 // round 3 = two actions, round 6 = three, round 9 = four.
 // Each player gets all three currency categories exactly once (permuted).
function urgentFor(round,player){
  const tier=Math.floor(round/3);
  const category=RESOURCES[(player.urgentOffset+tier-1)%RESOURCES.length];
  const workUnits=tier+1;
  return {
    gold:category==='gold'?35*workUnits:0,
    crystals:category==='crystals'?4*workUnits:0,
    parts:category==='parts'?workUnits:0
  };
}
function startTurn(s){
  if(s.round> TOTAL_ROUNDS){s.phase='done';s.deadlineAt=null;s.ranking=rankPlayers(s);issue(s,'Партия окончена. Итоги подсчитаны.');return;}
  const p=s.contestants[s.turnIndex];
  s.deadlineAt=Date.now()+turnDurationMs(s.contestants.length);
  p.worked=false;p.usedPawn=false;p.marketDeals=0;
  s.listing=null;s.bids=[];
  s.brokerOffer=newItem(s);
  p.urgent=(s.round%3===0&&!p.bankrupt)?{needs:urgentFor(s.round,p),status:'pending'}:null;
  if(s.turnIndex===0&&eventCard(s))issue(s,'Событие раунда: '+eventCard(s).title+'. '+eventCard(s).description);
  issue(s,'Раунд '+s.round+': ход игрока '+p.character+'.');
}
function openGame(s){
  s.phase='play';s.round=1;s.turnIndex=0;s.serial=0;s.ranking=[];
  const middle=shuffled(['salvage_boom','mask_festival']);
  s.eventSchedule={4:middle[0],6:middle[1],8:sample(['smuggler_holiday','audit_fair'])};
  s.metrics={publicSales:0,privateDeals:0,blackSales:0,inspections:0,brokerSales:0,
    salvage:0,repack:0,urgentMet:0,urgentMissed:0,wardUsed:0,curseFired:0};
  s.contestants=s.players.map((p,i)=>{
    const targets=s.players.filter(x=>x.id!==p.id).map(x=>x.id);
    const plus=sample(targets),minus=sample(targets);
    return {id:p.id,name:p.name,character:CHARACTERS[i],resources:{gold:250,crystals:20,parts:3},quota:{...QUOTAS[i]},
      items:[newItem(s),newItem(s)],urgentOffset:Math.floor(Math.random()*RESOURCES.length),
      positiveTarget:plus,negativeTarget:minus,
      legendary:null,positiveUsed:0,negativeUsed:0,urgent:null,strikes:0,bankrupt:false,
      worked:false,usedPawn:false,marketDeals:0,blackListedRound:0,inspections:[],blackInspections:[]};
  });
  if(s.contestants.length>=3 && Math.random()<.04){
    const lucky=sample(s.contestants),partner=sample(s.contestants.filter(p=>p.id!==lucky.id));
    lucky.legendary=partner.id;
  }
  s.listing=null;s.bids=[];s.brokerOffer=null;s.deals=[];s.dealSerial=0;s.blackLots=[];s.blackSeq=0;s.log=[];startTurn(s);
}
function resolveUrgent(s,p){
  if(!p.urgent)return;
  const needed=p.urgent.needs;
  if(has(p,needed)){
    add(p,needed,-1);add(p,{gold:35,crystals:0,parts:0});p.urgent.status='success';increment(s,'urgentMet');
    issue(s,p.character+' выполнил срочный заказ.');
  }else{
    // An unspent amulet charge protects the entire urgent failure once.
    // The quota resources are NOT collected, and the urgent reward is NOT paid.
    const guard=p.items.find(i=>trait(i)?.kind==='ward'&&(i.wardCharges??1)>0);
    if(guard){
      guard.wardCharges=(guard.wardCharges??1)-1;increment(s,'wardUsed');
      p.urgent.status='shielded';
      issue(s,p.character+' избежал штрафа по срочному заказу: защитная печать разряжена.');
      return;
    }
    p.strikes++;p.urgent.status='failed';increment(s,'urgentMissed');
    if(p.strikes===1)p.resources.gold-=Math.floor(p.resources.gold*.15);
    else if(p.strikes===2){if(p.items.length)p.items.splice(Math.floor(Math.random()*p.items.length),1);else p.resources.parts=Math.max(0,p.resources.parts-1);}
    else p.bankrupt=true;
    issue(s,p.character+' провалил срочный заказ: штраф '+p.strikes+'/3.');
  }
}
function applyEffect(p,fx,sign){
  if(fx.type==='goldPercent'){p.resources.gold=Math.max(0,p.resources.gold-Math.floor(p.resources.gold*fx.value/100));return;}
  const key=fx.type;
  if(!RESOURCES.includes(key))return;
  p.resources[key]=Math.max(0,Math.min(9999,p.resources[key]+sign*fx.value));
}
function roundIncome(s){
  for(const p of s.contestants){
    if(p.bankrupt)continue;
    // Maintenance is reserved before income. An unaffordable item
    // is inactive for this payout (neither income nor upkeep).
    const budget={...p.resources},active=[];
    for(const item of p.items){
      const upkeep=spec(item).negative;
      const key=upkeep.type==='goldPercent'?'gold':upkeep.type;
      const cost=upkeep.type==='goldPercent'
        ?Math.floor(budget.gold*upkeep.value/100):upkeep.value;
      if(!RESOURCES.includes(key)||budget[key]<cost)continue;
      budget[key]-=cost;active.push(item);
    }
    for(const key of RESOURCES)p.resources[key]=budget[key];
    for(const item of active)applyEffect(p,spec(item).positive,+1);
    // Curses remain attached to an item, even if its upkeep is unaffordable.
    for(const item of p.items){
      const t=trait(item);
      if(t?.kind==='curse'&&!item.curseResolved&&s.round>=(item.curseDueRound??Infinity)){
        applyEffect(p,t.effect,-1);
        item.curseResolved=true;increment(s,'curseFired');
        issue(s,'Проклятие «'+t.title+'» ударило по '+p.character+'.');
      }
    }
  }
  issue(s,'Итоги раунда '+s.round+': свойства предметов сработали.');
}
function closeBlackMarket(s){
  for(const lot of s.blackLots||[]){
    const seller=getPlayer(s,lot.seller);
    if(seller){seller.items.push(lot.item);}
  }
  if(s.blackLots?.length)issue(s,'Анонимный рынок завершён: непроданные товары возвращены владельцам.');
  s.blackLots=[];
}
function nextTurn(s){
  const p=s.contestants[s.turnIndex];
  if(!p.bankrupt)resolveUrgent(s,p);
  s.listing=null;s.bids=[];
  s.turnIndex++;
  if(s.turnIndex===s.contestants.length){
    if(isBlackRound(s))closeBlackMarket(s);
    roundIncome(s);s.turnIndex=0;s.round++;s.deals=[];
  }
  startTurn(s);
  // Forfeited/bankrupt seats must never block the remaining players.
  if(s.phase==='play'&&s.contestants[s.turnIndex].bankrupt)nextTurn(s);
}
function applyRelationship(s,seller,buyer){
  if(buyer.positiveTarget===seller.id && buyer.positiveUsed!==s.round){
    buyer.resources.crystals=Math.min(9999,buyer.resources.crystals+3);buyer.positiveUsed=s.round;
  }
  if(seller.negativeTarget===buyer.id && seller.negativeUsed!==s.round){
    buyer.resources.gold=Math.max(0,buyer.resources.gold-20);seller.negativeUsed=s.round;
  }
}
function awardSaleTrait(s,seller,item,anonymous=false){
  const t=trait(item);
  if(t?.kind==='sellerBonus'&&item.tradeUsedRound!==s.round){
    add(seller,{gold:0,crystals:t.effect.value,parts:0});
    item.tradeUsedRound=s.round;
    // An anonymous sale must not identify its seller through the public log.
    if(!anonymous)issue(s,'Эхо перепродажи принесло '+seller.character+' +'+t.effect.value+' кристалла.');
  }
}
function transferItem(s,seller,buyer,item){
  const index=seller.items.findIndex(x=>x.id===item.id);
  if(index<0)return false;
  seller.items.splice(index,1);
  item.history.push(seller.id);item.acquiredRound=s.round;buyer.items.push(item);
  // Offers referencing a transferred item are no longer valid.
  s.deals=s.deals.filter(d=>d.giveItemId!==item.id&&d.wantItemId!==item.id);
  awardSaleTrait(s,seller,item);
  applyRelationship(s,seller,buyer);
  return true;
}
function onTrade(s,seller,buyer,item,price){
  if(inventoryCount(s,buyer)>=MAX_ITEMS||!has(buyer,price)||item.acquiredRound===s.round)return false;
  if(!seller.items.some(x=>x.id===item.id))return false;
  add(buyer,price,-1);add(seller,price,+1);
  transferItem(s,seller,buyer,item);
  seller.marketDeals++;increment(s,'publicSales');
  // The first public sale pays one reusable spare part: trading generates
  // supply, rather than leaving parts dependent only on grinding a work action.
  if(seller.marketDeals===1)seller.resources.parts=Math.min(9999,seller.resources.parts+1);
  issue(s,buyer.character+' купил «'+spec(item).name+'» у '+seller.character+
    (seller.marketDeals===1?' (продавец получил 1 деталь за первую продажу).':'')+'.');
  return true;
}
function dealValidItem(s,p,itemId){
  if(itemId===null)return true;
  const item=p.items.find(x=>x.id===itemId);
  return !!item&&item.acquiredRound!==s.round&&s.listing?.itemId!==itemId;
}
function dealItem(p,itemId){
  return itemId===null?null:p.items.find(x=>x.id===itemId)||null;
}
function validItemId(id){
  return id===null||typeof id==='string'&&/^item-[1-9][0-9]*$/.test(id);
}
function validateDealPayload(s,sender,target,v){
  const give=wallet(v.give),want=wallet(v.want),giveItemId=v.giveItemId??null,wantItemId=v.wantItemId??null;
  if(!give||!want||!validItemId(giveItemId)||!validItemId(wantItemId)||
      !(nonzero(give)||nonzero(want)||giveItemId||wantItemId))return null;
  const proposal={from:sender.id,to:target.id,give,want,giveItemId,wantItemId,round:s.round};
  return dealAvailable(s,proposal)?proposal:null;
}
function dealAvailable(s,deal){
  const from=s.contestants.find(p=>p.id===deal.from),to=s.contestants.find(p=>p.id===deal.to);
  if(!from||!to||from.bankrupt||to.bankrupt)return false;
  if(!has(from,deal.give)||!has(to,deal.want))return false;
  if(!dealValidItem(s,from,deal.giveItemId)||!dealValidItem(s,to,deal.wantItemId))return false;
  const fromCount=inventoryCount(s,from)-Number(deal.giveItemId!==null)+Number(deal.wantItemId!==null);
  const toCount=inventoryCount(s,to)-Number(deal.wantItemId!==null)+Number(deal.giveItemId!==null);
  return fromCount<=MAX_ITEMS&&toCount<=MAX_ITEMS;
}
function acceptDeal(s,deal){
  if(!dealAvailable(s,deal))return false;
  const from=s.contestants.find(p=>p.id===deal.from),to=s.contestants.find(p=>p.id===deal.to);
  const a=dealItem(from,deal.giveItemId),b=dealItem(to,deal.wantItemId);
  add(from,deal.give,-1);add(to,deal.want,-1);
  add(to,deal.give);add(from,deal.want);
  if(a)transferItem(s,from,to,a);
  if(b)transferItem(s,to,from,b);
  s.deals=s.deals.filter(d=>d.id!==deal.id);increment(s,'privateDeals');
  issue(s,'Прямая сделка между '+from.character+' и '+to.character+' заключена.');
  return true;
}
const stateEvent=()=>[{type:'state',payload:{}}];
const failure=(state,id,message)=>({state,events:[{type:'notice',to:id,payload:message}]});
const success=s=>{s.revision++;return {state:s,events:stateEvent()};};
const getPlayer=(s,id)=>s.contestants.find(p=>p.id===id);
function action(s,id,v){
  const me=getPlayer(s,id),active=s.contestants[s.turnIndex];
  if(!me)return failure(s,id,'Игрок не найден.');
  if(me.bankrupt)return failure(s,id,'Банкрот больше не участвует в торговле.');
  const isTurn=active.id===id;
  if(v.type==='black_post'){
    if(!isBlackRound(s))return failure(s,id,'Чёрный рынок открывается только в раундах 2, 5 и 8.');
    if(me.blackListedRound===s.round)return failure(s,id,'Можно выставить один анонимный лот за торговую волну.');
    const item=me.items.find(i=>i.id===v.itemId),ask=wallet(v.ask);
    if(!item||item.acquiredRound===s.round||!ask||!nonzero(ask)||itemLocked(s,item.id))
      return failure(s,id,'Нужен свободный старый предмет и ненулевая цена.');
    me.items.splice(me.items.indexOf(item),1);
    s.deals=s.deals.filter(d=>d.giveItemId!==item.id&&d.wantItemId!==item.id);
    me.blackListedRound=s.round;
    s.blackLots.push({id:'black-'+(++s.blackSeq),seller:id,item,ask,bids:[],round:s.round});
    issue(s,'На анонимном рынке появился новый лот.');
    return success(s);
  }
  if(v.type==='black_cancel'){
    const lot=s.blackLots.find(l=>l.id===v.lotId);
    if(!lot||lot.seller!==id)return failure(s,id,'Нельзя снять чужой анонимный лот.');
    me.items.push(lot.item);s.blackLots=s.blackLots.filter(l=>l.id!==lot.id);
    issue(s,'Анонимный лот снят с торгов.');
    return success(s);
  }
  if(v.type==='black_bid'){
    const lot=s.blackLots.find(l=>l.id===v.lotId),offer=wallet(v.offer);
    if(!isBlackRound(s)||!lot||lot.seller===id||!offer||!nonzero(offer)
       ||!has(me,offer)||inventoryCount(s,me)>=MAX_ITEMS)
      return failure(s,id,'Ставка недоступна: лот, ресурсы или инвентарь.');
    lot.bids=lot.bids.filter(b=>b.buyer!==id);
    lot.bids.push({id:'bbid-'+(++s.blackSeq),buyer:id,offer});
    return success(s);
  }
  if(v.type==='black_withdraw'){
    const lot=s.blackLots.find(l=>l.id===v.lotId);
    if(!lot)return failure(s,id,'Лот не найден.');
    lot.bids=lot.bids.filter(b=>b.buyer!==id);
    return success(s);
  }
  if(v.type==='black_inspect'){
    const lot=s.blackLots.find(l=>l.id===v.lotId);
    const cost=inspectionCost(me,true,s);
    if(!lot||lot.seller===id||me.resources.gold<cost)
      return failure(s,id,'Недостаточно золота для экспертизы этого лота.');
    if(me.blackInspections.some(i=>i.itemId===lot.item.id))
      return failure(s,id,'Этот экземпляр уже проверен.');
    me.resources.gold-=cost;increment(s,'inspections');
    me.blackInspections.push({itemId:lot.item.id,originalName:spec(lot.item).name,
      negative:spec(lot.item).negative,curse:inspectCurse(lot.item)});
    issue(s,'Покупатель оплатил независимую экспертизу.');
    return success(s);
  }
  if(v.type==='black_accept'){
    const lot=s.blackLots.find(l=>l.id===v.lotId);
    if(!lot||lot.seller!==id)return failure(s,id,'Только владелец может принять ставку.');
    const bid=lot.bids.find(b=>b.id===v.bidId),buyer=bid&&getPlayer(s,bid.buyer);
    if(!buyer||buyer.bankrupt||!s.players.some(p=>p.id===buyer.id)||inventoryCount(s,buyer)>=MAX_ITEMS
       ||!has(buyer,bid.offer)||lot.item.acquiredRound===s.round)
      return failure(s,id,'Ставка устарела либо у покупателя нет ресурсов.');
    add(buyer,bid.offer,-1);
    const net={gold:0,crystals:0,parts:0};
    for(const k of RESOURCES)net[k]=bid.offer[k]-Math.ceil(bid.offer[k]*blackFee(s));
    add(me,net);
    const item=lot.item;
    // The buyer sees an anonymized provenance hop, never the intermediary's seller ID.
    item.history.push('Анонимный рынок');item.acquiredRound=s.round;
    buyer.items.push(item);
    awardSaleTrait(s,me,item,true);
    applyRelationship(s,me,buyer);
    s.blackLots=s.blackLots.filter(l=>l.id!==lot.id);increment(s,'blackSales');
    issue(s,'Анонимный лот продан. Посредник удержал '+Math.round(blackFee(s)*100)+'% комиссии.');
    return success(s);
  }
  if(v.type==='repack'){
    const item=me.items.find(x=>x.id===v.itemId);
    if(!item||item.acquiredRound===s.round||itemLocked(s,item.id))
      return failure(s,id,'Предмет должен быть у вас, свободен и куплен раньше этого раунда.');
    if(!Number.isInteger(v.aliasIndex)||v.aliasIndex<0||v.aliasIndex>=DISGUISES.length)
      return failure(s,id,'Недопустимое название упаковки.');
    const price=repackPrice(s);
    if(me.resources.gold<price.gold||me.resources.parts<price.parts)
      return failure(s,id,'Недостаточно ресурсов для перепаковки.');
    me.resources.gold-=price.gold;me.resources.parts-=price.parts;increment(s,'repack');
    item.alias=DISGUISES[v.aliasIndex];
    issue(s,me.character+' перепаковал один предмет.');
    return success(s);
  }
  if(v.type==='deal_propose'){
    const target=getPlayer(s,v.to);
    if(!target||target.id===me.id||target.bankrupt||!s.players.some(p=>p.id===target.id))
      return failure(s,id,'Этот игрок недоступен для сделки.');
    const data=validateDealPayload(s,me,target,v);
    if(!data)return failure(s,id,'Невозможная сделка: проверь ресурсы, предметы и свободные места.');
    s.deals=s.deals.filter(d=>d.from!==id);
    s.deals.push({...data,id:'deal-'+(++s.dealSerial),depth:0});
    return success(s);
  }
  if(v.type==='deal_counter'){
    const old=s.deals.find(d=>d.id===v.dealId);
    if(!old||old.to!==id||old.round!==s.round)
      return failure(s,id,'Контрпредложение доступно только адресату актуальной сделки.');
    if((old.depth||0)>=6)return failure(s,id,'Слишком много встречных предложений; создайте новый договор.');
    const recipient=getPlayer(s,old.from);
    if(!recipient||recipient.bankrupt||!s.players.some(p=>p.id===recipient.id))
      return failure(s,id,'Получатель больше не участвует в партии.');
    const data=validateDealPayload(s,me,recipient,v);
    if(!data)return failure(s,id,'Нельзя отправить такие условия: ресурсы или предмет недоступны.');
    s.deals=s.deals.filter(d=>d.id!==old.id&&d.from!==id);
    s.deals.push({...data,id:'deal-'+(++s.dealSerial),depth:(old.depth||0)+1});
    return success(s);
  }
  if(v.type==='deal_cancel'){
    const deal=s.deals.find(d=>d.id===v.dealId);
    if(!deal||deal.from!==id&&deal.to!==id)return failure(s,id,'Предложение не найдено.');
    s.deals=s.deals.filter(d=>d.id!==deal.id);return success(s);
  }
  if(v.type==='deal_accept'){
    const deal=s.deals.find(d=>d.id===v.dealId);
    if(!deal||deal.to!==id)return failure(s,id,'Это предложение адресовано другому игроку.');
    if(!acceptDeal(s,deal))return failure(s,id,'Условия сделки устарели или ресурсы уже потрачены.');
    return success(s);
  }
  if(v.type==='bid'){
    if(!s.listing||isTurn)return failure(s,id,'Сейчас нет чужого лота.');
    const price=wallet(v.offer);
    if(!price||!nonzero(price)||!has(me,price)||inventoryCount(s,me)>=MAX_ITEMS)return failure(s,id,'Недостаточно ресурсов или мест в инвентаре.');
    s.bids=s.bids.filter(b=>b.buyer!==id);s.bids.push({buyer:id,offer:price});return success(s);
  }
  if(v.type==='withdraw_bid'){
    s.bids=s.bids.filter(b=>b.buyer!==id);return success(s);
  }
  if(v.type==='inspect'){
    const listing=s.listing;
    const cost=inspectionCost(me,false,s);
    if(!listing||listing.seller===id||me.resources.gold<cost)return failure(s,id,'Недостаточно золота для проверки чужого лота.');
    if(me.inspections.some(i=>i.itemId===listing.itemId))return failure(s,id,'Этот экземпляр уже проверен.');
    const seller=getPlayer(s,listing.seller),item=seller?.items.find(i=>i.id===listing.itemId);
    if(!item)return failure(s,id,'Лот недоступен.');
    me.resources.gold-=cost;increment(s,'inspections');me.inspections.push({itemId:item.id,negative:spec(item).negative,
      curse:inspectCurse(item)});
    return success(s);
  }
  if(!isTurn)return failure(s,id,'Не ваш ход. Можно принимать прямые сделки, предлагать обмен и делать ставки.');
  if(v.type==='broker_buy'){
    if(!s.brokerOffer)return failure(s,id,'У брокера больше нет товара на этот ход.');
    if(me.resources.gold<75||inventoryCount(s,me)>=MAX_ITEMS)
      return failure(s,id,'Для покупки нужно 75 золота и свободный слот.');
    me.resources.gold-=75;
    const item=s.brokerOffer;
    item.acquiredRound=s.round;
    me.items.push(item);s.brokerOffer=null;increment(s,'brokerSales');
    issue(s,me.character+' купил запечатанный предмет у брокера.');
    return success(s);
  }
  if(v.type==='salvage'){
    if(me.usedPawn)return failure(s,id,'Ломбард или разбор доступен лишь один раз в ход.');
    const index=me.items.findIndex(i=>i.id===v.itemId&&i.acquiredRound!==s.round);
    if(index<0)return failure(s,id,'Этот предмет пока нельзя разбирать.');
    const [item]=me.items.splice(index,1);
    if(s.listing?.itemId===item.id){s.listing=null;s.bids=[];}
    s.deals=s.deals.filter(d=>d.giveItemId!==item.id&&d.wantItemId!==item.id);
    const yieldParts=salvageYield(s);
    me.resources.parts=Math.min(9999,me.resources.parts+yieldParts);me.usedPawn=true;increment(s,'salvage');
    issue(s,me.character+' разобрал предмет и получил '+yieldParts+' детали.');
    return success(s);
  }
  if(v.type==='work'){
    if(me.worked)return failure(s,id,'Подработка уже использована в этом ходу.');
    const gains={gold:{gold:35,crystals:0,parts:0},crystals:{gold:0,crystals:4,parts:0},parts:{gold:0,crystals:0,parts:1}};
    if(!gains[v.resource])return failure(s,id,'Неизвестный вид подработки.');
    add(me,gains[v.resource]);me.worked=true;issue(s,me.character+' получил доход от подработки.');return success(s);
  }
  if(v.type==='post'){
    if(me.marketDeals>=2)return failure(s,id,'Лимит: две продажи за ход.');
    const item=me.items.find(x=>x.id===v.itemId),ask=wallet(v.ask);
    if(!item||item.acquiredRound===s.round||!ask||!nonzero(ask))return failure(s,id,'Неверный предмет или цена. Купленный в этом раунде товар продавать нельзя.');
    s.listing={seller:id,itemId:item.id,ask};s.bids=[];return success(s);
  }
  if(v.type==='cancel'){
    s.listing=null;s.bids=[];return success(s);
  }
  if(v.type==='accept'){
    const bid=s.bids.find(b=>b.buyer===v.buyer);
    const item=me.items.find(i=>i.id===s.listing?.itemId);
    const buyer=getPlayer(s,v.buyer);
    if(!bid||!item||!buyer||buyer.bankrupt||!onTrade(s,me,buyer,item,bid.offer))return failure(s,id,'Ставка уже недоступна.');
    s.listing=null;s.bids=[];return success(s);
  }
  if(v.type==='pawn'){
    if(me.usedPawn)return failure(s,id,'Ломбард доступен раз за ход.');
    const index=me.items.findIndex(i=>i.id===v.itemId);
    if(index<0)return failure(s,id,'Предмет не найден.');
    if(s.listing?.itemId===v.itemId){s.listing=null;s.bids=[];}
    me.items.splice(index,1);
    s.deals=s.deals.filter(d=>d.giveItemId!==v.itemId&&d.wantItemId!==v.itemId);
    me.resources.gold=Math.min(9999,me.resources.gold+45);me.usedPawn=true;issue(s,me.character+' сдал предмет в ломбард.');return success(s);
  }
  if(v.type==='exchange'){
    if(me.usedPawn)return failure(s,id,'Одна операция с ломбардом за ход.');
    const options={
      buy_crystals:[{gold:70,crystals:0,parts:0},{gold:0,crystals:6,parts:0}],
      buy_parts:[{gold:90,crystals:0,parts:0},{gold:0,crystals:0,parts:1}],
      sell_crystals:[{gold:0,crystals:6,parts:0},{gold:25,crystals:0,parts:0}],
      sell_parts:[{gold:0,crystals:0,parts:1},{gold:40,crystals:0,parts:0}]
    };
    if(!options[v.mode])return failure(s,id,'Неизвестный обмен.');
    const [cost,got]=options[v.mode];
    if(!has(me,cost))return failure(s,id,'Не хватает ресурсов.');
    add(me,cost,-1);add(me,got);me.usedPawn=true;issue(s,me.character+' обменял ресурсы в ломбарде.');return success(s);
  }
  if(v.type==='end'){nextTurn(s);return success(s);}
  return failure(s,id,'Неизвестная команда.');
}
function viewForPlayer({state,player}){
  const s=state,me=player?.id?getPlayer(s,player.id):null;
  if(s.phase==='lobby')return {phase:'lobby',host:s.host,players:s.players,revision:s.revision};
  const seller=getPlayer(s,s.listing?.seller);
  const listed=seller?.items.find(i=>i.id===s.listing?.itemId);
  const turn=s.contestants[s.turnIndex];
  // Hide other wallets and inventory while anonymity could be defeated by a visible change.
  // Direct resource trades remain possible, but choosing an unknown stranger's item is suspended.
  const veil=isBlackRound(s);
  return {phase:s.phase,host:s.host,revision:s.revision,round:s.round,rounds:TOTAL_ROUNDS,deadlineAt:s.deadlineAt||null,
    turnId:turn?.id||null,players:s.contestants.map(p=>({
      id:p.id,name:p.name,character:p.character,
      items:veil&&p.id!==me?.id?null:inventoryCount(s,p),
      inventory:veil&&p.id!==me?.id?[]:p.items.map(item=>({
        ...publicItem(item),tradable:item.acquiredRound!==s.round&&s.listing?.itemId!==item.id
      })),
      resources:veil&&p.id!==me?.id?null:{...p.resources},strikes:p.strikes,
      bankrupt:p.bankrupt,urgent:p.urgent?.status==='pending',
      connected:s.players.some(x=>x.id===p.id)
    })),
    listing:listed?{...publicItem(listed),seller:s.listing.seller,ask:s.listing.ask}:null,
    broker:s.brokerOffer?{...publicItem(s.brokerOffer),price:{gold:75,crystals:0,parts:0}}:null,
    event:eventCard(s),marketFeePercent:Math.round(blackFee(s)*100),
    salvageParts:salvageYield(s),repackCost:repackPrice(s),
    report:s.phase==='done'?{...s.metrics,events:{...s.eventSchedule}}:null,
    bids:s.bids.map(b=>({buyer:b.buyer,offer:b.offer})),
    blackMarket:veil,
    blackLots:(s.blackLots||[]).map(l=>({
      id:l.id,item:{name:publicItem(l.item).name,rarity:spec(l.item).rarity},ask:{...l.ask},bidCount:l.bids.length,
      mine:l.seller===me?.id,
      myBid:l.bids.find(b=>b.buyer===me?.id)?.offer||null,
      bids:l.seller===me?.id?l.bids.map(b=>({id:b.id,offer:{...b.offer}})):[],
      inspection:me?.blackInspections?.find(i=>i.itemId===l.item.id)||null
    })),
    deals:me?s.deals.filter(d=>d.from===me.id||d.to===me.id).map(d=>({
      ...d,giveItem:d.giveItemId&&dealItem(getPlayer(s,d.from),d.giveItemId)?publicItem(dealItem(getPlayer(s,d.from),d.giveItemId)):null,
      wantItem:d.wantItemId&&dealItem(getPlayer(s,d.to),d.wantItemId)?publicItem(dealItem(getPlayer(s,d.to),d.wantItemId)):null
    })):[],
    log:s.log,ranking:s.phase==='done'?s.ranking:undefined,
    you:me?{id:me.id,character:me.character,resources:{...me.resources},quota:{...me.quota},
      items:me.items.map(privateItem),positiveTarget:me.positiveTarget,
      negativeTarget:me.negativeTarget,legendary:me.legendary,
      urgent:me.urgent,worked:me.worked,usedPawn:me.usedPawn,marketDeals:me.marketDeals,
      inspections:me.inspections.filter(i=>i.itemId===s.listing?.itemId),
      inspectionPrices:{public:inspectionCost(me,false,s),black:inspectionCost(me,true,s)},
      disguises:DISGUISES,blackListedRound:me.blackListedRound,
      escrowItems:(s.blackLots||[]).filter(l=>l.seller===me.id).map(l=>privateItem(l.item))}:null};
}
const game={
  protocolVersion:1,viewForPlayer,
  createRoom({player}){return {state:{
    host:player.id,players:[{id:player.id,name:player.name}],contestants:[],
    phase:'lobby',revision:0,round:0,turnIndex:0,deadlineAt:null,listing:null,
    eventSchedule:{},metrics:null,bids:[],brokerOffer:null,deals:[],dealSerial:0,blackLots:[],blackSeq:0,log:[],ranking:[],serial:0
  }};},
  onJoin({state,players}){
    if(state.phase!=='lobby'&&!state.contestants.some(p=>p.id===players.at(-1)?.id))throw Error('match_in_progress');
    if(players.length>MAX_PLAYERS)throw Error('room_full');
    state.players=players.map(p=>({id:p.id,name:p.name}));
    state.revision++;return {state,events:stateEvent()};
  },
  onLeave({state,player,players}){
    state.players=players.map(p=>({id:p.id,name:p.name}));
    if(!state.players.some(p=>p.id===state.host))state.host=state.players[0]?.id||state.host;
    if(state.phase==='lobby')state.contestants=[];
    state.deals=state.deals.filter(d=>state.players.some(p=>p.id===d.from)&&state.players.some(p=>p.id===d.to));
    if(state.phase==='play'){
      for(const lot of (state.blackLots||[]).filter(l=>l.seller===player.id)){
        const exiting=state.contestants.find(p=>p.id===player.id);
        if(exiting)exiting.items.push(lot.item);
      }
      state.blackLots=(state.blackLots||[]).filter(l=>l.seller!==player.id);
      const departed=state.contestants.find(p=>p.id===player.id);
      if(departed){departed.bankrupt=true;departed.urgent=null;issue(state,departed.character+' покинул партию и выбыл.');}
      if(state.contestants[state.turnIndex]?.id===player.id)nextTurn(state);
    }
    state.revision++;return {state,events:stateEvent()};
  },
  onMessage({state,player,payload}){
    const v=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
    if(v.type==='sync'&&!(state.phase==='play'&&state.deadlineAt&&Date.now()>=state.deadlineAt))
      return {state,events:[{type:'state',to:player.id,payload:{}}]};
    if(state.phase==='play'&&state.deadlineAt&&Date.now()>=state.deadlineAt){
      const timed=state.contestants[state.turnIndex];
      issue(state,'Лимит времени истёк. Ход «'+timed.character+'» завершён автоматически.');
      nextTurn(state);
      return success(state);
    }
    if(v.type==='tick')return {state,events:[]};
    if(v.type==='start'&&player.id===state.host&&(state.phase==='lobby'||state.phase==='done')){
      if(state.players.length<MIN_PLAYERS)return failure(state,player.id,'Нужно минимум два игрока.');
      state.players=shuffled(state.players);openGame(state);return success(state);
    }
    if(state.phase==='play')return action(state,player.id,v);
    return failure(state,player.id,'Действие недоступно.');
  }
};
export default game;
