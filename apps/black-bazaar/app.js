import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {svgIcon,brandEmblem} from './art.js';
import {artifactSVG} from './art/artifacts.js';
import {roleCharacter,characterMarkup,applyCharacterArt,loadCharacterArt} from './art/characters.js';
installMobileRuntime();
createWorkshopMode({appName:'Чёрная барахолка',version:'0.11.0',cachePrefix: 'black-bazaar-',storageNamespace: 'pocket-works:black-bazaar',onReset(){localStorage.removeItem('black-bazaar:name');}});

const GAME_ID='black-bazaar';
const ORIGIN=location.origin+'/pocketnet';
const app=document.querySelector('#app');
const status=document.querySelector('#status');
const qs=new URLSearchParams(location.search);
const hintRoom=(qs.get('room')||'').trim().toUpperCase();
const names={gold:'золота',crystals:'кристаллов',parts:'деталей'};
const keys=['gold','crystals','parts'];
// Separate durable token storage: never collide with another PocketWorks game.
const netStorage={
 getItem(key){
  try{const saved=localStorage.getItem('black-bazaar:'+key);if(saved)return saved;}catch{}
  try{return sessionStorage.getItem(key);}catch{return null;}
 },
 setItem(key,value){
  try{localStorage.setItem('black-bazaar:'+key,value);}catch{try{sessionStorage.setItem(key,value);}catch{}}
 },
 removeItem(key){
  try{localStorage.removeItem('black-bazaar:'+key);}catch{}
  try{sessionStorage.removeItem(key);}catch{}
 }
};
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amounts=w=>keys.filter(k=>w?.[k]).map(k=>w[k]+' '+names[k]).join(', ')||'ничего';
const person=id=>state?.players?.find(p=>p.id===id);
const label=id=>person(id)?.character||person(id)?.name||'Игрок';
const formatEffect=(fx,minus=false)=>{
  if(!fx)return '—';
  const key=fx.type==='goldPercent'?'золота':names[fx.type]||fx.type;
  return (minus?'−':'+')+fx.value+(fx.type==='goldPercent'?'% ':' ')+key;
};
function curseHint(curse){
 if(!curse)return '';
 const effect=esc(formatEffect(curse.effect,true));
 return curse.resolved?'Проклятие уже сработало: '+effect:
   'Отложенное проклятие: '+effect+' в конце раунда '+esc(curse.dueRound);
}
function specialHint(t){
 if(!t)return '';
 if(t.kind==='curse')return curseHint(t);
 if(t.kind==='ward')return 'Защита от одной невыполненной срочной заявки · осталось '+t.charges+' зарядов';
 if(t.kind==='sellerBonus')return 'При перепродаже: '+formatEffect(t.effect)+' продавцу (не чаще раза за раунд)';
 if(t.kind==='appraisal')return 'Скидка на экспертизу: обычная '+t.publicCost+', чёрная '+t.blackCost+' золота';
 return '';
}
function specialLine(t){
 return t?'<div class="chip"><strong>'+esc(t.title)+'</strong>: '+esc(specialHint(t))+'</div>':'';
}
let net=null,me=null,state=null,roomId='',mode='home',connecting=false,connected=false;
let name=(localStorage.getItem('black-bazaar:name')||'Игрок').slice(0,22);
const decorativeGuests=['mage','mushroom','fluffy_monster','sheep_wolf','toy','prince','many_eyed_cat','flower','old_man'];
let notice='';
let activeSheet=null,lastSheetTrigger=null,selectedArtifact=null;
function message(m,isError=false){notice=m;status.textContent=m;status.className=isError?'error':'muted';}
function localStore(){const node=document.querySelector('#nickname');if(node)name=(node.value.trim()||'Игрок').slice(0,22);try{localStorage.setItem('black-bazaar:name',name);}catch{}}
function renderHome(){
 mode='home';activeSheet=null;selectedArtifact=null;document.body.classList.remove('sheet-open');
 app.innerHTML='<div class="entry-screen">'+
 '<div class="entry-art" aria-hidden="true">'+
 '<div class="entry-cast">'+decorativeGuests.map(kind=>'<span class="entry-character">'+characterMarkup(kind)+'</span>').join('')+'</div>'+
 '<div class="entry-table"></div><div class="entry-emblem">'+brandEmblem()+'</div></div>'+
 '<div class="entry-copy"><h1>Чёрная барахолка</h1>'+
 '<p>Девять раундов. Странные находки. Торгуйся, хитри и не разорись.</p>'+
 '<div class="entry-form"><div class="panel stack">'+
 '<label>Твоё имя<input id="nickname" type="text" maxlength="22" value="'+esc(name)+'" autocomplete="nickname"></label>'+
 '<button type="button" class="primary" data-action="create">Создать комнату '+svgIcon('arrow')+'</button>'+
 '<label>Код комнаты<input id="roomCode" type="text" spellcheck="false" value="'+esc(hintRoom)+'" placeholder="Код или ссылка"></label>'+
 '<button type="button" data-action="join">Войти к друзьям</button>'+
 '</div></div></div></div>';
 applyCharacterArt(app);
}
function renderLobby(){
 mode='lobby';activeSheet=null;selectedArtifact=null;document.body.classList.remove('sheet-open');
 const all=state?.players||[],host=state?.host===me?.id,short=roomId.slice(0,8).toUpperCase();
 app.innerHTML='<div class="lobby-screen"><div class="panel stack">'+
 '<h1>За одним столом</h1><p>Код комнаты</p><strong class="lobby-room">'+esc(short)+'</strong>'+
 '<div class="row"><button type="button" data-action="copy-code">'+svgIcon('box')+' Код</button>'+
 '<button type="button" data-action="copy-url">'+svgIcon('trade')+' Ссылка</button></div>'+
 '<div class="lobby-players">'+all.map((p,index)=>'<div class="lobby-player">'+
 characterMarkup(decorativeGuests[index%decorativeGuests.length],'lobby-portrait')+'<strong>'+esc(p.name)+'</strong>'+
 (p.id===state.host?'<br><small>Создатель</small>':'')+'</div>').join('')+'</div>'+
 '<p class="muted">'+all.length+' из 6 игроков · старт от двух</p>'+
 (host?'<button type="button" class="primary" data-action="start" '+(all.length<2?'disabled':'')+'>Начать игру</button>':'<p>Начало — у создателя комнаты.</p>')+
 '<button type="button" data-action="leave">Покинуть комнату</button>'+
 '</div></div>';
 applyCharacterArt(app);
}
function scoreBox(){
  return '<div class="panel"><h2>Участники</h2><table class="table"><thead><tr><th>Игрок</th><th>Ресурсы</th><th>Предметы</th><th>Штрафы</th></tr></thead><tbody>'+
  state.players.map(p=>'<tr><td><strong>'+esc(p.character)+'</strong><br><small>'+esc(p.name)+(p.id===state.turnId?' · ходит':'')+'</small></td>'+
    '<td>'+(p.resources?esc(amounts(p.resources)):'Скрыто')+'</td><td>'+(p.items??'Скрыто')+'</td><td>'+p.strikes+'/3'+(p.bankrupt?' · банкрот':'')+'</td></tr>').join('')+
    '</tbody></table></div>';
}
function inventoryBlock(you){
 const held=you.escrowItems?.length||0;
 const itemButton=item=>'<button type="button" class="inventory-object" data-action="open-item" data-kind="inventory" data-id="'+esc(item.id)+'" aria-label="Посмотреть: '+esc(item.name)+'">'+
 '<span class="inventory-art">'+artifactSVG(item.name,item.rarity)+'</span>'+
 '<span class="inventory-copy"><strong>'+esc(item.name)+'</strong><small>'+esc(item.rarity)+' · '+(item.acquiredRound===state.round?'Новый':'Из раунда '+item.acquiredRound)+'</small></span>'+
 svgIcon('arrow',18)+'</button>';
 return '<div class="panel inventory-panel"><h2>Мои находки <small>'+(you.items.length+held)+'/4</small></h2>'+
 (you.items.length?'<div class="inventory-gallery">'+you.items.map(itemButton).join('')+'</div>':
 '<p class="muted">Предметов пока нет.</p>')+
 (held?'<p class="inventory-escrow">У посредника: '+held+'</p>':'')+'</div>';
}
function secretBlock(you){
 const relationA=label(you.positiveTarget),relationB=label(you.negativeTarget);
 const goal=you.quota;
 return '<div class="panel"><h2>Секретные условия (видны только тебе)</h2>'+
 '<p><strong>Постоянная квота:</strong> '+esc(amounts(goal))+' одновременно к окончанию 9-го раунда.</p>'+
 '<p><strong>Покровитель:</strong> при покупке у «'+esc(relationA)+'» +3 кристалла (не чаще раза за раунд).</p>'+
 '<p><strong>Уязвимый клиент:</strong> при покупке у тебя «'+esc(relationB)+'» теряет дополнительно 20 золота (не чаще раза за раунд).</p>'+
 (you.legendary?'<p><strong>Легендарная судьба:</strong> если «'+esc(label(you.legendary))+'» займёт первое место, а ты не обанкротишься, получишь второе место.</p>':'')+
 '</div>';
}
function urgentBlock(you){
 if(!you.urgent)return '';
 const u=you.urgent,need=u.needs;
 return '<div class="panel urgent"><h2>Срочный заказ · '+(u.status==='pending'?'должен быть оплачен до конца твоего хода':u.status==='success'?'выполнен':u.status==='shielded'?'защищён амулетом':'провален')+'</h2>'+
 '<p>Необходимо сдать: <strong>'+esc(amounts(need))+'</strong>.</p><p>Если хватит ресурсов при завершении хода, заказ оплатится автоматически, а ты получишь 35 золота. Иначе штраф; третий провал означает банкротство.</p>'+
 '<p>Сейчас: '+esc(amounts(you.resources))+'</p></div>';
}
function marketBlock(you,canAct){
 const listing=state.listing;
 if(!listing)return '<div class="panel"><h2>Текущий лот</h2><p class="muted">Нет предмета на продаже.</p></div>';
 const sellerIsMe=listing.seller===me.id;
 const already=you.inspections.find(i=>i.itemId===listing.id);
 let html='<div class="panel"><h2>Лот: '+esc(listing.name)+'</h2><p>Продавец: '+esc(label(listing.seller))+
 '. Редкость: '+esc(listing.rarity)+'. Запрошено: <strong>'+esc(amounts(listing.ask))+'</strong>.</p>'+
 '<p class="muted">Продавец может описывать любые свойства. Реальные эффекты узнаются после покупки или частичной проверки.</p>';
 if(!sellerIsMe&&already)html+='<p>Проверка показала содержание: <strong>'+esc(formatEffect(already.negative,true))+
    '</strong></p>'+(already.curse?'<p class="error">'+curseHint(already.curse)+'</p>':'');
 const cost=you.inspectionPrices?.public??15;
 if(!sellerIsMe&&!already)html+='<button type="button" data-action="inspect" '+(you.resources.gold<cost?'disabled':'')+
   '>Экспертиза ('+cost+' золота)</button>';
 if(sellerIsMe){
  html+='<h3>Предложения покупателей</h3>'+
    (state.bids.length?state.bids.map(b=>'<div class="row"><span>'+esc(label(b.buyer))+' предлагает '+esc(amounts(b.offer))+'</span>'+
     '<button type="button" data-action="accept" data-player="'+esc(b.buyer)+'">Принять</button></div>').join(''):'<p>Пока предложений нет.</p>')+
    '<button type="button" data-action="cancel">Снять лот</button>';
 }else if(!you.bankrupt){
  html+='<form class="stack" data-form="bid"><h3>Предложить свою цену</h3>'+
   resourceFields('offer',listing.ask)+
   '<button type="submit" class="primary">Предложить продавцу</button></form>'+
   (state.bids.some(b=>b.buyer===me.id)?'<button type="button" data-action="withdraw">Отозвать ставку</button>':'');
 }
 return html+'</div>';
}
function resourceFields(prefix,defaults={}){
 return '<div class="row">'+keys.map(k=>'<label>'+names[k]+'<input type="number" min="0" max="2000" step="1" name="'+prefix+'_'+k+'" value="'+(defaults[k]||0)+'" required></label>').join('')+'</div>';
}
function dealDescription(d){
  const one=(w,item)=>esc(amounts(w))+(item?' и «'+esc(item.name)+'»':'');
  const a=label(d.from),b=label(d.to);
  return '<strong>'+esc(a)+'</strong> отдаёт '+one(d.give,d.giveItem)+
    '; <strong>'+esc(b)+'</strong> отдаёт '+one(d.want,d.wantItem)+'.';
}
function itemOptions(items,selected=null){
 return '<option value="">Без предмета</option>'+
   items.map(i=>'<option value="'+esc(i.id)+'"'+(selected===i.id?' selected':'')+'>'+
   esc(i.name)+'</option>').join('');
}
function tradePanel(you){
 const deals=state.deals||[];
 const inbox=deals.filter(d=>d.to===you.id);
 const outbox=deals.filter(d=>d.from===you.id);
 let html='<div class="panel"><h2>Прямой обмен с игроками</h2>'+
 '<p class="muted">Предложить можно даже во время чужого хода. Сделка проводится только после согласия обеих сторон. Разрешены подарки, обмен ресурсами и предметами.</p>';
 if(inbox.length){
  html+='<h3>Предложения тебе</h3>'+inbox.map(d=>{
    const partner=state.players.find(p=>p.id===d.from);
    const mine=you.items.filter(i=>i.acquiredRound!==state.round&&i.id!==state.listing?.id);
    const theirs=(partner?.inventory||[]).filter(i=>i.tradable);
    const depth=d.depth||0;
    return '<div class="offer"><p>'+dealDescription(d)+'</p>'+
      '<div class="row"><button type="button" class="primary" data-action="deal-accept" data-id="'+esc(d.id)+'">Принять обмен</button>'+
      '<button type="button" data-action="deal-cancel" data-id="'+esc(d.id)+'">Отклонить</button></div>'+
      (depth>=6?'<p class="muted">Лимит раундов переговоров достигнут.</p>':
        '<details><summary>Предложить другие условия ('+depth+'/6)</summary>'+
        '<form class="stack" data-form="counter" data-deal-id="'+esc(d.id)+'">'+
        '<label>Я отдаю предмет<select name="giveItemId">'+itemOptions(mine,d.wantItemId)+'</select></label>'+
        '<p>Я отдаю ресурсы:</p>'+resourceFields('give',d.want)+
        '<label>Я прошу предмет<select name="wantItemId">'+itemOptions(theirs,d.giveItemId)+'</select></label>'+
        '<p>Я прошу ресурсы:</p>'+resourceFields('want',d.give)+
        '<button type="submit">Отправить контрпредложение</button></form></details>')+'</div>';
  }).join('');
 }
 if(outbox.length){
  html+='<h3>Твоё предложение</h3>'+outbox.map(d=>'<div class="offer"><p>'+dealDescription(d)+'</p>'+
    '<button type="button" data-action="deal-cancel" data-id="'+esc(d.id)+'">Отозвать</button></div>').join('');
 }
 const recipients=state.players.filter(p=>p.id!==you.id&&!p.bankrupt&&p.connected);
 if(!you.bankrupt&&recipients.length){
  const first=recipients[0];
  const giveItems=you.items.filter(i=>i.acquiredRound!==state.round&&i.id!==state.listing?.id);
  const wantItems=first.inventory.filter(i=>i.tradable);
  html+='<form data-form="deal" class="stack">'+
    '<h3>Новое предложение</h3>'+
    '<label>Кому<select name="to" id="dealTarget">'+recipients.map(p=>
      '<option value="'+esc(p.id)+'">'+esc(p.character)+'</option>').join('')+'</select></label>'+
    '<label>Какой предмет отдаёшь<select name="giveItemId">'+itemOptions(giveItems)+'</select></label>'+
    '<p>Отдаёшь ресурсы:</p>'+resourceFields('give')+
    '<label>Какой предмет хочешь получить<select name="wantItemId" id="dealWantItem">'+itemOptions(wantItems)+'</select></label>'+
    '<p>Просишь ресурсы:</p>'+resourceFields('want')+
    '<button type="submit" class="primary">Предложить обмен</button>'+
    '<small>Новое предложение заменяет твоё предыдущее. Неисполненные предложения исчезают в конце раунда. Предметы, купленные в этом раунде, нельзя передать снова.</small></form>';
 }else if(!inbox.length&&!outbox.length){
  html+='<p class="muted">Сейчас нет доступных торговых партнёров.</p>';
 }
 return html+'</div>';
}

