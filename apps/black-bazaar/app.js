import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {PocketNet} from '../../shared/capabilities/net.js';
import {svgIcon,brandEmblem} from './art.js';
import {artifactSVG} from './art/artifacts.js';
import {forecastEconomy} from './economy.js';
import {classifyFeedback,createAudioFeedback} from './feedback.js';
import {roleCharacter,characterMarkup,applyCharacterArt,loadCharacterArt} from './art/characters.js';
import {createBazaarDebug} from './debug-console.js';
import {createDebugState,debugSetItem,debugCommand} from './debug-state.js';

const debugPreview=new URLSearchParams(location.search).has('debugPreview');
installMobileRuntime();
if(!debugPreview)createWorkshopMode({appName:'Чёрная барахолка',version:'0.15.3',cachePrefix: 'black-bazaar-',storageNamespace: 'pocket-works:black-bazaar',onReset(){localStorage.removeItem('black-bazaar:name');}});

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
const playerOnline=p=>onlinePlayerIds?onlinePlayerIds.has(p.id):p.connected;
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
let onlinePlayerIds=null;
let net=null,me=null,state=null,roomId='',mode='home',connecting=false,connected=false;
let roomVersion=debugPreview?'v17':null;
let name=(localStorage.getItem('black-bazaar:name')||'Игрок').slice(0,22);
const decorativeGuests=['mage','mushroom','fluffy_monster','sheep_wolf','toy','prince','many_eyed_cat','flower','old_man'];
let notice='';
let activeSheet=null,lastSheetTrigger=null,selectedArtifact=null;
let playStarted=false;
const readDeals=new Set(),readTasks=new Set();
const sound=createAudioFeedback(debugPreview?{storage:{getItem:()=>null,setItem(){}}}:{});
let cueTimer=null;
function message(m,isError=false){notice=m;status.textContent=m;status.className=isError?'error':'muted';}
function soundToggle(){
 const enabled=sound.isEnabled();
 return '<button class="sound-toggle" type="button" data-action="toggle-sound" aria-pressed="'+enabled+'" aria-label="'+
 (enabled?'Выключить звук':'Включить звук')+'" title="'+(enabled?'Выключить звук':'Включить звук')+'">'+
 svgIcon(enabled?'volume-on':'volume-off',20)+'</button>';
}
const cueIcons={curse:'eye',ward:'star',warning:'eye',reward:'gem',deal:'trade',
 craft:'parts',inspect:'eye',bid:'coin',reveal:'bag',round:'scroll',turn:'gavel',finish:'star'};
