// ЧЁРНАЯ БАРАХОЛКА / mechanical alpha.
// Authoritative rules. Secrets are only exposed through viewForPlayer.
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const TOTAL_ROUNDS = 9;
export const RESOURCES = ['gold','crystals','parts'];
const CHARACTERS = ['Волшебник','Мак','Слайм','Мимик','Ведьма','Жабий барон'];
const QUOTAS = [
  {gold:470,crystals:45,parts:8},
  {gold:440,crystals:50,parts:8},
  {gold:500,crystals:43,parts:7},
  {gold:450,crystals:47,parts:9},
  {gold:480,crystals:46,parts:8},
  {gold:460,crystals:49,parts:8}
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
const MAX_ITEMS = 4;
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
  return {id:'item-'+(++s.serial),key:kind.key,variant,acquiredRound:0,history:[]};
}
function spec(item){
  const def=GOODS.find(x=>x.key===item.key);
  const pair=def.variants[item.variant]||def.variants[0];
  return {name:def.name,rarity:def.rarity,positive:pair[0],negative:pair[1]};
}
function publicItem(item){const d=spec(item);return {id:item.id,name:d.name,rarity:d.rarity};}
function privateItem(item){return {...publicItem(item),positive:spec(item).positive,negative:spec(item).negative,acquiredRound:item.acquiredRound,history:item.history};}
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
function urgentFor(round){
  const tier=Math.floor(round/3);
  const options=[
    [{gold:60,crystals:0,parts:0},{gold:0,crystals:7,parts:0},{gold:0,crystals:0,parts:1}],
    [{gold:90,crystals:0,parts:0},{gold:0,crystals:10,parts:0},{gold:35,crystals:0,parts:1}],
    [{gold:120,crystals:0,parts:0},{gold:0,crystals:13,parts:0},{gold:35,crystals:0,parts:2}]
  ];
  return {...sample(options[Math.min(2,tier-1)])};
}
function startTurn(s){
  if(s.round> TOTAL_ROUNDS){s.phase='done';s.ranking=rankPlayers(s);issue(s,'Партия окончена. Итоги подсчитаны.');return;}
  const p=s.contestants[s.turnIndex];
  p.worked=false;p.usedPawn=false;p.marketDeals=0;
  s.listing=null;s.bids=[];
  p.urgent=(s.round%3===0&&!p.bankrupt)?{needs:urgentFor(s.round),status:'pending'}:null;
  issue(s,'Раунд '+s.round+': ход игрока '+p.character+'.');
}
function openGame(s){
  s.phase='play';s.round=1;s.turnIndex=0;s.serial=0;s.ranking=[];
  s.contestants=s.players.map((p,i)=>{
    const targets=s.players.filter(x=>x.id!==p.id).map(x=>x.id);
    const plus=sample(targets),minus=sample(targets);
    return {id:p.id,name:p.name,character:CHARACTERS[i],resources:{gold:250,crystals:20,parts:3},quota:{...QUOTAS[i]},
      items:[newItem(s),newItem(s)],positiveTarget:plus,negativeTarget:minus,
      legendary:null,positiveUsed:0,negativeUsed:0,urgent:null,strikes:0,bankrupt:false,
      worked:false,usedPawn:false,marketDeals:0,inspections:[]};
  });
  if(s.contestants.length>=3 && Math.random()<.04){
    const lucky=sample(s.contestants),partner=sample(s.contestants.filter(p=>p.id!==lucky.id));
    lucky.legendary=partner.id;
  }
  s.listing=null;s.bids=[];s.log=[];startTurn(s);
}
function resolveUrgent(s,p){
  if(!p.urgent)return;
  const needed=p.urgent.needs;
  if(has(p,needed)){
    add(p,needed,-1);p.resources.gold+=35;p.urgent.status='success';
    issue(s,p.character+' выполнил срочный заказ.');
  }else{
    p.strikes++;p.urgent.status='failed';
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
    // Positive effects first, then upkeep; order is stable for reproducibility.
    for(const item of p.items)applyEffect(p,spec(item).positive,+1);
    for(const item of p.items)applyEffect(p,spec(item).negative,-1);
  }
  issue(s,'Итоги раунда '+s.round+': свойства предметов сработали.');
}
function nextTurn(s){
  const p=s.contestants[s.turnIndex];resolveUrgent(s,p);
  s.listing=null;s.bids=[];
  s.turnIndex++;
  if(s.turnIndex===s.contestants.length){
    roundIncome(s);s.turnIndex=0;s.round++;
  }
  startTurn(s);
}
function onTrade(s,seller,buyer,item,price){
  if(buyer.items.length>=MAX_ITEMS||!has(buyer,price))return false;
  const index=seller.items.findIndex(x=>x.id===item.id);
  if(index<0)return false;
  add(buyer,price,-1);add(seller,price,+1);
  seller.items.splice(index,1);item.history.push(seller.id);item.acquiredRound=s.round;buyer.items.push(item);
  seller.marketDeals++;
  if(buyer.positiveTarget===seller.id && buyer.positiveUsed!==s.round){
    buyer.resources.crystals+=3;buyer.positiveUsed=s.round;
  }
  if(seller.negativeTarget===buyer.id && seller.negativeUsed!==s.round){
    buyer.resources.gold=Math.max(0,buyer.resources.gold-20);seller.negativeUsed=s.round;
  }
  issue(s,buyer.character+' купил «'+spec(item).name+'» у '+seller.character+'.');
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
  if(v.type==='bid'){
    if(!s.listing||isTurn)return failure(s,id,'Сейчас нет чужого лота.');
    const price=wallet(v.offer);
    if(!price||!nonzero(price)||!has(me,price)||me.items.length>=MAX_ITEMS)return failure(s,id,'Недостаточно ресурсов или мест в инвентаре.');
    s.bids=s.bids.filter(b=>b.buyer!==id);s.bids.push({buyer:id,offer:price});return success(s);
  }
  if(v.type==='withdraw_bid'){
    s.bids=s.bids.filter(b=>b.buyer!==id);return success(s);
  }
  if(v.type==='inspect'){
    const listing=s.listing;
    if(!listing||listing.seller===id||me.resources.gold<15)return failure(s,id,'Для проверки чужого лота нужно 15 золота.');
    if(me.inspections.some(i=>i.itemId===listing.itemId))return failure(s,id,'Этот экземпляр уже проверен.');
    const seller=getPlayer(s,listing.seller),item=seller?.items.find(i=>i.id===listing.itemId);
    if(!item)return failure(s,id,'Лот недоступен.');
    me.resources.gold-=15;me.inspections.push({itemId:item.id,negative:spec(item).negative});
    return success(s);
  }
  if(!isTurn)return failure(s,id,'Дождитесь своего хода. Сейчас можно только делать ставки.');
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
    me.items.splice(index,1);me.resources.gold+=45;me.usedPawn=true;issue(s,me.character+' сдал предмет в ломбард.');return success(s);
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
  return {phase:s.phase,host:s.host,revision:s.revision,round:s.round,rounds:TOTAL_ROUNDS,
    turnId:turn?.id||null,players:s.contestants.map(p=>({
      id:p.id,name:p.name,character:p.character,
      items:p.items.length,resources:{...p.resources},strikes:p.strikes,
      bankrupt:p.bankrupt,urgent:p.urgent?.status==='pending',
      progress:Math.round(balance(p)*100),connected:s.players.some(x=>x.id===p.id)
    })),
    listing:listed?{...publicItem(listed),seller:s.listing.seller,ask:s.listing.ask}:null,
    bids:s.bids.map(b=>({buyer:b.buyer,offer:b.offer})),
    log:s.log,ranking:s.phase==='done'?s.ranking:undefined,
    you:me?{id:me.id,character:me.character,resources:{...me.resources},quota:{...me.quota},
      items:me.items.map(privateItem),positiveTarget:me.positiveTarget,
      negativeTarget:me.negativeTarget,legendary:me.legendary,
      urgent:me.urgent,worked:me.worked,usedPawn:me.usedPawn,marketDeals:me.marketDeals,
      inspections:me.inspections.filter(i=>i.itemId===s.listing?.itemId)}:null};
}
const game={
  protocolVersion:1,viewForPlayer,
  createRoom({player}){return {state:{
    host:player.id,players:[{id:player.id,name:player.name}],contestants:[],
    phase:'lobby',revision:0,round:0,turnIndex:0,listing:null,bids:[],log:[],ranking:[],serial:0
  }};},
  onJoin({state,players}){
    if(state.phase!=='lobby'&&!state.contestants.some(p=>p.id===players.at(-1)?.id))throw Error('match_in_progress');
    if(players.length>MAX_PLAYERS)throw Error('room_full');
    state.players=players.map(p=>({id:p.id,name:p.name}));
    state.revision++;return {state,events:stateEvent()};
  },
  onLeave({state,players}){
    state.players=players.map(p=>({id:p.id,name:p.name}));
    if(!state.players.some(p=>p.id===state.host))state.host=state.players[0]?.id||state.host;
    if(state.phase==='lobby')state.contestants=[];
    // Departure forfeits a turn, but the account can rejoin during a match.
    if(state.phase==='play'&&state.contestants[state.turnIndex]&&!state.players.some(p=>p.id===state.contestants[state.turnIndex].id))nextTurn(state);
    state.revision++;return {state,events:stateEvent()};
  },
  onMessage({state,player,payload}){
    const v=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
    if(v.type==='sync')return {state,events:[{type:'state',to:player.id,payload:{}}]};
    if(v.type==='start'&&player.id===state.host&&(state.phase==='lobby'||state.phase==='done')){
      if(state.players.length<MIN_PLAYERS)return failure(state,player.id,'Нужно минимум два игрока.');
      state.players=shuffled(state.players);openGame(state);return success(state);
    }
    if(state.phase==='play')return action(state,player.id,v);
    return failure(state,player.id,'Действие недоступно.');
  }
};
export default game;