function blackMarketBlock(you){
 if(!state.blackMarket)return '';
 let out='<div class="panel"><h2>Анонимный чёрный рынок · раунд '+state.round+'</h2>'+
 '<p class="muted">Лоты хранятся у посредника до продажи. Ставки закрытые, имена участников неизвестны. По завершении раунда непроданные предметы возвращаются.</p>'+
 '<p class="muted">Пока рынок открыт, чужие балансы и инвентари временно скрыты. Посредник удерживает '+(state.marketFeePercent??10)+'% с каждого полученного ресурса.</p>';
 for(const lot of state.blackLots||[]){
  const inspected=lot.inspection;
  out+='<section class="offer black-object"><button type="button" class="inventory-object" data-action="open-item" data-kind="black" data-id="'+esc(lot.id)+'">'+
 '<span class="inventory-art">'+artifactSVG(lot.item.name,lot.item.rarity)+'</span><span class="inventory-copy"><strong>'+esc(lot.item.name)+'</strong><small>'+esc(lot.item.rarity)+' · закрытый торг</small></span>'+svgIcon('arrow',18)+'</button>'+
   '<p>Запрошено: '+esc(amounts(lot.ask))+' · Закрытых ставок: '+lot.bidCount+'</p>';
  if(inspected)out+='<p class="success">Экспертиза: '+esc(inspected.originalName)+
    '; содержание '+esc(formatEffect(inspected.negative,true))+'</p>'+
    (inspected.curse?'<p class="error">'+curseHint(inspected.curse)+'</p>':'');
  if(lot.mine){
   out+='<p><strong>Твой анонимный лот</strong></p>'+
    (lot.bids.length?lot.bids.map(b=>'<div class="row"><span>Ставка '+esc(amounts(b.offer))+'</span>'+
      '<button type="button" data-action="black-accept" data-id="'+esc(lot.id)+
      '" data-bid="'+esc(b.id)+'">Продать по ставке</button></div>').join(''):
      '<p class="muted">Пока предложений нет.</p>')+
    '<button type="button" data-action="black-cancel" data-id="'+esc(lot.id)+'">Снять с рынка</button>';
  }else if(!you.bankrupt){
   const cost=you.inspectionPrices?.black??25;
   if(!inspected)out+='<button type="button" data-action="black-inspect" data-id="'+esc(lot.id)+
     '" '+(you.resources.gold<cost?'disabled':'')+'>Экспертиза ('+cost+' золота)</button>';
   out+='<form data-form="black-bid" data-lot-id="'+esc(lot.id)+'" class="stack">'+
     '<p>Твоя закрытая ставка:</p>'+resourceFields('offer',lot.myBid||lot.ask)+
     '<button type="submit" class="primary">Отправить закрытую ставку</button></form>';
   if(lot.myBid)out+='<button type="button" data-action="black-withdraw" data-id="'+esc(lot.id)+'">Отозвать свою ставку</button>';
  }
  out+='</section>';
 }
 if(!(state.blackLots||[]).length)out+='<p class="muted">Анонимных лотов пока нет.</p>';
 if(!you.bankrupt&&you.blackListedRound!==state.round){
  const options=you.items.filter(i=>i.acquiredRound!==state.round&&i.id!==state.listing?.id);
  if(options.length)out+='<form class="stack" data-form="black-post">'+
   '<h3>Выставить анонимный предмет</h3>'+
   '<label>Предмет<select name="itemId">'+options.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.name)+'</option>').join('')+'</select></label>'+
   '<p>Ожидаемая цена:</p>'+resourceFields('ask',{gold:90})+
   '<button type="submit" class="primary">Передать лот посреднику</button></form>';
  else out+='<p>Нет старых свободных предметов для анонимного размещения.</p>';
 }else if(you.blackListedRound===state.round)out+='<p class="muted">Ты уже выставлял предмет на этой торговой волне.</p>';
 return out+'</div>';
}
function repackBlock(you){
 const options=you.items.filter(i=>i.acquiredRound!==state.round&&i.id!==state.listing?.id);
 if(!options.length||you.bankrupt)return '';
 const price=state.repackCost||{gold:20,parts:1};
 return '<div class="panel"><h2>Перепаковка предмета</h2>'+
 '<p class="muted">Стоимость: '+price.gold+' золота и '+price.parts+' деталей. Можно поменять торговое название экземпляра, но не свойства. Экспертиза установит оригинал.</p>'+
 '<form class="stack" data-form="repack">'+
 '<label>Предмет<select name="itemId">'+options.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.name)+'</option>').join('')+'</select></label>'+
 '<label>Новая этикетка<select name="aliasIndex">'+you.disguises.map((n,i)=>'<option value="'+i+'">'+esc(n)+'</option>').join('')+'</select></label>'+
 '<button type="submit" '+(you.resources.gold<price.gold||you.resources.parts<price.parts?'disabled':'')+'>Перепаковать</button>'+
 '</form></div>';
}
function actionsBlock(you){
 let html='<div class="panel"><h2>Мой ход: операции</h2>';
 if(you.bankrupt)return html+'<p>Ты обанкротился. Можно наблюдать за ходом партии.</p><button data-action="end">Пропустить ход</button></div>';
 html+='<p>Можно подработать, купить запечатанный товар, провести торги и выполнить одну операцию с ломбардом или разбором.</p>';
 if(state.broker){
  const stock=state.broker;
  html+='<section><button type="button" class="inventory-object" data-action="open-item" data-kind="broker" data-id="'+esc(stock.id)+'">'+
 '<span class="inventory-art">'+artifactSVG(stock.name,stock.rarity)+'</span><span class="inventory-copy"><strong>'+esc(stock.name)+'</strong><small>Запечатано · 75 золота</small></span>'+svgIcon('arrow',18)+'</button>'+
    '<p>Цена: 75 золота. До покупки свойства неизвестны. Купленный предмет нельзя продать или разобрать в этом раунде.</p>'+
    '<button type="button" data-action="broker-buy" '+(you.resources.gold<75||you.items.length+(you.escrowItems?.length||0)>=4?'disabled':'')+
    '>Купить запечатанный предмет</button></section>';
 }
 if(!you.worked)html+='<form class="row" data-form="work"><label>Подработка<select name="resource"><option value="gold">+35 золота</option><option value="crystals">+4 кристалла</option><option value="parts">+1 деталь</option></select></label><button type="submit">Подработать</button></form>';
 else html+='<p class="success">Подработка выполнена.</p>';
 const resell=you.items.filter(i=>i.acquiredRound!==state.round&&i.id!==state.listing?.id);
 if(you.marketDeals<2&&resell.length)html+='<form data-form="post" class="stack"><h3>Выставить предмет</h3>'+
   '<label>Какой товар<select name="itemId">'+resell.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.name)+'</option>').join('')+'</select></label>'+
   '<p>Цена (можно просить несколько ресурсов одновременно)</p>'+resourceFields('ask',{gold:100})+
   '<button type="submit" class="primary">Выставить лот</button></form>';
 if(!you.usedPawn){
  html+='<h3>Аварийный ломбард</h3><form data-form="exchange" class="row"><label>Обмен<select name="mode">'+
    '<option value="buy_crystals">70 золота → 6 кристаллов</option><option value="buy_parts">90 золота → 1 деталь</option>'+
    '<option value="sell_crystals">6 кристаллов → 25 золота</option><option value="sell_parts">1 деталь → 40 золота</option>'+
    '</select></label><button type="submit">Обменять</button></form>';
  if(you.items.length)html+='<form data-form="pawn" class="row"><label>Продать за 45 золота<select name="itemId">'+you.items.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.name)+'</option>').join('')+'</select></label><button type="submit">Сдать предмет</button></form>';
  const dismantle=you.items.filter(i=>i.acquiredRound!==state.round);
  if(dismantle.length)html+='<form data-form="salvage" class="row"><label>Разобрать за '+(state.salvageParts??2)+' детали<select name="itemId">'+dismantle.map(i=>
     '<option value="'+esc(i.id)+'">'+esc(i.name)+'</option>').join('')+'</select></label>'+
     '<button type="submit">Разобрать предмет</button></form>';
 }else html+='<p class="muted">Ломбард использован в этом ходу.</p>';
 return html+'<button type="button" class="primary" data-action="end">Завершить ход →</button></div>';
}
function collectDrafts(){
 const current={};
 for(const form of app.querySelectorAll('form[data-form]')){
  const id=form.dataset.form+':'+(form.dataset.dealId||form.dataset.lotId||'');
  current[id]=Object.fromEntries(new FormData(form).entries());
  if(form.dataset.form==='counter')current[id].expanded=form.closest('details')?.open;
 }
 return current;
}
function restoreDrafts(drafts){
 for(const form of app.querySelectorAll('form[data-form]')){
  const vals=drafts[form.dataset.form+':'+(form.dataset.dealId||form.dataset.lotId||'')];
  if(!vals)continue;
  if(form.dataset.form==='counter'&&vals.expanded)form.closest('details').open=true;
  if(form.dataset.form==='deal'&&vals.to){
   const target=state?.players?.find(p=>p.id===vals.to);
   const requested=form.querySelector('#dealWantItem');
   if(target&&requested)requested.innerHTML=itemOptions(target.inventory.filter(i=>i.tradable));
  }
  for(const field of Array.from(form.elements)){
   if(!field.name||vals[field.name]===undefined)continue;
   const value=vals[field.name];
   if(field.tagName==='SELECT'&&!Array.from(field.options).some(o=>o.value===value))continue;
   field.value=value;
  }
 }
}
function updateTurnClock(){
 const node=document.querySelector('#turnClock');
 if(!node||!state?.deadlineAt)return;
 const left=Math.max(0,Math.ceil((state.deadlineAt-Date.now())/1000));
 node.textContent=Math.floor(left/60)+':'+String(left%60).padStart(2,'0');
 node.setAttribute('aria-label','До конца хода '+left+' секунд');
}
function eventBlock(){
 const e=state.event;
 return e?'<section class="panel"><h2>Событие раунда: '+esc(e.title)+'</h2><p>'+esc(e.description)+'</p></section>':'';
}