function showConfirmedCue(cue,playAudio=true){
 if(!cue||mode!=='play'&&mode!=='done')return;
 clearTimeout(cueTimer);
 const root=app.querySelector('.play-screen')||app;
 const prior=root.querySelector('.confirmed-cue');
 prior?.remove();
 const banner=document.createElement('div');
 banner.className='confirmed-cue confirmed-'+cue.kind;
 banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');
 // Only static, internal SVG icons and predefined user-facing labels.
 banner.innerHTML=svgIcon(cueIcons[cue.kind]||'star',22)+'<span></span>';
 banner.querySelector('span').textContent=cue.label;
 root.appendChild(banner);
 const scene=root.querySelector('.play-field');
 if(scene&&!(typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)){
  const burst=document.createElement('div');
  burst.className='trade-burst burst-'+cue.kind;
  burst.setAttribute('aria-hidden','true');
  for(let i=0;i<8;i++)burst.appendChild(document.createElement('i'));
  scene.appendChild(burst);
  cueTimer=setTimeout(()=>{banner.remove();burst.remove()},1450);
 }else cueTimer=setTimeout(()=>banner.remove(),1450);
 if(playAudio)sound.play(cue.kind);
}
function showConfirmedMovement(before,after){
 if(!before?.you||!after?.you||before.revision===after.revision||after.phase!=='play')return;
 const root=app.querySelector('.play-screen');if(!root)return;
 // Snapshots are authoritative: animation never pre-empts a server response.
 const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 for(const key of keys){
  const oldValue=before.you.resources?.[key],newValue=after.you.resources?.[key];
  if(!Number.isFinite(oldValue)||!Number.isFinite(newValue)||oldValue===newValue)continue;
  const cell=root.querySelector('.currency[data-resource="'+key+'"]');
  if(!cell)continue;
  const delta=newValue-oldValue;
  cell.classList.remove('wallet-change');void cell.offsetWidth;cell.classList.add('wallet-change');
  if(reduce)continue;
  const chip=document.createElement('span');chip.className='wallet-float '+(delta>0?'wallet-plus':'wallet-minus');
  chip.textContent=(delta>0?'+':'')+delta;chip.setAttribute('aria-hidden','true');
  cell.append(chip);chip.addEventListener('animationend',()=>chip.remove(),{once:true});
 }
 const oldIds=new Set((before.you.items||[]).map(item=>item.id));
 const newIds=new Set((after.you.items||[]).map(item=>item.id));
 const gained=(after.you.items||[]).filter(item=>!oldIds.has(item.id));
 const lost=(before.you.items||[]).filter(item=>!newIds.has(item.id));
 if(reduce||!gained.length&&!lost.length)return;
 const field=root.querySelector('.play-field');if(!field)return;
 const item=gained[0]||lost[0],incoming=!!gained.length;
 const movement=document.createElement('div');movement.className='artifact-transfer';
 movement.setAttribute('aria-hidden','true');movement.innerHTML=artifactSVG(item.name,item.rarity);
 const stage=field.querySelector('.table-stage .artifact')||field.querySelector('.table-stage');
 const inventory=[...field.querySelectorAll('.mini-artifacts [data-id]')].find(node=>node.dataset.id===String(item.id))||field.querySelector('.mini-artifacts');
 const fieldRect=field.getBoundingClientRect();
 const center=(node,x,y)=>{if(!node)return {x,y};const r=node.getBoundingClientRect();return{x:r.left-fieldRect.left+r.width/2,y:r.top-fieldRect.top+r.height/2}};
 const from=incoming?center(stage,fieldRect.width/2,fieldRect.height*.52):center(inventory,fieldRect.width/2,fieldRect.height*.82);
 const to=incoming?center(inventory,fieldRect.width/2,fieldRect.height*.82):center(stage,fieldRect.width/2,fieldRect.height*.52);
 for(const [key,value] of Object.entries({'--from-x':from.x+'px','--from-y':from.y+'px','--to-x':to.x+'px','--to-y':to.y+'px'}))movement.style.setProperty(key,value);
 movement.classList.add(incoming?'transfer-in':'transfer-out');
 field.append(movement);movement.addEventListener('animationend',()=>movement.remove(),{once:true});
}
function localStore(){const node=document.querySelector('#nickname');if(node)name=(node.value.trim()||'Игрок').slice(0,22);if(!debugPreview)try{localStorage.setItem('black-bazaar:name',name);}catch{}}
function renderHome(){
 mode='home';activeSheet=null;selectedArtifact=null;playStarted=false;document.body.classList.remove('sheet-open');
 app.innerHTML='<div class="entry-screen">'+
 '<div class="entry-art" aria-hidden="true">'+
 '<div class="entry-cast">'+decorativeGuests.map(kind=>'<span class="entry-character">'+characterMarkup(kind)+'</span>').join('')+'</div>'+
 '<div class="entry-table"></div><div class="entry-emblem">'+brandEmblem()+'</div></div>'+
 '<div class="entry-copy"><h1>Чёрная барахолка</h1>'+
 '<p>Девять раундов. Странные находки. Торгуйся, хитри и не разорись.</p>'+
 '<div class="entry-form"><div class="panel stack">'+
 '<label>Твоё имя<input id="nickname" type="text" maxlength="22" value="'+esc(name)+'" autocomplete="nickname"></label>'+
 '<button type="button" class="primary" data-action="create" '+(connecting?'disabled':'')+'>Создать комнату '+svgIcon('arrow')+'</button>'+
 '<label>Код комнаты<input id="roomCode" type="text" spellcheck="false" value="'+esc(hintRoom)+'" placeholder="Код или ссылка"></label>'+
 '<button type="button" data-action="join" '+(connecting?'disabled':'')+'>Войти к друзьям</button>'+
 (connecting?'<div class="entry-connecting" role="status"><span class="entry-spinner" aria-hidden="true"></span><strong>Подключаемся к PocketNet…</strong><button type="button" data-action="cancel-connect">Отмена</button></div>':'')+
 '</div></div></div></div>';
 applyCharacterArt(app);
}
function renderLobby(){
 mode='lobby';activeSheet=null;selectedArtifact=null;playStarted=false;document.body.classList.remove('sheet-open');
 const all=state?.players||[],host=state?.host===me?.id,canKick=host&&['v16','v17'].includes(roomVersion),short=roomId.slice(0,8).toUpperCase();
 app.innerHTML='<div class="lobby-screen"><div class="panel stack">'+
 '<h1>За одним столом</h1><p>Код комнаты</p><strong class="lobby-room">'+esc(short)+'</strong>'+
 '<div class="row"><button type="button" data-action="copy-code">'+svgIcon('box')+' Код</button>'+
 '<button type="button" data-action="copy-url">'+svgIcon('trade')+' Ссылка</button></div>'+
 '<div class="lobby-players">'+all.map((p,index)=>'<div class="lobby-player">'+
 characterMarkup(decorativeGuests[index%decorativeGuests.length],'lobby-portrait')+'<strong>'+esc(p.name)+'</strong>'+
 (p.id===state.host?'<br><small>Ведущий</small>':'')+
 (canKick&&p.id!==me?.id?'<button type="button" class="lobby-kick" data-action="kick-player" data-player="'+esc(p.id)+'">Исключить</button>':'')+
 '</div>').join('')+'</div>'+
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
 '<span class="inventory-copy"><strong>'+esc(item.name)+'</strong><small>'+esc(itemDormant(item,forecastEconomy(you.resources,you.items))||item.rarity)+'</small></span>'+
 svgIcon('arrow',18)+'</button>';
 return '<div class="panel inventory-panel"><h2>Мои находки <small>'+(you.items.length+held)+'/4</small></h2>'+
 (you.items.length?'<div class="inventory-gallery">'+you.items.map(itemButton).join('')+'</div>':
 '<p class="muted">Предметов пока нет.</p>')+
 (held?'<p class="inventory-escrow">У посредника: '+held+'</p>':'')+'</div>';
}
function secretBlock(you){
 return '<div class="panel compact-goals"><h2>Твои цели</h2><div class="goal-numbers">'+
 ['gold','crystals','parts'].map(k=>'<div class="goal-pair"><small>'+names[k]+'</small><strong>'+you.resources[k]+' / '+you.quota[k]+'</strong></div>').join('')+
 '</div><details class="quiet-details"><summary>Тайные связи</summary>'+
 '<p>Покупка у '+esc(label(you.positiveTarget))+' · +3 кристалла.</p>'+
 '<p>Продажа '+esc(label(you.negativeTarget))+' · покупатель теряет 20 золота.</p>'+
 (you.legendary?'<p>Судьба связана с '+esc(label(you.legendary))+'.</p>':'')+
 '</details></div>';
}
function urgentBlock(you){
 const u=you.urgent;if(!u)return '';
 const pending=u.status==='pending',ready=keys.every(k=>you.resources[k]>=(u.needs[k]||0));
 return '<div class="panel urgent compact-urgent"><h2>Срочный заказ</h2>'+
 '<strong>'+esc(amounts(u.needs))+'</strong><p class="'+(pending?(ready?'success':'error'):'muted')+'">'+
 (pending?(ready?'Готов к сдаче · +35 золота':'Собери до конца хода'):
 u.status==='success'?'Выполнен':u.status==='shielded'?'Защитил амулет':'Провален')+'</p></div>';
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
 return '<div class="row resource-inputs">'+keys.map(k=>'<label class="resource-input" title="'+names[k]+'"><span class="resource-input-icon">'+svgIcon(({gold:'coin',crystals:'gem',parts:'parts'})[k],19)+'</span><span class="sr-only">'+names[k]+'</span><input aria-label="'+names[k]+'" type="number" min="0" max="2000" step="1" name="'+prefix+'_'+k+'" value="'+(defaults[k]||0)+'" required></label>').join('')+'</div>';
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
 let html='<div class="panel compact-trades"><h2>Обмен</h2>';
 if(inbox.length){
  html+='<h3>Предложения тебе</h3>'+inbox.map(d=>{
    const partner=state.players.find(p=>p.id===d.from);
    const mine=you.items.filter(i=>i.acquiredRound!==state.round&&i.id!==state.listing?.id);
    const theirs=(partner?.inventory||[]).filter(i=>i.tradable);
    const depth=d.depth||0;
    return '<div class="offer"><div class="deal-state">'+svgIcon('mail-open',17)+' Получено · ожидает решения</div><p>'+dealDescription(d)+'</p>'+
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
  html+='<h3>Твоё предложение</h3>'+outbox.map(d=>'<div class="offer"><div class="deal-state is-pending">'+svgIcon('clock',17)+' Ожидает ответа</div><p>'+dealDescription(d)+'</p>'+
    '<button type="button" data-action="deal-cancel" data-id="'+esc(d.id)+'">Отозвать</button></div>').join('');
 }
 const recipients=state.players.filter(p=>p.id!==you.id&&!p.bankrupt&&playerOnline(p));
 if(!you.bankrupt&&recipients.length){
  const first=recipients[0];
  const giveItems=you.items.filter(i=>i.acquiredRound!==state.round&&i.id!==state.listing?.id);
  const wantItems=first.inventory.filter(i=>i.tradable);
  html+='<details class="quiet-details"'+(!inbox.length&&!outbox.length?' open':'')+'><summary>Предложить обмен</summary><form data-form="deal" class="stack">'+
    '<label>Кому<select name="to" id="dealTarget">'+recipients.map(p=>
      '<option value="'+esc(p.id)+'">'+esc(p.character)+'</option>').join('')+'</select></label>'+
    '<label>Какой предмет отдаёшь<select name="giveItemId">'+itemOptions(giveItems)+'</select></label>'+
    '<p>Отдаёшь ресурсы:</p>'+resourceFields('give')+
    '<label>Какой предмет хочешь получить<select name="wantItemId" id="dealWantItem">'+itemOptions(wantItems)+'</select></label>'+
    '<p>Просишь ресурсы:</p>'+resourceFields('want')+
    '<button type="submit" class="primary">Предложить обмен</button>'+
    '</form></details>';
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
function actionsBlock(you){return quickActions(you,state.turnId===me?.id);}
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
 if(!node)return;
 const urgent=document.querySelector('#urgentClock');
 const frozen=!debugPreview&&!connected?'Нет связи':state?.offlinePaused?'Пауза':!state?.deadlineAt?'—':null;
 if(frozen!==null){
  node.textContent=frozen;
  node.setAttribute('aria-label',frozen);
  if(urgent)urgent.textContent=frozen;
  return;
 }
 const left=Math.max(0,Math.ceil((state.deadlineAt-Date.now())/1000));
 node.textContent=Math.floor(left/60)+':'+String(left%60).padStart(2,'0');
 node.setAttribute('aria-label','До конца хода '+left+' секунд');
 if(urgent)urgent.textContent=node.textContent;
}
function eventBlock(){
 const e=state.event;
 return e?'<section class="panel"><h2>Событие раунда: '+esc(e.title)+'</h2><p>'+esc(e.description)+'</p></section>':'';
}


function taskKey(){
 const u=state?.you?.urgent;
 return u?.status==='pending'?roomId+':'+state.round+':'+state.you.id+':'+JSON.stringify(u.needs):null;
}
function unreadCount(section){
 if(!state?.you)return 0;
 if(section==='deals')return (state.deals||[]).filter(d=>d.to===state.you.id&&!readDeals.has(roomId+':'+d.id)).length;
 if(section==='secret'){const key=taskKey();return key&&!readTasks.has(key)?1:0;}
 return 0;
}
function unreadBadge(section){
 const value=unreadCount(section);
 return value?'<span class="tab-count" aria-label="'+value+' новых">'+value+'</span>':'';
}
function itemDormant(item,plan){
 const blocked=plan.inactive.find(x=>x.id===item.id);
 return blocked?'Не хватает '+blocked.missing.map(k=>names[k]).join(', '):'';
}
function quickMarket(you){
 const lot=state.listing;
 let html='<div class="panel compact-market"><h2>Торги</h2>';
 if(lot)html+='<button type="button" class="inventory-object" data-action="open-item" data-kind="listing" data-id="'+esc(lot.id)+'">'+
 '<span class="inventory-art">'+artifactSVG(lot.name,lot.rarity)+'</span>'+
 '<span class="inventory-copy"><strong>'+esc(lot.name)+'</strong><small>'+esc(label(lot.seller))+' · '+esc(amounts(lot.ask))+'</small></span>'+
 svgIcon('arrow',18)+'</button>'+(state.bids.length?'<p class="muted">Ставок: '+state.bids.length+'</p>':'');
 else html+='<p class="muted">Нет лота. Чтобы выставить вещь, нажми на неё на столе.</p>';
 if(state.blackMarket)html+='<details class="quiet-details"><summary>Анонимный рынок · '+(state.blackLots||[]).length+'</summary>'+blackMarketBlock(you)+'</details>';
 return html+'</div>';
}
function quickActions(you,active){
 if(!active)return '<div class="panel"><h2>Чужой ход</h2><p>Обмен и ставки доступны.</p></div>';
 if(you.bankrupt)return '<div class="panel"><h2>Твой ход</h2><p>Осталось завершить ход.</p></div>';
 let html='<div class="panel compact-actions"><h2>Твой ход</h2>';
 if(!you.worked)html+='<form data-form="work" class="fast-work"><label>Подработка<select name="resource">'+
 '<option value="gold">+35 золота</option><option value="crystals">+4 кристалла</option><option value="parts">+1 деталь</option>'+
 '</select></label><button type="submit" class="primary">Получить</button></form>';
 else html+='<p class="success">Подработка выполнена</p>';
 if(state.broker)html+='<button type="button" class="inventory-object" data-action="open-item" data-kind="broker" data-id="'+esc(state.broker.id)+'">'+
 '<span class="inventory-art">'+artifactSVG(state.broker.name,state.broker.rarity)+'</span>'+
 '<span class="inventory-copy"><strong>Запечатанная находка</strong><small>75 золота</small></span>'+svgIcon('arrow',18)+'</button>';
 html+='<details class="quiet-details"><summary>Ломбард</summary>'+
 (!you.usedPawn?'<form data-form="exchange" class="fast-work"><label>Обмен<select name="mode">'+
 '<option value="buy_crystals">70 золота → 6 кристаллов</option><option value="buy_parts">90 золота → 1 деталь</option>'+
 '<option value="sell_crystals">6 кристаллов → 25 золота</option><option value="sell_parts">1 деталь → 40 золота</option>'+
 '</select></label><button type="submit">Обменять</button></form>':'<p>Ломбард уже использован.</p>')+
 '</details></div>';return html;
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
  const inactiveReason=itemDormant(item,forecastEconomy(you.resources,you.items));
  body=itemCard(item.name,item.rarity,tradable?'Можно передавать':'Получен в этом раунде')+
   (inactiveReason?'<p class="detail-inactive">'+svgIcon('eye',18)+' Не работает: '+esc(inactiveReason)+'. Доход не начислится.</p>':'')+
   artifactFacts(item,{showPositive:true,showNegative:true})+
   '<div class="detail-actions">'+
   (free?'<button type="button" data-action="detail-trade" data-id="'+esc(item.id)+'">'+svgIcon('trade')+' Обмен</button>':'')+
   (free&&active&&you.marketDeals<2&&!state.listing?
    '<form class="detail-offer-form" data-form="detail-post"><input type="hidden" name="itemId" value="'+esc(item.id)+'">'+
     '<details class="quick-expand"><summary>'+svgIcon('gavel',18)+' Выставить на торги</summary>'+resourceFields('ask',{gold:100})+
     '<button type="submit" class="primary">'+svgIcon('gavel')+' Выставить</button></details></form>':'')+
   (!locked&&active&&!you.usedPawn?
     '<div class="detail-secondary-actions"><button type="button" data-action="detail-pawn" data-id="'+esc(item.id)+'">Ломбард · 45 золота</button>'+
     (tradable?'<button type="button" data-action="detail-salvage" data-id="'+esc(item.id)+'">Разобрать · '+(state.salvageParts??2)+' детали</button>':'')+'</div>':'')+
   (tradable&&!locked?
     '<form class="detail-offer-form" data-form="detail-repack"><input type="hidden" name="itemId" value="'+esc(item.id)+'">'+
      '<details class="quick-expand"><summary>Перепаковать</summary><label>Сменить этикетку<select name="aliasIndex">'+you.disguises.map((n,i)=>'<option value="'+i+'">'+esc(n)+'</option>').join('')+'</select></label>'+
      '<button type="submit" '+(you.resources.gold<(state.repackCost?.gold??20)||you.resources.parts<(state.repackCost?.parts??1)?'disabled':'')+'>Перепаковать · '+(state.repackCost?.gold??20)+' золота</button></details></form>':'')+
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
      '<button type="button" class="primary" data-action="bid-asking" '+(keys.every(k=>(you.resources[k]||0)>=(item.ask[k]||0))?'':'disabled')+'>'+svgIcon('check')+' Принять цену · '+esc(amounts(item.ask))+'</button><details class="quick-expand"><summary>'+svgIcon('gavel',18)+' Другая цена</summary><form class="detail-offer-form" data-form="detail-bid">'+resourceFields('offer',item.ask)+
      '<button type="submit" class="primary">'+svgIcon('gavel')+' Предложить</button></form></details>'+
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
  const ownEscrow=lot.mine&&you.escrowItems?.length===1?you.escrowItems[0]:null;
  body=itemCard(item.name,item.rarity,lot.mine?'Твой анонимный лот':'Анонимный продавец')+
   '<div class="detail-ask"><small>Запрошено</small><strong>'+esc(amounts(lot.ask))+'</strong></div>'+
   (inspected?'<p class="detail-inspected">Оригинал: '+esc(inspected.originalName)+'</p>':'')+
   artifactFacts(ownEscrow||inspected||{},{showPositive:!!ownEscrow,showNegative:!!(ownEscrow||inspected),inspection:!ownEscrow})+
   '<div class="detail-actions">'+
   (lot.mine?
     (lot.bids?.length?lot.bids.map(b=>'<div class="detail-bid"><span>'+esc(amounts(b.offer))+'</span>'+
        '<button type="button" data-action="black-accept" data-id="'+esc(lot.id)+'" data-bid="'+esc(b.id)+'">Принять</button></div>').join(''):'<p class="muted">Пока нет ставок.</p>')+
      '<button type="button" data-action="black-cancel" data-id="'+esc(lot.id)+'">Вернуть предмет</button>':
     (!locked?
       (!inspected?'<button type="button" data-action="black-inspect" data-id="'+esc(lot.id)+'" '+(you.resources.gold<(you.inspectionPrices?.black??25)?'disabled':'')+'>'+svgIcon('eye')+' Экспертиза · '+(you.inspectionPrices?.black??25)+'</button>':'')+
       '<button type="button" class="primary" data-action="black-bid-asking" data-id="'+esc(lot.id)+'" '+(keys.every(k=>(you.resources[k]||0)>=(lot.ask[k]||0))?'':'disabled')+'>'+svgIcon('check')+' Предложить цену · '+esc(amounts(lot.ask))+'</button><details class="quick-expand"><summary>'+svgIcon('gavel',18)+' Другая цена</summary><form class="detail-offer-form" data-form="detail-black-bid" data-lot-id="'+esc(lot.id)+'">'+
       resourceFields('offer',lot.myBid||lot.ask)+'<button type="submit" class="primary">Предложить</button></form></details>'+
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
 const sheet=document.querySelector('#bazaarSheet');if(!sheet)return;
 const name=sheetTitles[sheetName]?sheetName:'actions';activeSheet=name;
 if(focus&&name==='deals')for(const d of state.deals||[])if(d.to===state.you?.id)readDeals.add(roomId+':'+d.id);
 if(focus&&name==='secret'&&taskKey())readTasks.add(taskKey());
 const detail=sheet.querySelector('[data-sheet-page="detail"]');
 if(focus&&name==='detail'&&detail&&state?.you)detail.innerHTML=artifactDetailBlock(state.you);
 for(const page of sheet.querySelectorAll('[data-sheet-page]'))page.hidden=page.dataset.sheetPage!==name;
 const title=sheet.querySelector('#sheetTitle');if(title)title.textContent=sheetTitles[name];
 for(const tab of app.querySelectorAll('[data-action="open-sheet"]')){
  const selected=tab.dataset.sheet===name;
  tab.setAttribute('aria-selected',String(selected));tab.setAttribute('aria-expanded',String(selected));
  const badge=tab.querySelector('.tab-count');
  if(badge){const count=unreadCount(tab.dataset.sheet);badge.textContent=String(count);badge.hidden=!count;}
 }
 if(focus){
  sheet.classList.remove('sheet-enter');void sheet.offsetWidth;sheet.classList.add('sheet-enter');
  const scroll=sheet.querySelector('.sheet-content');if(scroll)scroll.scrollTop=0;
  if(targetId)requestAnimationFrame(()=>document.getElementById(targetId)?.scrollIntoView({block:'nearest'}));
 }
}
function resourceWallet(w,forecast){
 return '<div class="currency-strip" aria-label="Ресурсы и итог за раунд">'+
 [['gold','coin','Золото'],['crystals','gem','Кристаллы'],['parts','parts','Детали']].map(([k,icon,title])=>{
 const d=forecast.delta[k],text=d>0?'+'+d:String(d);
  const goal=Math.max(0,state?.you?.quota?.[k]||0),value=Math.max(0,w[k]||0);
  const progress=goal?Math.min(100,Math.round(100*value/goal)):100;
 return '<span class="currency" data-resource="'+k+'" aria-label="'+title+': '+(w[k]||0)+', за раунд '+text+'">'+svgIcon(icon)+
 '<span class="wallet-values"><strong>'+(w[k]||0)+' <span class="quota-sep">/</span> '+(state?.you?.quota?.[k]??'—')+'</strong><em>'+title+'</em><span class="wallet-track" role="progressbar" aria-label="Квота: '+title+'" aria-valuemin="0" aria-valuemax="'+goal+'" aria-valuenow="'+Math.min(value,goal)+'"><i style="width:'+progress+'%"></i></span></span>'+
 '<small class="wallet-delta '+(d>0?'positive':d<0?'negative':'neutral')+'">'+text+'</small></span>';
 }).join('')+'</div>';
}
function renderPlay(){
 const drafts=mode==='play'?collectDrafts():{};
 const previousScroll=mode==='play'?app.querySelector('.sheet-content')?.scrollTop||0:0;
 const expanded=mode==='play'?[...app.querySelectorAll('.sheet-page details')].map((el,i)=>el.open?i:-1).filter(i=>i>=0):[];
 mode='play';const you=state.you;
 if(!you){app.innerHTML='<p class="panel">Подключаемся…</p>';return;}
 if(!playStarted){playStarted=true;activeSheet='actions';}
 const active=state.turnId===me?.id,plan=forecastEconomy(you.resources,you.items);
 const seats=state.players.map(p=>{
  const self=p.id===me?.id,available=!self&&playerOnline(p)&&!p.bankrupt&&!you.bankrupt;
  const moderate=['v16','v17'].includes(roomVersion)&&state.host===me?.id&&!self&&!p.bankrupt;
  return '<button type="button" class="seat '+(p.id===state.turnId?'is-turn ':'')+(self?'is-me ':'')+
  '" data-action="'+(self?'open-sheet':'player-actions')+'" '+(self?'data-sheet="inventory"':'data-player="'+esc(p.id)+'"')+
  (!self&&!available&&!moderate?' disabled':'')+' aria-label="'+esc(p.character)+' — '+esc(p.name)+'">'+
  '<span class="seat-portrait">'+characterMarkup(roleCharacter(p.character),'seat-character')+'</span>'+
  '<strong>'+esc(p.character)+'</strong><small>'+esc(p.name)+'</small></button>';
 }).join('');
 const listing=state.listing;
 const lot=listing?'<button type="button" class="artifact" data-action="open-item" data-kind="listing" data-id="'+esc(listing.id)+'" aria-label="Открыть лот '+esc(listing.name)+', цена '+esc(amounts(listing.ask))+', предложений: '+state.bids.length+'">'+
 artifactSVG(listing.name,listing.rarity)+'<strong>'+esc(listing.name)+'</strong><span class="lot-market-strip"><span>'+svgIcon('coin',16)+' '+esc(amounts(listing.ask))+'</span><span>'+svgIcon('gavel',16)+' '+state.bids.length+'</span></span></button>':
 '<div class="artifact-note">Нет лота</div>';
 const inventory=you.items.map(item=>{
  const reason=itemDormant(item,plan);
  return '<button type="button" class="'+(reason?'item-dormant':'')+'" data-action="open-item" data-kind="inventory" data-id="'+esc(item.id)+
  '" aria-label="'+esc(item.name)+(reason?' — '+esc(reason):'')+'" title="'+esc(reason||item.name)+'">'+
  artifactSVG(item.name,item.rarity)+'<span>'+esc(item.name)+'</span>'+
  (reason?'<small class="inactive-tag">'+esc(reason.replace('Не хватает ','Нет '))+'</small>':'')+'</button>';
 }).join('');
 const sections=[
 ['actions','box','Мой ход'],['market','gavel','Торги'],
 ['inventory','bag','Предметы'],['secret','scroll','Задания'],
 ['deals','trade','Обмен'],['players','people','Игроки']
 ].map(([id,icon,label])=>'<button class="workspace-tab" type="button" data-action="open-sheet" data-sheet="'+id+
 '" aria-label="'+esc(label)+'" title="'+esc(label)+'" aria-controls="bazaarSheet" role="tab" aria-selected="'+(activeSheet===id)+'" aria-expanded="'+(activeSheet===id)+'">'+
 svgIcon(icon,19)+'<span class="workspace-tab-label">'+esc(label)+'</span>'+
 '<span class="tab-count"'+(!unreadCount(id)?' hidden':'')+'>'+unreadCount(id)+'</span></button>').join('');
 const pages=
 '<section class="sheet-page" data-sheet-page="detail">'+artifactDetailBlock(you)+'</section>'+
 '<section class="sheet-page" data-sheet-page="actions">'+quickActions(you,active)+'</section>'+
 '<section class="sheet-page" data-sheet-page="market">'+quickMarket(you)+'</section>'+
 '<section class="sheet-page" data-sheet-page="inventory">'+inventoryBlock(you)+'</section>'+
 '<section class="sheet-page" data-sheet-page="secret">'+secretBlock(you)+urgentBlock(you)+'</section>'+
 '<section class="sheet-page" data-sheet-page="deals">'+tradePanel(you)+'</section>'+
 '<section class="sheet-page" data-sheet-page="players">'+scoreBox()+eventBlock()+
 '<details class="quiet-details"><summary>История</summary><ol>'+state.log.map(e=>'<li>'+esc(e)+'</li>').join('')+'</ol></details></section>';
 app.innerHTML='<div class="play-screen"><div class="play-head">'+
 '<h1>Раунд '+state.round+'/'+state.rounds+'</h1>'+
 '<span class="chip">'+esc(active?'Твой ход':'Ходит '+label(state.turnId))+'</span>'+
 '<span class="chip"><strong id="turnClock" role="timer">—</strong></span>'+(state.connectionGraceUntil&&Date.now()<state.connectionGraceUntil?'<span class="chip" role="status">'+svgIcon('clock',16)+' Восстановление связи</span>':'')+soundToggle()+
 '<button type="button" class="leave-button" data-action="leave">Выйти</button></div>'+
 resourceWallet(you.resources,plan)+
 (you.urgent?.status==='pending'?'<button class="urgent-ticket" type="button" data-action="open-sheet" data-sheet="secret" aria-label="Срочный заказ: '+esc(amounts(you.urgent.needs))+'; срок — до конца хода"><span>'+svgIcon('clock',17)+' Срочный заказ</span><strong>'+esc(amounts(you.urgent.needs))+'</strong><small id="urgentClock">—</small></button>':'')+
 '<div class="play-body"><div class="play-field" data-player-count="'+state.players.length+'">'+
 '<div class="ambient-lights" aria-hidden="true"><i></i><i></i><i></i><i></i></div>'+
 '<div class="player-seats" data-seats="'+state.players.length+'">'+seats+'</div>'+
 '<div class="table-stage">'+lot+
 (inventory?'<div class="mini-artifacts" aria-label="Мои предметы">'+inventory+'</div>':'')+
 (state.event?'<button type="button" data-action="open-sheet" data-sheet="players" class="table-event">'+
 svgIcon('leaf')+' '+esc(state.event.title)+'</button>':'')+
 '</div><div class="bottom-ribbon">'+
 (active?'<button type="button" class="primary action-end" data-action="end">'+svgIcon('check')+' Завершить ход</button>':
 '<span class="turn-wait">Можешь торговаться в чужой ход</span>')+'</div></div>'+
 '<aside id="bazaarSheet" class="workspace-panel" aria-label="Разделы игры">'+
 '<nav class="workspace-tabs" role="tablist" aria-label="Разделы">'+sections+'</nav>'+
 '<div class="sheet-heading"><h2 id="sheetTitle">Мой ход</h2></div>'+
 '<div class="sheet-content">'+pages+'</div></aside></div></div>';
 restoreDrafts(drafts);openSheet(activeSheet);
 [...app.querySelectorAll('.sheet-page details')].forEach((el,i)=>{if(expanded.includes(i))el.open=true;});
 const scroll=app.querySelector('.sheet-content');if(scroll)scroll.scrollTop=previousScroll;
 applyCharacterArt(app);updateTurnClock();
}
function renderDone(){
 mode='done';activeSheet=null;selectedArtifact=null;playStarted=false;readDeals.clear();readTasks.clear();document.body.classList.remove('sheet-open');
 const ranks=state.ranking||[];
 app.innerHTML='<section class="done-screen"><h1>Партия окончена</h1><p>Рейтинг по выполнению секретной квоты. Банкротство лишает права на победу; легендарная связь может изменить второе место.</p>'+
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
 '<button type="button" data-action="leave">В меню</button></div></section>';
}
function render(){
 if(!state)return renderHome();
 if(state.phase==='lobby')return renderLobby();
 if(state.phase==='done')return renderDone();
 return renderPlay();
}
function closeRoom(){
 clearTimeout(cueTimer);cueTimer=null;
 activeSheet=null;selectedArtifact=null;playStarted=false;readDeals.clear();readTasks.clear();document.body.classList.remove('sheet-open');
 if(net){try{if(connected)net.leaveRoom()}catch{}try{net.close()}catch{}}
 // A deliberate exit must never silently resume a reserved seat from local storage.
 netStorage.removeItem('pocket-net:'+ORIGIN);
 net=null;me=null;state=null;onlinePlayerIds=null;roomId='';roomVersion=null;connected=false;connecting=false;message('');renderHome();
}
function cancelConnect(){
 if(!connecting)return;
 const old=net;net=null;
 connecting=false;connected=false;me=null;state=null;roomId='';roomVersion=null;onlinePlayerIds=null;
 try{old?.close();}catch{}
 // Explicit cancellation must not auto-resume the abandoned room after reload.
 netStorage.removeItem('pocket-net:'+ORIGIN);
 renderHome();message('Подключение отменено.');
}
function wire(client){
 client.on('connected',data=>{if(net!==client)return;me=data.player;connected=false;message(state?.phase==='play'?'Восстанавливаем комнату…':'');});
 client.on('room_joined',data=>{if(net!==client)return;roomVersion=data.version;roomId=data.roomId;state=data.state;onlinePlayerIds=null;connecting=false;connected=true;message('');render();});
 client.on('presence',data=>{if(net!==client||!state||data.roomId!==roomId)return;if(Array.isArray(data.onlineIds)){onlinePlayerIds=new Set(data.onlineIds);if(state.phase==='play')render();}});
 client.on('game_event',data=>{
  if(net!==client)return;
  if(data.event?.type==='state'){
   const incoming=data.event.payload;
   const previous=state;
   const cue=classifyFeedback(previous,incoming,me?.id);
   state=incoming;render();
   showConfirmedMovement(previous,incoming);
   if(cue)showConfirmedCue(cue);
   else if(previous?.you&&incoming?.you){
     const changed=keys.find(k=>previous.you.resources?.[k]!==incoming.you.resources?.[k]);
     if(changed)sound.play(changed);
    }
  }else if(data.event?.type==='notice')message(data.event.payload,true);
 });
 client.on('disconnected',()=>{if(net!==client)return;connected=false;onlinePlayerIds=null;message('Связь потеряна. PocketNet переподключается…',true);});
 client.on('error',e=>{
  if(net!==client)return;
  const code=String(e?.code||e?.message||'неизвестно');
  if(code==='room_not_found'||code==='room_version_unavailable'){
    netStorage.removeItem('pocket-net:'+ORIGIN);
    net.close();net=null;state=null;roomId='';me=null;connecting=false;connected=false;
    renderHome();message('Комната больше недоступна. Можно создать новую.',true);
    return;
  }
  // A failed join must release the pending state; otherwise the lobby buttons
  // stay disabled and a later retry silently does nothing.
  if(connecting&&!roomId){
   try{client.close();}catch{}
   net=null;connecting=false;connected=false;me=null;state=null;roomVersion=null;
   renderHome();message('Не удалось подключиться: '+code,true);
   return;
  }
  message('Ошибка сервера: '+code,true);
 });
 client.on('room_kicked',()=>{if(net!==client)return;connected=false;closeRoom();message('Ведущий исключил вас из комнаты. Повторный вход по этому коду недоступен.',true);});
 client.on('room_closed',()=>{if(net!==client)return;closeRoom();message('Комната закрылась.',true);});
}
async function connect(kind,code=''){
 if(debugPreview){
  state=createDebugState('lobby');me={id:'debug-0',name:'Алиса'};roomId='DBGLOCAL';
  render();return;
 }
 if(connecting)return;
 connecting=true;state=null;roomId='';renderHome();message('Подключение к PocketNet…');
 let client=null;
 try{
  if(net){net.close();net=null;}
  const storage=netStorage;
  if(kind!=='resume')storage.removeItem('pocket-net:'+ORIGIN);
  client=new PocketNet({serverUrl:ORIGIN,name,storage});net=client;wire(client);
  await client.connect();
  if(net!==client){try{client.close();}catch{}return;}
  if(kind==='create')client.createRoom(GAME_ID);
  else if(kind==='join')client.joinRoom(code);
  else if(!client.roomId){connecting=false;renderHome();message('Сохранённая комната не найдена.',true);}
 }catch(e){
  if(net!==client){try{client?.close();}catch{}return;} // Ignore abandoned attempts and close late sockets.
  connecting=false;connected=false;
  if(net){net.close();net=null;}
  renderHome();message('Нет соединения: '+e.message,true);
 }
}
function request(payload){
 if(debugPreview){
  const before=structuredClone(state);
  const result=debugCommand(state,payload);
  if(result.error){message(result.error,true);return;}
  state=result.state;
  const cue=classifyFeedback(before,state,me?.id);
  render();message('');
  showConfirmedMovement(before,state);
  if(cue)showConfirmedCue(cue);
  return;
 }
 if(!net||!connected){message('Нет соединения с комнатой.',true);return;}
 try{net.sendGame(payload);message('');}catch(e){message('Не удалось отправить: '+e.message,true);}
}
async function copy(value){
 try{await navigator.clipboard.writeText(value);message('Скопировано.');}
 catch{message('Не удалось скопировать — используйте выделение текста.',true);}
}
app.addEventListener('click',event=>{
 const btn=event.target.closest('button[data-action]');if(!btn||btn.disabled)return;
 const action=btn.dataset.action;
 if(action==='cancel-connect'){cancelConnect();return;}
 if(action==='toggle-sound'){
  const enabled=sound.setEnabled(!sound.isEnabled());
  if(enabled){sound.unlock();sound.play('open');}
  const toggle=app.querySelector('.sound-toggle');
  if(toggle){
   const fresh=document.createElement('div');fresh.innerHTML=soundToggle();
   toggle.replaceWith(fresh.firstElementChild);
   app.querySelector('.sound-toggle')?.focus({preventScroll:true});
  }
  return;
 }
 sound.unlock();
 if(action==='open-item'){sound.play('open');
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
 if(action==='black-bid-asking'){
   const lot=(state?.blackLots||[]).find(x=>x.id===btn.dataset.id);
   if(!lot||lot.mine||state.you.bankrupt||!keys.every(k=>(state.you.resources[k]||0)>=(lot.ask[k]||0)))return;
   request({type:'black_bid',lotId:lot.id,offer:{...lot.ask}});return;
  }
  if(action==='bid-asking'){
   const lot=state?.listing;if(!lot||lot.seller===me?.id||state.you.bankrupt||!keys.every(k=>(state.you.resources[k]||0)>=(lot.ask[k]||0)))return;
   request({type:'bid',offer:{...lot.ask}});return;
  }
  if(action==='player-actions'){
   const player=state?.players?.find(p=>p.id===btn.dataset.player);
   if(!player||player.id===me?.id)return;
   app.querySelector('.player-popover')?.remove();
   const pop=document.createElement('div');pop.className='player-popover';pop.setAttribute('role','dialog');
   pop.innerHTML='<div class="player-popover-head"><strong>'+esc(player.character||player.name)+'</strong><button type="button" data-action="close-player-actions" aria-label="Закрыть">×</button></div>'+(!playerOnline(player)||player.bankrupt||state.you.bankrupt?'<p>Обмен недоступен</p>':'<button type="button" class="primary" data-action="trade-with" data-player="'+esc(player.id)+'">'+svgIcon('trade',20)+' Обмен / подарок</button>')+'<button type="button" data-action="open-sheet" data-sheet="players">'+svgIcon('people',19)+' Участники</button>'+
   (['v16','v17'].includes(roomVersion)&&state.host===me?.id&&!player.bankrupt?'<button type="button" class="kick-player" data-action="kick-player" data-player="'+esc(player.id)+'">'+'Исключить из партии</button>':'');
   btn.closest('.player-seats')?.append(pop);sound.play('open');pop.querySelector('button')?.focus({preventScroll:true});return;
  }
  if(action==='close-player-actions'){app.querySelector('.player-popover')?.remove();return;}
  if(action==='trade-with'){
  app.querySelector('.player-popover')?.remove();sound.play('tap');
  const recipient=state?.players?.find(p=>p.id===btn.dataset.player);
  if(!recipient||!playerOnline(recipient)||recipient.bankrupt||state?.you?.bankrupt)return;
  lastSheetTrigger=btn;openSheet('deals',true);
  const dealForm=app.querySelector('form[data-form="deal"]');
  if(dealForm?.closest('details'))dealForm.closest('details').open=true;
  const choose=app.querySelector('#dealTarget');
  if(choose&&[...choose.options].some(o=>o.value===recipient.id)){
   choose.value=recipient.id;
   const dropdown=app.querySelector('#dealWantItem');
   if(dropdown)dropdown.innerHTML=itemOptions((recipient.inventory||[]).filter(i=>i.tradable));
  }
  return;
 }
 if(action==='open-sheet'){
  sound.play('open');
  lastSheetTrigger=btn;
  const next=btn.dataset.sheet;
  openSheet(next,true,btn.dataset.scroll||'');return;
 }
 if(action==='close-sheet'){sound.play('close');openSheet('inventory',true);return;}
 if(action==='create'){localStore();connect('create');return;}
 if(action==='join'){
  localStore();let code=document.querySelector('#roomCode')?.value.trim()||'';
  try{if(/^https?:/i.test(code))code=new URL(code).searchParams.get('room')||'';}catch{}
  if(!code){message('Введите код комнаты.',true);return;}
  connect('join',code);return;
 }
 if(action==='copy-code')return copy(roomId.slice(0,8).toUpperCase());
 if(action==='copy-url')return copy(new URL('./?room='+encodeURIComponent(roomId),location.href).href);
 if(action==='kick-player'){
  const target=state?.players?.find(p=>p.id===btn.dataset.player);
  if(state?.host!==me?.id||!target||target.id===me?.id||target.bankrupt)return;
  if(confirm('Исключить «'+target.name+'» из комнаты? Вернуться в эту комнату с прежнего аккаунта он не сможет.'))
   request({type:'kick',targetId:target.id});
  return;
 }
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
 if(event.key==='Escape'&&app.querySelector('.player-popover')){app.querySelector('.player-popover').remove();event.preventDefault();return;}
 if(event.key==='Escape'&&activeSheet==='detail'){event.preventDefault();openSheet('inventory',true);}

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
if(!debugPreview)createBazaarDebug();
loadCharacterArt().catch(error=>{console.warn('Unable to load character art:',error);message('Иллюстрации недоступны — игра продолжает работать.',true);});
let lastHeartbeat=0;
setInterval(()=>{
 updateTurnClock();
 if(connected&&state?.phase==='play'&&net&&Date.now()-lastHeartbeat>8000){
  lastHeartbeat=Date.now();
  try{net.sendGame({type:'tick'});}catch{}
 }
},1000);
if(!debugPreview)try{const saved=JSON.parse(netStorage.getItem('pocket-net:'+ORIGIN)||'null');if(saved?.roomId)connect('resume');}catch{}
if(debugPreview){
 const emit=(type,extra={})=>window.parent?.postMessage({source:'bazaar-debug-preview',type,...extra},location.origin);
 const showScene=(id,run=null,step=null)=>{
  state=createDebugState(id);me={id:'debug-0',name:'Алиса'};roomId='DBGLOCAL';
  selectedArtifact=null;activeSheet=null;render();
  emit('status',{message:'Сцена: '+id+' · тестовые данные'});
  if(run!==null)requestAnimationFrame(()=>requestAnimationFrame(()=>emit('scene-ready',{run,step})));
 };
 const audit=(run=null,step=null)=>{
  const width=document.documentElement.clientWidth;
  const overflow=Math.max(0,document.documentElement.scrollWidth-width);
  const visible=[...document.querySelectorAll('#app button:not([hidden]):not(:disabled),#app input:not(:disabled),#app select:not(:disabled)')]
   .filter(el=>!el.closest('[hidden]')&&getComputedStyle(el).display!=='none');
  const small=visible.filter(el=>{const box=el.getBoundingClientRect();return box.width>0&&box.height>0&&
   (box.width<38||box.height<38)}).map(el=>({text:(el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,38),
     width:Math.round(el.getBoundingClientRect().width),height:Math.round(el.getBoundingClientRect().height)}));
  const issues=[];
  if(overflow>2)issues.push('Горизонтальное переполнение: '+overflow+'px');
  if(small.length)issues.push('Мелкие элементы: '+small.length);
  if(!document.querySelector('#app button')&&state?.phase==='play')issues.push('Игровые действия отсутствуют');
  const rect=s=>document.querySelector(s)?.getBoundingClientRect();
  const area=rect('.play-screen'),field=rect('.play-field'),panel=rect('.workspace-panel'),tabs=rect('.workspace-tabs'),ticket=rect('.urgent-ticket'),wallet=rect('.currency-strip');
  const overlaps=(a,b)=>a&&b&&Math.min(a.right,b.right)-Math.max(a.left,b.left)>4&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>4;
  const collisions=[];
  if(overlaps(field,tabs))collisions.push('Стол перекрывает вкладки');
  if(overlaps(field,panel))collisions.push('Стол перекрывает панель');
  if(overlaps(ticket,wallet))collisions.push('Задание перекрывает ресурсы');
  const clipping=[];
  for(const sel of ['.play-head','.currency-strip','.urgent-ticket','.play-field','.workspace-tabs']){
   const box=rect(sel);if(!box||!box.width)continue;
   if(box.left< -2||box.right>width+2)clipping.push(sel+' выходит по ширине');
   if(area&&(box.top<area.top-2||box.bottom>area.bottom+2))clipping.push(sel+' выходит по высоте');
  }
  const content=document.querySelector('.sheet-content');
  const scrollable=content?{clientHeight:content.clientHeight,scrollHeight:content.scrollHeight,overflowY:getComputedStyle(content).overflowY}:null;
  if(scrollable&&scrollable.scrollHeight>scrollable.clientHeight+5&&!['auto','scroll'].includes(scrollable.overflowY))issues.push('Содержимое боковой панели обрезано');
  issues.push(...collisions,...clipping);
  emit('audit',{report:{viewport:width+' × '+document.documentElement.clientHeight,
   horizontalOverflow:overflow,actionable:visible.length,smallTargets:small.slice(0,12),collisions,clipping,scrollable,issues},run,step});
 };
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent||event.data?.source!=='bazaar-debug-console')return;
  const d=event.data;
  if(d.type==='scene')return showScene(d.id,d.run??null,d.step??null);
  if(d.type==='item'){
   if(!state||state.phase!=='play')showScene('four');
   debugSetItem(state,Number(d.index),d.kind);
   const id=d.kind==='inventory'?'debug-selected-'+d.index:d.kind==='black'?'selected-black':d.kind==='broker'?'debug-selected-'+d.index:'debug-selected-'+d.index;
   selectedArtifact={kind:d.kind,id};
   renderPlay();openSheet('detail',true);
   emit('status',{message:'Предмет: '+(state.listing?.name||state.you?.items?.[0]?.name||'открыт')});
   return;
  }
  if(d.type==='sheet'){
   if(!state||state.phase!=='play')showScene('four');
   if(d.name==='detail'&&!selectedArtifact)selectedArtifact={kind:'inventory',id:state.you.items[0]?.id};
   renderPlay();openSheet(d.name,true);
   emit('status',{message:'Раздел: '+d.name});return;
  }
  if(d.type==='effect'){
   showConfirmedCue({kind:d.kind,label:d.label},false);
   emit('status',{message:'Эффект: '+d.label});return;
  }
  if(d.type==='qa-action'){
   const run=d.run,step=d.step,command=d.command;
   if(!state||state.phase!=='play'){emit('qa-action-result',{run,step,error:'Not a playable scene'});return;}
   const snapshot=()=>({
    resources:{...state.you.resources},items:state.you.items.map(item=>item.id),
    marketDeals:state.you.marketDeals,listing:state.listing?{id:state.listing.id,seller:state.listing.seller}:null,
    bids:state.bids.map(b=>({buyer:b.buyer,offer:{...b.offer}})),
    players:state.players.map(p=>({id:p.id,resources:p.resources?{...p.resources}:null,
      items:p.items,inventory:(p.inventory||[]).map(item=>item.id)}))
   });
   const before=snapshot();
   request(command);
   const after=snapshot();
   emit('qa-action-result',{run,step,before,after,error:document.querySelector('#status')?.textContent||null});
   return;
  }
  if(d.type==='audit')return audit(d.run??null,d.step??null);
 });
 document.querySelector('[data-preview-exit]')?.addEventListener('click',e=>{e.preventDefault();window.parent?.postMessage({source:'bazaar-debug-preview',type:'status',message:'Закрой мастерскую кнопкой ×'},location.origin)});
 emit('ready');
}
