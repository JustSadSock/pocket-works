// Deterministic, isolated test snapshots for the Black Bazaar interface.
// Never import this module into the PocketNet server or use fixtures in live rooms.
export const DEBUG_ITEMS=[
 ['Золотая жаба','редкий','crystals',6,'goldPercent',18],
 ['Жадная копилка','обычный','gold',36,'crystals',3],
 ['Паук-механик','обычный','parts',1,'gold',18],
 ['Корона должника','редкий','gold',62,'crystals',5],
 ['Сундук-мимик','обычный','crystals',8,'gold',33],
 ['Кот неудачи','редкий','parts',1,'crystals',6],
 ['Зеркало зависти','редкий','crystals',7,'gold',24],
 ['Медная шестерня','обычный','parts',1,'gold',12],
 ['Око рынка','обычный','crystals',5,'gold',12],
 ['Гриб прибыли','обычный','gold',50,'parts',1],
 ['Песочные часы','редкий','gold',48,'crystals',6],
 ['Амулет расчёта','обычный','crystals',5,'goldPercent',8],
 ['Забытый сувенир','обычный','gold',25,'parts',1]
];
export const DEBUG_ROLES=['Волшебник','Мак','Слайм','Мимик','Ведьма','Жабий барон'];
export const DEBUG_FX=[
 ['tap','Нажатие'],['open','Открытие'],['close','Закрытие'],
 ['reveal','Новый лот'],['bid','Ставка'],['deal','Сделка'],['inspect','Экспертиза'],
 ['craft','Перепаковка'],['reward','Награда'],['curse','Проклятие'],
 ['ward','Защита'],['warning','Штраф'],['round','Новый раунд'],
 ['turn','Твой ход'],['finish','Финал']
];
export const DEBUG_SCENES=[
 ['home','Главная'],['lobby','Комната ожидания'],
 ['two','Стол · 2'],['four','Стол · 4'],['six','Стол · 6'],['offline','Игрок отключился'],
 ['buyer','Торг · покупатель'],['seller','Торг · продавец'],
 ['bids','Торг · ставки'],['black','Чёрный рынок'],
 ['deals','Прямой обмен'],['urgent','Срочное задание'],
 ['event','Событие раунда'],['bankrupt','Банкротство'],['done','Финал']
];
const wallet=(gold=0,crystals=0,parts=0)=>({gold,crystals,parts});
const zero=()=>wallet();
const change=(w,delta,sign=1)=>{
 for(const k of ['gold','crystals','parts'])w[k]=Math.max(0,Math.min(9999,(w[k]||0)+(delta?.[k]||0)*sign));
};
export function debugItem(index,id,round=1){
 const row=DEBUG_ITEMS[index%DEBUG_ITEMS.length],item={
  id:id||'fixture-item-'+index,name:row[0],rarity:row[1],
  positive:{type:row[2],value:row[3]},negative:{type:row[4],value:row[5]},
  acquiredRound:round,special:null
 };
 if(index===0)item.special={kind:'curse',title:'Алчность жабы',effect:{type:'goldPercent',value:30},dueRound:5,resolved:false};
 if(index===6)item.special={kind:'sellerBonus',title:'Эхо перепродажи',effect:{type:'crystals',value:3}};
 if(index===8)item.special={kind:'appraisal',title:'Зоркий торговец',publicCost:8,blackCost:15};
 if(index===11)item.special={kind:'ward',title:'Печать отсрочки',charges:1};
 return item;
}
const publicItem=item=>({id:item.id,name:item.name,rarity:item.rarity});
const fixtures=['Алиса','Борис','Варя','Даня','Ева','Федя'];
export function createDebugState(scene='four'){
 if(scene==='home')return null;
 const count=scene==='two'?2:scene==='six'?6:4;
 const people=Array.from({length:count},(_,i)=>({
  id:'debug-'+i,name:fixtures[i],character:DEBUG_ROLES[i],connected:true,
  strikes:i===3?1:0,bankrupt:false,urgent:false,items:2,
  inventory:[publicItem(debugItem(i,'other-'+i))],
  resources:wallet(260-i*20,22+i,3+(i%3))
 }));
 if(scene==='lobby')return {phase:'lobby',host:'debug-0',players:people,revision:1};
 if(scene==='offline')people[1].connected=false;
 const owned=[debugItem(0,'owned-frog'),debugItem(11,'owned-amulet'),debugItem(7,'owned-gear')];
 const you={id:'debug-0',character:DEBUG_ROLES[0],resources:wallet(390,32,5),quota:wallet(430,26,3),
  items:owned,escrowItems:[],positiveTarget:'debug-1',negativeTarget:'debug-2',
  legendary:null,urgent:null,worked:false,usedPawn:false,marketDeals:0,
  inspections:[],inspectionPrices:{public:15,black:25},
  disguises:['Талисман достатка','Забытый сувенир','Тёмная реликвия','Дар неизвестного'],
  blackListedRound:0,bankrupt:false
 };
 people[0].resources=you.resources;
 people[0].inventory=owned.map(publicItem);
 people[0].items=owned.length;
 const round=scene==='black'?2:scene==='event'?4:scene==='urgent'?3:3;
 const state={
  phase:'play',host:'debug-0',revision:2,round,rounds:9,
  players:people,turnId:scene==='buyer'||scene==='black'?'debug-1':'debug-0',
  deadlineAt:Date.now()+90000,listing:null,broker:publicItem(debugItem(4,'broker-1')),
  blackMarket:scene==='black',marketFeePercent:scene==='black'?10:10,
  salvageParts:scene==='event'?3:2,repackCost:scene==='event'?wallet(10,0,0):wallet(20,0,1),
  bids:[],blackLots:[],deals:[],log:['Раунд '+round+': начался ход.'],
  event:null,you,report:null,ranking:[]
 };
 if(['buyer','seller','bids','two','four','six','urgent','event','bankrupt'].includes(scene)){
  const mine=scene==='seller',thing=mine?owned[0]:debugItem(5,'listing-cat');
  state.listing={...publicItem(thing),seller:mine?'debug-0':'debug-1',ask:wallet(110,1,0)};
 }
 if(scene==='bids'||scene==='seller')state.bids=[{buyer:'debug-1',offer:wallet(125,0,0)}];
 if(scene==='buyer'){state.you.inspections=[{itemId:'listing-cat',negative:{type:'crystals',value:6},curse:null}];}
 if(scene==='black'){
  const mine=debugItem(2,'escrow-spider');
  you.escrowItems=[mine];
  state.blackLots=[
   {id:'black-lot-1',item:{name:'Тёмная реликвия',rarity:'редкий'},ask:wallet(85),bidCount:2,mine:false,myBid:null,bids:[],inspection:null},
   {id:'black-lot-2',item:publicItem(mine),ask:wallet(95),bidCount:1,mine:true,myBid:null,
    bids:[{id:'sealed-bid',offer:wallet(105)}],inspection:null}
  ];
  state.players.slice(1).forEach(p=>{p.resources=null;p.inventory=[];p.items=null});
 }
 if(scene==='deals')state.deals=[
  {id:'trade-offer-1',from:'debug-1',to:'debug-0',give:wallet(45),want:wallet(0,4,0),giveItemId:null,wantItemId:null,
   giveItem:null,wantItem:null,depth:0},
  {id:'trade-offer-2',from:'debug-0',to:'debug-2',give:wallet(20),want:wallet(0,0,1),giveItem:null,wantItem:null,depth:1}
 ];
 if(scene==='urgent')you.urgent={needs:wallet(100,2,0),status:'pending'};
 if(scene==='event')state.event={id:'salvage_boom',title:'Ярмарка запчастей',description:'Разбор предметов приносит три детали вместо двух.'};
 if(scene==='bankrupt'){you.bankrupt=true;you.resources=wallet(7,0,0);people[0].bankrupt=true;people[0].strikes=3;}
 if(scene==='done'){
  state.phase='done';state.round=10;state.turnId=null;state.deadlineAt=null;
  state.report={publicSales:4,privateDeals:2,blackSales:1,inspections:3,repack:2,salvage:1,urgentMet:5,urgentMissed:2,wardUsed:1,curseFired:1};
  state.ranking=people.map((p,i)=>({id:p.id,name:p.name,character:p.character,place:i+1,progress:100-i*16,complete:i<2,bankrupt:false}));
 }
 return state;
}
export function debugSetItem(state,index,kind='inventory'){
 if(!state?.you)return state;
 const item=debugItem(index,'debug-selected-'+index,Math.max(1,state.round-1));
 if(kind==='inventory'){
  state.you.items=state.you.items.filter(i=>i.id!==item.id);
  state.you.items=[item,...state.you.items].slice(0,4);
  state.players[0].items=state.you.items.length;
  state.players[0].inventory=state.you.items.map(publicItem);
 }else if(kind==='broker')state.broker=publicItem(item);
 else if(kind==='black'){
  state.blackMarket=true;
  state.blackLots=[{id:'selected-black',item:publicItem(item),ask:wallet(77),bidCount:0,mine:false,myBid:null,bids:[],inspection:null}];
 }else{
  state.listing={...publicItem(item),seller:'debug-1',ask:wallet(75)};
  state.bids=[];
 }
 state.revision++;
 return state;
}
const bump=(s,message)=>{
 s.revision++;if(message)s.log=[message,...s.log].slice(0,18);return s;
};
// These actions are LOCAL FIXTURES, not replicas of server validation.
// They exist to exercise the real UI all the way through a click/submit/result.
export function debugCommand(s,cmd){
 if(!s)return {state:s,error:'Открой игровую сцену'};
 const type=cmd?.type;
 if(type==='tick')return {state:s,silent:true};
 if(type==='start')return {state:createDebugState('four')};
 if(type==='kick'){
  const target=s.players.find(p=>p.id===cmd.targetId);
  if(s.host!=='debug-0'||!target||target.id==='debug-0'||target.bankrupt)
   return {state:s,error:'Исключение недоступно'};
  s.bannedIds=[...new Set([...(s.bannedIds||[]),target.id])];
  if(s.phase==='lobby')s.players=s.players.filter(p=>p.id!==target.id);
  else{target.bankrupt=true;target.connected=false;s.bids=s.bids.filter(b=>b.buyer!==target.id);
   s.deals=s.deals.filter(d=>d.from!==target.id&&d.to!==target.id);
   if(s.turnId===target.id)s.turnId='debug-0';}
  s.revision++;return {state:s,message:'Участник исключён'};
 }
 if(s.phase!=='play')return {state:s,error:'Действие недоступно на этом экране'};
 const you=s.you,other=s.players[1];
 const findItem=id=>you.items.find(x=>x.id===id);
 const price=p=>p?.gold||0;
 let log='';
 switch(type){
 case 'post':{
  const item=findItem(cmd.itemId);if(!item||s.listing)return {state:s,error:'Предмет уже выставлен или отсутствует'};
  s.listing={...publicItem(item),seller:you.id,ask:cmd.ask||wallet(80)};
  s.bids=[];log='На столе появился новый лот.';break;
 }
 case 'cancel':s.listing=null;s.bids=[];log='Лот снят.';break;
 case 'inspect':{
  if(!s.listing)return {state:s,error:'Нет лота'};
  s.you.inspections=[{itemId:s.listing.id,negative:{type:'crystals',value:3}}];
  change(you.resources,wallet(s.you.inspectionPrices.public),-1);
  log='Покупатель оплатил независимую экспертизу.';break;
 }
 case 'bid':{
  if(!s.listing)return {state:s,error:'Нет лота'};
  // The explicit buyer is available only to the isolated preview's QA bridge.
  // Ordinary preview clicks still bid for the local player.
  const bidder=s.players.find(p=>p.id===(cmd.buyer||you.id));
  const offer=cmd.offer||wallet(55),payer=bidder?.id===you.id?you.resources:bidder?.resources;
  if(!bidder||bidder.id===s.listing.seller||!payer||
    !['gold','crystals','parts'].every(k=>Number.isSafeInteger(offer[k]||0)&&(offer[k]||0)>=0&&(payer[k]||0)>=(offer[k]||0))||
    !['gold','crystals','parts'].some(k=>(offer[k]||0)>0))
   return {state:s,error:'Ставка недоступна'};
  s.bids=s.bids.filter(b=>b.buyer!==bidder.id).concat({buyer:bidder.id,offer:{...offer}});
  log='Сделана новая ставка.';break;
 }
 case 'withdraw_bid':s.bids=s.bids.filter(b=>b.buyer!==you.id);log='Ставка отозвана.';break;
 case 'accept':{
  if(!s.listing||s.listing.seller!==you.id)return {state:s,error:'Это не твой лот'};
  const buyer=s.players.find(p=>p.id===(cmd.buyer||other.id));
  const offer=s.bids.find(b=>b.buyer===buyer?.id)?.offer;
  const item=findItem(s.listing.id);
  if(!buyer||!offer||!item||buyer.id===you.id||buyer.bankrupt||
   item.acquiredRound===s.round||you.marketDeals>=2||
   (buyer.items??buyer.inventory.length)>=4||
   !['gold','crystals','parts'].every(k=>(buyer.resources?.[k]||0)>=(offer[k]||0)))
   return {state:s,error:'Ставка уже недоступна'};
  // Mirror the authoritative public-market settlement, including first-sale part.
  change(buyer.resources,offer,-1);
  change(you.resources,offer);
  you.items=you.items.filter(i=>i.id!==item.id);
  buyer.inventory=[...(buyer.inventory||[]),publicItem(item)];
  buyer.items=(buyer.items??buyer.inventory.length-1)+1;
  you.marketDeals++;
  if(you.marketDeals===1)change(you.resources,wallet(0,0,1));
  log=buyer.character+' купил «'+s.listing.name+'» у '+you.character+'.';
  s.listing=null;s.bids=[];break;
 }
 case 'work':{
  const gains={gold:wallet(35),crystals:wallet(0,4),parts:wallet(0,0,1)};
  change(you.resources,gains[cmd.resource]||gains.gold);you.worked=true;
  log=you.character+' получил доход от подработки.';break;
 }
 case 'broker_buy':{
  if(!s.broker)return {state:s,error:'Товар продан'};
  change(you.resources,wallet(75),-1);
  you.items=[...you.items,debugItem(4,s.broker.id,s.round)].slice(-4);
  s.broker=null;log=you.character+' купил запечатанный предмет у брокера.';break;
 }
 case 'pawn':case 'salvage':{
  if(!findItem(cmd.itemId))return {state:s,error:'Предмет отсутствует'};
  you.items=you.items.filter(i=>i.id!==cmd.itemId);
  if(type==='pawn')change(you.resources,wallet(45));
  else change(you.resources,wallet(0,0,s.salvageParts));
  you.usedPawn=true;log=type==='pawn'?you.character+' сдал предмет в ломбард.':you.character+' разобрал предмет и получил '+s.salvageParts+' детали.';
  break;
 }
 case 'exchange':{
  const table={buy_crystals:[wallet(70),wallet(0,6)],buy_parts:[wallet(90),wallet(0,0,1)],
   sell_crystals:[wallet(0,6),wallet(25)],sell_parts:[wallet(0,0,1),wallet(40)]};
  const pair=table[cmd.mode];if(!pair)return {state:s,error:'Неизвестный обмен'};
  change(you.resources,pair[0],-1);change(you.resources,pair[1]);you.usedPawn=true;
  log=you.character+' обменял ресурсы в ломбарде.';break;
 }
 case 'repack':{
  const item=findItem(cmd.itemId);if(!item)return {state:s,error:'Предмет отсутствует'};
  item.name=you.disguises[cmd.aliasIndex]||you.disguises[0];
  change(you.resources,s.repackCost,-1);log=you.character+' перепаковал один предмет.';break;
 }
 case 'deal_propose':case 'deal_counter':{
  const id=type==='deal_counter'?cmd.dealId:'fixture-deal-'+(s.revision+1);
  const old=s.deals.find(d=>d.id===id);
  const to=type==='deal_counter'?(old?.from||other.id):cmd.to;
  s.deals=s.deals.filter(d=>d.id!==id).concat({
   id,from:you.id,to,give:cmd.give||zero(),want:cmd.want||zero(),
   giveItemId:cmd.giveItemId||null,wantItemId:cmd.wantItemId||null,
   giveItem:cmd.giveItemId?publicItem(findItem(cmd.giveItemId)||debugItem(4)):null,wantItem:null,depth:(old?.depth||0)+1
  });
  log='Отправлено предложение обмена.';break;
 }
 case 'deal_accept':{
  const d=s.deals.find(d=>d.id===cmd.dealId);if(!d)return {state:s,error:'Сделка уже закрыта'};
  change(you.resources,d.give,d.from===you.id?-1:1);
  change(you.resources,d.want,d.to===you.id?-1:1);
  s.deals=s.deals.filter(x=>x.id!==d.id);
  log='Прямая сделка между '+s.players[0].character+' и '+other.character+' заключена.';break;
 }
 case 'deal_cancel':s.deals=s.deals.filter(x=>x.id!==cmd.dealId);log='Обмен отклонён.';break;
 case 'black_post':{
  const item=findItem(cmd.itemId);if(!item)return {state:s,error:'Предмет отсутствует'};
  s.blackMarket=true;
  s.blackLots.push({id:'black-'+(s.revision+1),item:publicItem(item),ask:cmd.ask||wallet(80),
   bidCount:0,mine:true,myBid:null,bids:[],inspection:null});
  you.items=you.items.filter(x=>x.id!==item.id);you.escrowItems.push(item);
  you.blackListedRound=s.round;log='На анонимном рынке появился новый лот.';break;
 }
 case 'black_bid':{
  const lot=s.blackLots.find(x=>x.id===cmd.lotId);if(!lot)return {state:s,error:'Лот исчез'};
  lot.myBid=cmd.offer||wallet(55);lot.bidCount++;log='Закрытая ставка обновлена.';break;
 }
 case 'black_withdraw':{
  const lot=s.blackLots.find(x=>x.id===cmd.lotId);
  if(lot){lot.myBid=null;lot.bidCount=Math.max(0,lot.bidCount-1)}
  log='Ставка отозвана.';break;
 }
 case 'black_inspect':{
  const lot=s.blackLots.find(x=>x.id===cmd.lotId);if(!lot)return {state:s,error:'Лот исчез'};
  lot.inspection={originalName:'Сундук-мимик',negative:{type:'gold',value:25}};
  change(you.resources,wallet(25),-1);log='Покупатель оплатил независимую экспертизу.';break;
 }
 case 'black_cancel':{
  const lot=s.blackLots.find(x=>x.id===cmd.lotId);if(lot?.mine){
   const thing=you.escrowItems.find(x=>x.id===lot.item.id);
   if(thing)you.items.push(thing);
   you.escrowItems=you.escrowItems.filter(x=>x.id!==lot.item.id);
  }
  s.blackLots=s.blackLots.filter(x=>x.id!==cmd.lotId);log='Анонимный лот снят с торгов.';break;
 }
 case 'black_accept':{
  const lot=s.blackLots.find(x=>x.id===cmd.lotId);
  if(lot?.mine)change(you.resources,lot.bids.find(b=>b.id===cmd.bidId)?.offer||wallet(90));
  s.blackLots=s.blackLots.filter(x=>x.id!==cmd.lotId);
  log='Анонимный лот продан. Посредник удержал 10% комиссии.';break;
 }
 case 'end':{
  s.turnId=s.turnId===you.id?other.id:you.id;
  if(s.turnId===you.id){s.round++;you.worked=false;you.usedPawn=false;you.marketDeals=0;}
  s.deadlineAt=Date.now()+90000;
  log='Раунд '+s.round+': ход игрока '+s.players.find(x=>x.id===s.turnId).character+'.';break;
 }
 default:return {state:s,error:'Для команды «'+String(type)+'» нет тестового действия'};
 }
 s.players[0].items=you.items.length+you.escrowItems.length;
 s.players[0].inventory=you.items.map(publicItem);
 s.players[0].resources=you.resources;
 return {state:bump(s,log),message:log};
}