const rarityLabel=r=>r==='редкий'?'Редкая вещь':'Обычная вещь';
function artifactFacts(item,{showPositive=false,showNegative=false,inspection=false}={}){
 const knownPlus=showPositive&&item?.positive;
 const knownMinus=showNegative&&item?.negative;
 const effect=(fx,kind)=>'<span class="detail-effect '+kind+'">'+svgIcon(kind==='plus'?'leaf':'eye',19)+
 '<span>'+esc(formatEffect(fx,kind==='minus'))+'</span></span>';
 return '<div class="detail-facts">'+
 '<div><small>Доход</small>'+(knownPlus?effect(item.positive,'plus'):'<strong class="detail-unknown">Неизвестен</strong>')+'</div>'+
 '<div><small>Содержание</small>'+(knownMinus?effect(item.negative,'minus'):'<strong class="detail-unknown">Неизвестно</strong>')+'</div>'+
 '</div>'+
 ((knownPlus||knownMinus)&&item.special?'<div class="detail-special">'+specialLine(item.special)+'</div>':'')+
 (inspection&&item.curse?'<p class="error">'+esc(curseHint(item.curse))+'</p>':'');
}
function artifactDetailBlock(you){
 const target=selectedArtifact;
 if(!target)return '<div class="panel"><p>Выбери предмет на столе.</p></div>';
 let item=null,kind=target.kind,body='',caption='';
 const locked=you.bankrupt===true,active=state.turnId===me?.id;
 const itemCard=(name,rarity,subtitle)=>'<div class="detail-hero '+(rarity==='редкий'?'is-rare':'')+'">'+
 '<div class="detail-display">'+artifactSVG(name,rarity)+'</div>'+
 '<div class="detail-title"><span class="rarity-stamp">'+rarityLabel(rarity)+'</span>'+
 '<h3>'+esc(name)+'</h3><p>'+esc(subtitle)+'</p></div></div>';
 if(kind==='inventory'){
  item=you.items.find(i=>i.id===target.id);
  if(!item)return '<div class="panel">Предмет уже выбыл из инвентаря.<p><button type="button" data-action="open-sheet" data-sheet="inventory">К инвентарю</button></p></div>';
  const tradable=item.acquiredRound!==state.round&&state.listing?.id!==item.id;
  const free=tradable&&!locked;
  body=itemCard(item.name,item.rarity,tradable?'Можно передавать':'Получен в этом раунде')+
   artifactFacts(item,{showPositive:true,showNegative:true})+
   '<div class="detail-actions">'+
   (free?'<button type="button" data-action="detail-trade" data-id="'+esc(item.id)+'">'+svgIcon('trade')+' Обмен</button>':'')+
   (free&&active&&you.marketDeals<2?
    '<form class="detail-offer-form" data-form="detail-post"><input type="hidden" name="itemId" value="'+esc(item.id)+'">'+
     '<strong>Выставить на торги</strong>'+resourceFields('ask',{gold:100})+
     '<button type="submit" class="primary">'+svgIcon('gavel')+' Выставить</button></form>':'')+
   (!locked&&active&&!you.usedPawn?
     '<div class="detail-secondary-actions"><button type="button" data-action="detail-pawn" data-id="'+esc(item.id)+'">Ломбард · 45 золота</button>'+
     (tradable?'<button type="button" data-action="detail-salvage" data-id="'+esc(item.id)+'">Разобрать · '+(state.salvageParts??2)+' детали</button>':'')+'</div>':'')+
   (tradable&&!locked?
     '<form class="detail-offer-form" data-form="detail-repack"><input type="hidden" name="itemId" value="'+esc(item.id)+'">'+
      '<label>Сменить этикетку<select name="aliasIndex">'+you.disguises.map((n,i)=>'<option value="'+i+'">'+esc(n)+'</option>').join('')+'</select></label>'+
      '<button type="submit" '+(you.resources.gold<(state.repackCost?.gold??20)||you.resources.parts<(state.repackCost?.parts??1)?'disabled':'')+'>Перепаковать · '+(state.repackCost?.gold??20)+' золота</button></form>':'')+
   '</div>';
 }else if(kind==='listing'){
  item=state.listing;
  if(!item||item.id!==target.id)return '<div class="panel">Лот уже снят или продан.<p><button type="button" data-action="open-sheet" data-sheet="market">К торгам</button></p></div>';
  const mine=item.seller===me?.id;
  const privateItem=mine?you.items.find(i=>i.id===item.id):null;
  const checked=you.inspections.find(i=>i.itemId===item.id);
  body=itemCard(item.name,item.rarity,'Продавец: '+label(item.seller))+
   '<div class="detail-ask"><small>Запрошено</small><strong>'+esc(amounts(item.ask))+'</strong></div>'+
   artifactFacts(privateItem||checked||{},{showPositive:!!privateItem,showNegative:!!(privateItem||checked),inspection:!privateItem})+
   '<div class="detail-actions">'+
   (mine?
    (state.bids.length?state.bids.map(b=>'<div class="detail-bid"><span>'+esc(label(b.buyer))+' · '+esc(amounts(b.offer))+'</span>'+
      '<button type="button" data-action="accept" data-player="'+esc(b.buyer)+'">Принять</button></div>').join(''):'<p class="muted">Пока нет предложений.</p>')+
     '<button type="button" data-action="cancel">Снять лот</button>':
    (!locked?
     ((!checked?'<button type="button" data-action="inspect" '+(you.resources.gold<(you.inspectionPrices?.public??15)?'disabled':'')+'>'+svgIcon('eye')+' Проверить · '+(you.inspectionPrices?.public??15)+' золота</button>':'')+
      '<form class="detail-offer-form" data-form="detail-bid"><strong>Твоя ставка</strong>'+resourceFields('offer',item.ask)+
      '<button type="submit" class="primary">'+svgIcon('gavel')+' Предложить</button></form>'+
      (state.bids.some(b=>b.buyer===me?.id)?'<button type="button" data-action="withdraw">Отозвать ставку</button>':'')):'<p class="muted">Торг недоступен после банкротства.</p>'))+
   '</div>';
 }else if(kind==='broker'){
  item=state.broker;
  if(!item||item.id!==target.id)return '<div class="panel">Предмет у брокера уже сменился.<p><button type="button" data-action="open-sheet" data-sheet="actions">К операциям</button></p></div>';
  const canBuy=active&&!locked&&you.resources.gold>=75&&you.items.length+(you.escrowItems?.length||0)<4;
  body=itemCard(item.name,item.rarity,'Запечатанный товар')+
   '<div class="detail-ask"><small>Цена</small><strong>75 золота</strong></div>'+
   artifactFacts({})+
   '<div class="detail-actions"><button type="button" data-action="broker-buy" '+(canBuy?'':'disabled')+' class="primary">'+svgIcon('bag')+' Купить</button>'+
   (!active?'<p class="muted">Доступно в свой ход.</p>':'')+'</div>';
 }else if(kind==='black'){
  const lot=(state.blackLots||[]).find(x=>x.id===target.id);
  if(!lot)return '<div class="panel">Этот лот уже недоступен.<p><button type="button" data-action="open-sheet" data-sheet="market">К рынку</button></p></div>';
  item=lot.item;
  const inspected=lot.inspection;
  body=itemCard(item.name,item.rarity,'Анонимный продавец')+
   '<div class="detail-ask"><small>Запрошено</small><strong>'+esc(amounts(lot.ask))+'</strong></div>'+
   (inspected?'<p class="detail-inspected">Оригинал: '+esc(inspected.originalName)+'</p>':'')+
   artifactFacts(inspected||{},{showNegative:!!inspected,inspection:true})+
   '<div class="detail-actions">'+
   (lot.mine?
     (lot.bids?.length?lot.bids.map(b=>'<div class="detail-bid"><span>'+esc(amounts(b.offer))+'</span>'+
        '<button type="button" data-action="black-accept" data-id="'+esc(lot.id)+'" data-bid="'+esc(b.id)+'">Принять</button></div>').join(''):'<p class="muted">Пока нет ставок.</p>')+
      '<button type="button" data-action="black-cancel" data-id="'+esc(lot.id)+'">Вернуть предмет</button>':
     (!locked?
       (!inspected?'<button type="button" data-action="black-inspect" data-id="'+esc(lot.id)+'" '+(you.resources.gold<(you.inspectionPrices?.black??25)?'disabled':'')+'>'+svgIcon('eye')+' Экспертиза · '+(you.inspectionPrices?.black??25)+'</button>':'')+
       '<form class="detail-offer-form" data-form="detail-black-bid" data-lot-id="'+esc(lot.id)+'"><strong>Закрытая ставка</strong>'+
       resourceFields('offer',lot.myBid||lot.ask)+'<button type="submit" class="primary">Предложить</button></form>'+
       (lot.myBid?'<button type="button" data-action="black-withdraw" data-id="'+esc(lot.id)+'">Отозвать ставку</button>':'')
       :'<p class="muted">Ставки недоступны.</p>'))+
   '</div>';
 }else return '<div class="panel">Предмет не найден.</div>';
 return '<div class="artifact-detail">'+body+'</div>';
}

const sheetTitles={
 detail:'Предмет',secret:'Задания',inventory:'Инвентарь',deals:'Обмен',market:'Торги',
 actions:'Мой ход',players:'Игроки'
};
function openSheet(sheetName,focus=false,targetId=''){
 if(!document.querySelector('#bazaarSheet'))return;
 if(sheetName&&!Object.prototype.hasOwnProperty.call(sheetTitles,sheetName))return;
 activeSheet=sheetName;
 const sheet=document.querySelector('#bazaarSheet'),backdrop=document.querySelector('#sheetBackdrop');
 sheet.hidden=!sheetName;backdrop.hidden=!sheetName;
 document.body.classList.toggle('sheet-open',Boolean(sheetName));
 for(const page of sheet.querySelectorAll('[data-sheet-page]'))page.hidden=page.dataset.sheetPage!==sheetName;
 const title=sheet.querySelector('#sheetTitle');if(title&&sheetName)title.textContent=sheetTitles[sheetName];
 for(const tab of app.querySelectorAll('[data-action="open-sheet"]')){
  tab.setAttribute('aria-expanded',String(tab.dataset.sheet===sheetName));
 }
 if(focus&&sheetName){
  requestAnimationFrame(()=>{
   if(targetId)document.getElementById(targetId)?.scrollIntoView({block:'nearest'});
   sheet.querySelector('[data-action="close-sheet"]')?.focus({preventScroll:true});
  });
 }else if(focus&&!sheetName){
  lastSheetTrigger?.focus?.({preventScroll:true});
 }
}
function resourceWallet(w){
 return '<div class="currency-strip" aria-label="Мои ресурсы">'+
 [['gold','coin','Золото'],['crystals','gem','Кристаллы'],['parts','parts','Детали']].map(([k,icon,label])=>
 '<span class="currency" title="'+label+'" aria-label="'+label+': '+(w[k]??0)+'">'+
 svgIcon(icon)+'<strong>'+(w[k]??0)+'</strong><em>'+label+'</em></span>').join('')+'</div>';
}
function renderPlay(){
 const drafts=mode==='play'?collectDrafts():{};
 mode='play';const you=state.you;
 if(!you){app.innerHTML='<p class="panel">Подключаемся к комнате…</p>';return;}
 const active=state.turnId===me?.id;
 const turnName=active?'Твой ход':'Ходит '+label(state.turnId);
 const seats=state.players.map(p=>{
 const isMe=p.id===me?.id;
 const available=!isMe&&p.connected&&!p.bankrupt&&!you.bankrupt;
 const disabled=!isMe&&!available;
 return '<button type="button" class="seat '+(p.id===state.turnId?'is-turn ':'')+(isMe?'is-me ':'')+(p.bankrupt?'is-bankrupt ':'')+
 '" data-action="'+(isMe?'open-sheet':'trade-with')+'" '+(isMe?'data-sheet="inventory"':'data-player="'+esc(p.id)+'"')+
 (disabled?' disabled title="Игрок недоступен"':' title="'+(isMe?'Мой инвентарь':'Предложить обмен')+'"')+
 ' aria-label="'+esc(p.character)+' — '+esc(p.name)+(available?', предложить обмен':'')+'">'+
 '<span class="seat-portrait">'+characterMarkup(roleCharacter(p.character),'seat-character')+'</span>'+
 '<strong>'+esc(p.character)+'</strong><small>'+esc(p.name)+'</small></button>';
 }).join('');
 const listing=state.listing;
 const lot=listing?
 '<button type="button" class="artifact" data-action="open-item" data-kind="listing" data-id="'+esc(listing.id)+'" aria-label="Открыть лот: '+esc(listing.name)+'">'+
 artifactSVG(listing.name,listing.rarity)+'<strong>'+esc(listing.name)+'</strong></button>':
 '<div class="artifact-note">Лота пока нет</div>';
 const ownItems=you.items.length?'<div class="mini-artifacts" aria-label="Мои предметы">'+
 you.items.map(it=>'<button type="button" data-action="open-item" data-kind="inventory" data-id="'+esc(it.id)+'" title="'+esc(it.name)+'" aria-label="Посмотреть '+esc(it.name)+'">'+
 artifactSVG(it.name,it.rarity)+'<span>'+esc(it.name)+'</span></button>').join('')+'</div>':'';
 const edge=[
 ['secret','scroll','Задания'],['inventory','bag','Инвентарь'],
 ['deals','trade','Обмен'],['players','people','Игроки']
 ].map(([name,icon,title])=>'<button type="button" class="edge-tab" data-action="open-sheet" data-sheet="'+name+
 '" aria-label="'+title+'" aria-controls="bazaarSheet" aria-expanded="false" title="'+title+'">'+
 svgIcon(icon)+'<span>'+title+'</span></button>').join('');
 const sheets=
 '<section class="sheet-page" data-sheet-page="detail">'+artifactDetailBlock(you)+'</section>'+
 '<section class="sheet-page" data-sheet-page="secret">'+secretBlock(you)+urgentBlock(you)+'</section>'+
 '<section class="sheet-page" data-sheet-page="inventory">'+inventoryBlock(you)+repackBlock(you)+'</section>'+
 '<section class="sheet-page" data-sheet-page="deals">'+tradePanel(you)+'</section>'+
 '<section class="sheet-page" data-sheet-page="market">'+marketBlock(you,active)+blackMarketBlock(you)+'</section>'+
 '<section class="sheet-page" data-sheet-page="actions">'+
 (active?actionsBlock(you):'<div class="panel">Сейчас ходит другой игрок. Прямые сделки доступны в разделе «Обмен».</div>')+'</section>'+
 '<section class="sheet-page" data-sheet-page="players">'+scoreBox()+eventBlock()+
 '<div class="panel"><h2>События</h2><ol>'+state.log.map(e=>'<li>'+esc(e)+'</li>').join('')+'</ol></div></section>';
 app.innerHTML='<div class="play-screen"><div class="play-head">'+
 '<h1>Раунд '+state.round+' / '+state.rounds+'</h1>'+
 '<span class="chip">'+esc(turnName)+'</span>'+
 '<span class="chip" aria-label="До конца хода">◷ <strong id="turnClock" role="timer">—</strong></span>'+
 '<button type="button" class="leave-button" data-action="leave">Выйти</button></div>'+
 resourceWallet(you.resources)+
 '<div class="play-field" data-player-count="'+state.players.length+'">'+
 '<div class="ambient-lights" aria-hidden="true"><i></i><i></i><i></i><i></i></div>'+
 '<div class="player-seats" data-seats="'+state.players.length+'">'+seats+'</div>'+
 '<div class="table-stage">'+lot+ownItems+
 (state.blackMarket?'<button type="button" data-action="open-sheet" data-sheet="market">'+svgIcon('eye')+' Чёрный рынок</button>':'')+
 (state.event?'<button type="button" data-action="open-sheet" data-sheet="players" class="table-event">'+svgIcon('leaf')+' '+esc(state.event.title)+'</button>':'')+
 '</div><div class="bottom-ribbon">'+
 '<button class="primary" type="button" data-action="open-sheet" data-sheet="market">'+svgIcon('gavel')+' Торг</button>'+
 '<button type="button" data-action="open-sheet" data-sheet="actions">'+svgIcon('box')+' '+(active?'Мой ход':'Операции')+'</button>'+
 '</div><nav class="edge-tabs" aria-label="Разделы игры">'+edge+'</nav></div>'+
 '<button type="button" id="sheetBackdrop" class="sheet-backdrop" data-action="close-sheet" aria-label="Закрыть панель" hidden></button>'+
 '<aside id="bazaarSheet" class="side-sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle" hidden>'+
 '<div class="sheet-heading"><h2 id="sheetTitle"></h2><button type="button" data-action="close-sheet" aria-label="Закрыть">'+svgIcon('close',26)+'</button></div>'+sheets+
 '</aside></div>';
 restoreDrafts(drafts);
 openSheet(activeSheet);
 applyCharacterArt(app);
 updateTurnClock();
}
function renderDone(){
 mode='done';activeSheet=null;selectedArtifact=null;document.body.classList.remove('sheet-open');
 const ranks=state.ranking||[];
 app.innerHTML='<h1>Партия окончена</h1><p>Рейтинг по выполнению секретной квоты. Банкротство лишает права на победу; легендарная связь может изменить второе место.</p>'+
 '<div class="panel"><table class="table"><thead><tr><th>Место</th><th>Игрок</th><th>Квота</th><th>Итог</th></tr></thead><tbody>'+
 ranks.map(p=>'<tr><td>'+p.place+'</td><td>'+esc(p.character)+' · '+esc(p.name)+'</td><td>'+p.progress+'%</td><td>'+(p.bankrupt?'банкрот':p.complete?'выполнена':'не выполнена')+'</td></tr>').join('')+
 '</tbody></table></div>'+
 (state.report?'<div class="panel"><h2>Итоги торговли за партию</h2><p>Публичные продажи: '+state.report.publicSales+
 '; частные сделки: '+state.report.privateDeals+'; продажи на чёрном рынке: '+state.report.blackSales+
 '; экспертизы: '+state.report.inspections+'; перепаковки: '+state.report.repack+
 '; разборы: '+state.report.salvage+'.</p>'+
 '<p>Срочных заказов выполнено: '+state.report.urgentMet+
 '; провалено: '+state.report.urgentMissed+
 '; заблокировано амулетом: '+state.report.wardUsed+
 '; проклятий сработало: '+state.report.curseFired+'.</p></div>':'')+
 '<div class="row">'+(state.host===me?.id?'<button type="button" data-action="start" class="primary">Новая партия</button>':'')+
 '<button type="button" data-action="leave">В меню</button></div>';
}
function render(){
 if(!state)return renderHome();
 if(state.phase==='lobby')return renderLobby();
 if(state.phase==='done')return renderDone();
 return renderPlay();
}
function closeRoom(){
 activeSheet=null;selectedArtifact=null;document.body.classList.remove('sheet-open');
 if(net){try{if(connected)net.leaveRoom()}catch{}try{net.close()}catch{}}
 net=null;me=null;state=null;roomId='';connected=false;connecting=false;message('');renderHome();
}
function wire(client){
 client.on('connected',data=>{if(net!==client)return;me=data.player;connected=true;message('PocketNet подключён.');});
 client.on('room_joined',data=>{if(net!==client)return;roomId=data.roomId;state=data.state;connecting=false;message('Комната подключена.');render();});
 client.on('game_event',data=>{if(net!==client)return;if(data.event?.type==='state'){state=data.event.payload;render();}else if(data.event?.type==='notice')message(data.event.payload,true);});
 client.on('disconnected',()=>{if(net!==client)return;connected=false;message('Связь потеряна. PocketNet переподключается…',true);});
 client.on('error',e=>{
  if(net!==client)return;
  const code=String(e?.code||e?.message||'неизвестно');
  if(code==='room_not_found'||code==='room_version_unavailable'){
    netStorage.removeItem('pocket-net:'+ORIGIN);
    net.close();net=null;state=null;roomId='';me=null;connecting=false;connected=false;
    renderHome();message('Комната больше недоступна. Можно создать новую.',true);
    return;
  }
  message('Ошибка сервера: '+code,true);
 });
 client.on('room_closed',()=>{if(net!==client)return;closeRoom();message('Комната закрылась.',true);});
}
async function connect(kind,code=''){
 if(connecting)return;
 connecting=true;state=null;roomId='';renderHome();message('Подключение к PocketNet…');
 try{
  if(net){net.close();net=null;}
  const storage=netStorage;
  if(kind!=='resume')storage.removeItem('pocket-net:'+ORIGIN);
  const client=new PocketNet({serverUrl:ORIGIN,name,storage});net=client;wire(client);
  await client.connect();
  if(net!==client)return;
  if(kind==='create')client.createRoom(GAME_ID);
  else if(kind==='join')client.joinRoom(code);
  else if(!client.roomId){connecting=false;renderHome();message('Сохранённая комната не найдена.',true);}
 }catch(e){connecting=false;message('Нет соединения: '+e.message,true);if(net){net.close();net=null;}}
}
function request(payload){
 if(!net||!connected){message('Нет соединения с комнатой.',true);return;}
 try{net.sendGame(payload);message('Команда отправлена.');}catch(e){message('Не удалось отправить: '+e.message,true);}
}
async function copy(value){
 try{await navigator.clipboard.writeText(value);message('Скопировано.');}
 catch{message('Не удалось скопировать — используйте выделение текста.',true);}
}
app.addEventListener('click',event=>{
 const btn=event.target.closest('button[data-action]');if(!btn||btn.disabled)return;
 const action=btn.dataset.action;
 if(action==='open-item'){
  lastSheetTrigger=btn;selectedArtifact={kind:btn.dataset.kind,id:btn.dataset.id};
  openSheet('detail',true);
  return;
 }
 if(action==='detail-trade'){
  const item=state?.you?.items?.find(i=>i.id===btn.dataset.id);
  if(!item||item.acquiredRound===state.round||state.you.bankrupt)return;
  openSheet('deals',true);
  const dropdown=app.querySelector('form[data-form="deal"] select[name="giveItemId"]');
  if(dropdown&&[...dropdown.options].some(o=>o.value===item.id))dropdown.value=item.id;
  return;
 }
 if(action==='detail-pawn'||action==='detail-salvage'){
  const item=state?.you?.items?.find(i=>i.id===btn.dataset.id);
  if(!item||state.turnId!==me?.id||state.you.bankrupt)return;
  if(action==='detail-pawn'){
   if(state.you.usedPawn)return;
   if(confirm('Безвозвратно сдать «'+item.name+'» за 45 золота?'))request({type:'pawn',itemId:item.id});
  }else if(item.acquiredRound!==state.round){
   if(state.you.usedPawn)return;
   if(confirm('Безвозвратно разобрать «'+item.name+'» на '+(state.salvageParts??2)+' детали?'))request({type:'salvage',itemId:item.id});
  }
  return;
 }
 if(action==='trade-with'){
  const recipient=state?.players?.find(p=>p.id===btn.dataset.player);
  if(!recipient?.connected||recipient.bankrupt||state?.you?.bankrupt)return;
  lastSheetTrigger=btn;openSheet('deals',true);
  const choose=app.querySelector('#dealTarget');
  if(choose&&[...choose.options].some(o=>o.value===recipient.id)){
   choose.value=recipient.id;
   const dropdown=app.querySelector('#dealWantItem');
   if(dropdown)dropdown.innerHTML=itemOptions((recipient.inventory||[]).filter(i=>i.tradable));
  }
  return;
 }
 if(action==='open-sheet'){
  lastSheetTrigger=btn;
  const next=activeSheet===btn.dataset.sheet?null:btn.dataset.sheet;
  openSheet(next,true,btn.dataset.scroll||'');return;
 }
 if(action==='close-sheet'){openSheet(null,true);return;}
 if(action==='create'){localStore();connect('create');return;}
 if(action==='join'){
  localStore();let code=document.querySelector('#roomCode')?.value.trim()||'';
  try{if(/^https?:/i.test(code))code=new URL(code).searchParams.get('room')||'';}catch{}
  if(!code){message('Введите код комнаты.',true);return;}
  connect('join',code);return;
 }
 if(action==='copy-code')return copy(roomId.slice(0,8).toUpperCase());
 if(action==='copy-url')return copy(new URL('./?room='+encodeURIComponent(roomId),location.href).href);
 if(action==='leave'){
  if(state?.phase==='play'&&!confirm('Покинуть текущую партию?'))return;
  closeRoom();return;
 }
 if(action==='deal-accept'){
  const d=(state.deals||[]).find(x=>x.id===btn.dataset.id);
  if(d&&confirm('Подтвердить прямой обмен? '+label(d.from)+' отдаёт '+amounts(d.give)+'; '+label(d.to)+' отдаёт '+amounts(d.want)+'.'))
    request({type:'deal_accept',dealId:btn.dataset.id});
  return;
 }
 if(action==='deal-cancel')return request({type:'deal_cancel',dealId:btn.dataset.id});
 if(action==='black-accept'){
  if(confirm('Принять закрытую ставку? Посредник удержит 10% комиссии.'))request({type:'black_accept',lotId:btn.dataset.id,bidId:btn.dataset.bid});
  return;
 }
 if(action==='black-cancel'){
  if(confirm('Вернуть товар из анонимного рынка? Новый лот до следующей торговой волны недоступен.'))request({type:'black_cancel',lotId:btn.dataset.id});
  return;
 }
 if(action==='black-inspect')return request({type:'black_inspect',lotId:btn.dataset.id});
 if(action==='black-withdraw')return request({type:'black_withdraw',lotId:btn.dataset.id});
 if(action==='broker-buy')return request({type:'broker_buy'});
 if(action==='start')return request({type:'start'});
 if(action==='inspect')return request({type:'inspect'});
 if(action==='withdraw')return request({type:'withdraw_bid'});
 if(action==='cancel')return request({type:'cancel'});
 if(action==='accept'){
  if(confirm('Подтвердить продажу по предложенной цене?'))request({type:'accept',buyer:btn.dataset.player});
  return;
 }
 if(action==='end'){
  if(state?.you?.urgent?.status==='pending'&&!keys.every(k=>state.you.resources[k]>=(state.you.urgent.needs[k]||0))){
   if(!confirm('Срочный заказ не обеспечен ресурсами. Завершение хода даст штраф. Продолжить?'))return;
  }
  return request({type:'end'});
 }
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&activeSheet){event.preventDefault();openSheet(null,true);}
 if(event.key==='Tab'&&activeSheet){
  const sheet=document.querySelector('#bazaarSheet');
  const focusable=[...sheet.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,a[href]')]
   .filter(el=>el.getClientRects().length);
  if(!focusable.length)return;
  const first=focusable[0],last=focusable.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
});
app.addEventListener('change',event=>{
 if(event.target.id!=='dealTarget')return;
 const target=state?.players?.find(p=>p.id===event.target.value);
 const dropdown=document.querySelector('#dealWantItem');
 if(dropdown&&target)dropdown.innerHTML=itemOptions(target.inventory.filter(i=>i.tradable));
});
app.addEventListener('submit',event=>{
 const form=event.target.closest('form[data-form]');if(!form)return;
 event.preventDefault();const data=new FormData(form),type=form.dataset.form;
 const wallet=prefix=>Object.fromEntries(keys.map(k=>[k,Number(data.get(prefix+'_'+k)||0)]));
 if(type==='detail-post')return request({type:'post',itemId:data.get('itemId'),ask:wallet('ask')});
 if(type==='detail-bid')return request({type:'bid',offer:wallet('offer')});
 if(type==='detail-black-bid')return request({type:'black_bid',lotId:form.dataset.lotId,offer:wallet('offer')});
 if(type==='detail-repack')return request({type:'repack',itemId:data.get('itemId'),aliasIndex:Number(data.get('aliasIndex'))});
 if(type==='counter')return request({type:'deal_counter',dealId:form.dataset.dealId,
   give:wallet('give'),want:wallet('want'),
   giveItemId:data.get('giveItemId')||null,wantItemId:data.get('wantItemId')||null
 });
 if(type==='black-post')return request({type:'black_post',itemId:data.get('itemId'),ask:wallet('ask')});
 if(type==='black-bid')return request({type:'black_bid',lotId:form.dataset.lotId,offer:wallet('offer')});
 if(type==='repack')return request({type:'repack',itemId:data.get('itemId'),aliasIndex:Number(data.get('aliasIndex'))});
 if(type==='deal')return request({type:'deal_propose',
   to:data.get('to'),give:wallet('give'),want:wallet('want'),
   giveItemId:data.get('giveItemId')||null,wantItemId:data.get('wantItemId')||null
 });
 if(type==='post')return request({type:'post',itemId:data.get('itemId'),ask:wallet('ask')});
 if(type==='bid')return request({type:'bid',offer:wallet('offer')});
 if(type==='work')return request({type:'work',resource:data.get('resource')});
 if(type==='pawn'){
  if(confirm('Безвозвратно сдать предмет в ломбард за 45 золота?'))request({type:'pawn',itemId:data.get('itemId')});
  return;
 }
 if(type==='salvage'){
  if(confirm('Безвозвратно разобрать предмет на 2 детали?'))request({type:'salvage',itemId:data.get('itemId')});
  return;
 }
 if(type==='exchange')return request({type:'exchange',mode:data.get('mode')});
});
renderHome();
loadCharacterArt().catch(error=>{console.warn('Unable to load character art:',error);message('Иллюстрации недоступны — игра продолжает работать.',true);});
let lastHeartbeat=0;
setInterval(()=>{
 updateTurnClock();
 if(connected&&state?.phase==='play'&&net&&Date.now()-lastHeartbeat>8000){
  lastHeartbeat=Date.now();
  try{net.sendGame({type:'tick'});}catch{}
 }
},1000);
try{const saved=JSON.parse(netStorage.getItem('pocket-net:'+ORIGIN)||'null');if(saved?.roomId)connect('resume');}catch{}
