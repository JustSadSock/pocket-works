import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {PocketNet} from '../../shared/capabilities/net.js';
installMobileRuntime();

const GAME_ID='black-bazaar';
const ORIGIN=location.origin+'/pocketnet';
const app=document.querySelector('#app');
const status=document.querySelector('#status');
const qs=new URLSearchParams(location.search);
const hintRoom=(qs.get('room')||'').trim().toUpperCase();
const names={gold:'золота',crystals:'кристаллов',parts:'деталей'};
const keys=['gold','crystals','parts'];
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amounts=w=>keys.filter(k=>w?.[k]).map(k=>w[k]+' '+names[k]).join(', ')||'ничего';
const person=id=>state?.players?.find(p=>p.id===id);
const label=id=>person(id)?.character||person(id)?.name||'Игрок';
const formatEffect=(fx,minus=false)=>{
  if(!fx)return '—';
  const key=fx.type==='goldPercent'?'золота':names[fx.type]||fx.type;
  return (minus?'−':'+')+fx.value+(fx.type==='goldPercent'?'% ':' ')+key;
};
let net=null,me=null,state=null,roomId='',mode='home',connecting=false,connected=false;
let name=(localStorage.getItem('black-bazaar:name')||'Игрок').slice(0,22);
let notice='';
function message(m,isError=false){notice=m;status.textContent=m;status.className=isError?'error':'muted';}
function localStore(){const node=document.querySelector('#nickname');if(node)name=(node.value.trim()||'Игрок').slice(0,22);try{localStorage.setItem('black-bazaar:name',name);}catch{}}
function renderHome(){
  mode='home';app.innerHTML='<h1>Чёрная барахолка</h1><p>Механический альфа-прототип: онлайн-торговля предметами со скрытыми эффектами. Для партии нужны 2–6 игроков.</p>'+
  '<div class="panel stack"><label>Имя игрока<input id="nickname" type="text" maxlength="22" value="'+esc(name)+'"></label>'+
  '<button type="button" class="primary" data-action="create">Создать комнату</button>'+
  '<label>Код или полная ссылка комнаты<input id="roomCode" type="text" spellcheck="false" value="'+esc(hintRoom)+'" placeholder="Код комнаты"></label>'+
  '<button type="button" data-action="join">Присоединиться</button></div>'+
  '<div class="panel"><h2>Правила тестовой партии</h2><p>Девять раундов. Три ресурса. У каждого секретная квота и тайные связи. Продавец объявляет цену за предмет, остальные предлагают ставки. Каждые три раунда появляется личный срочный заказ, который надо оплатить к концу своего хода.</p><p>У предметов есть доход и содержание — покупатель видит точные свойства только после покупки. Можно проверить чужой лот за 15 золота. Система сама подсчитывает конец раунда и места.</p></div>';
}
function renderLobby(){
  mode='lobby';
  const all=state?.players||[];
  const host=state?.host===me?.id;
  const short=roomId.slice(0,8).toUpperCase();
  app.innerHTML='<h1>Комната '+esc(short)+'</h1><p>Участники: '+all.length+'/6. Отправьте код или ссылку друзьям.</p>'+
  '<div class="panel stack"><div class="row"><button type="button" data-action="copy-code">Скопировать код</button><button type="button" data-action="copy-url">Скопировать ссылку</button></div>'+
  '<ul>'+all.map(p=>'<li>'+esc(p.name)+(p.id===state.host?' (ведущий)':'')+'</li>').join('')+'</ul>'+
  (host?'<button type="button" class="primary" data-action="start" '+(all.length<2?'disabled':'')+'>Начать партию</button>':'<p>Ведущий начинает игру, когда все подключились.</p>')+
  '<button type="button" data-action="leave">Покинуть комнату</button></div>';
}
function scoreBox(){
  return '<div class="panel"><h2>Участники</h2><table class="table"><thead><tr><th>Игрок</th><th>Ресурсы</th><th>Предметы</th><th>Штрафы</th></tr></thead><tbody>'+
  state.players.map(p=>'<tr><td><strong>'+esc(p.character)+'</strong><br><small>'+esc(p.name)+(p.id===state.turnId?' · ходит':'')+'</small></td>'+
    '<td>'+esc(amounts(p.resources))+'</td><td>'+p.items+'</td><td>'+p.strikes+'/3'+(p.bankrupt?' · банкрот':'')+'</td></tr>').join('')+
    '</tbody></table></div>';
}
function inventoryBlock(you){
 return '<div class="panel"><h2>Мой инвентарь ('+you.items.length+'/4)</h2>'+
 (you.items.length?'<ol class="inventory">'+you.items.map(it=>'<li><strong>'+esc(it.name)+'</strong> · '+esc(it.rarity)+
 '<div class="success">Доход: '+esc(formatEffect(it.positive))+'</div><div class="error">Содержание: '+esc(formatEffect(it.negative,true))+
 '</div><small>Получен в раунде '+it.acquiredRound+(it.acquiredRound===state.round?' — пока нельзя перепродать':'')+'</small></li>').join('')+'</ol>':'<p class="muted">Предметов нет. Можно подработать и торговать ресурсами через ломбард.</p>')+
 '</div>';
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
 return '<div class="panel urgent"><h2>Срочный заказ · '+(u.status==='pending'?'должен быть оплачен до конца твоего хода':u.status==='success'?'выполнен':'провален')+'</h2>'+
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
 if(!sellerIsMe&&already)html+='<p>Проверка показала содержание: <strong>'+esc(formatEffect(already.negative,true))+'</strong></p>';
 if(!sellerIsMe&&!already)html+='<button type="button" data-action="inspect" '+(you.resources.gold<15?'disabled':'')+'>Проверить содержание (15 золота)</button>';
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
function itemOptions(items){
 return '<option value="">Без предмета</option>'+
   items.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.name)+'</option>').join('');
}
function tradePanel(you){
 const deals=state.deals||[];
 const inbox=deals.filter(d=>d.to===you.id);
 const outbox=deals.filter(d=>d.from===you.id);
 let html='<div class="panel"><h2>Прямой обмен с игроками</h2>'+
 '<p class="muted">Предложить можно даже во время чужого хода. Сделка проводится только после согласия обеих сторон. Разрешены подарки, обмен ресурсами и предметами.</p>';
 if(inbox.length){
  html+='<h3>Предложения тебе</h3>'+inbox.map(d=>'<div class="offer"><p>'+dealDescription(d)+'</p>'+
    '<div class="row"><button type="button" class="primary" data-action="deal-accept" data-id="'+esc(d.id)+'">Принять обмен</button>'+
    '<button type="button" data-action="deal-cancel" data-id="'+esc(d.id)+'">Отклонить</button></div></div>').join('');
 }
 if(outbox.length){
  html+='<h3>Твоё предложение</h3>'+outbox.map(d=>'<div class="offer"><p>'+dealDescription(d)+'</p>'+
    '<button type="button" data-action="deal-cancel" data-id="'+esc(d.id)+'">Отозвать</button></div>').join('');
 }
 const recipients=state.players.filter(p=>p.id!==you.id&&!p.bankrupt&&p.connected);
 if(!you.bankrupt&&recipients.length){
  const first=recipients[0];
  const giveItems=you.items.filter(i=>i.acquiredRound!==state.round&&i.id!==state.listing?.id);
  const wantItems=first.inventory.filter(i=>i.id!==state.listing?.id);
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
function actionsBlock(you){
 let html='<div class="panel"><h2>Мой ход: операции</h2>';
 if(you.bankrupt)return html+'<p>Ты обанкротился. Можно наблюдать за ходом партии.</p><button data-action="end">Пропустить ход</button></div>';
 html+='<p>Можно заработать на подработке, сделать до двух продаж и выполнить одну операцию с ломбардом за ход.</p>';
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
 }else html+='<p class="muted">Ломбард использован в этом ходу.</p>';
 return html+'<button type="button" class="primary" data-action="end">Завершить ход →</button></div>';
}
function collectDrafts(){
 const current={};
 for(const form of app.querySelectorAll('form[data-form]')){
  current[form.dataset.form]=Object.fromEntries(new FormData(form).entries());
 }
 return current;
}
function restoreDrafts(drafts){
 for(const form of app.querySelectorAll('form[data-form]')){
  const vals=drafts[form.dataset.form];
  if(!vals)continue;
  if(form.dataset.form==='deal'&&vals.to){
   const target=state?.players?.find(p=>p.id===vals.to);
   const requested=form.querySelector('#dealWantItem');
   if(target&&requested)requested.innerHTML=itemOptions(target.inventory.filter(i=>i.id!==state.listing?.id));
  }
  for(const field of Array.from(form.elements)){
   if(!field.name||vals[field.name]===undefined)continue;
   const value=vals[field.name];
   if(field.tagName==='SELECT'&&!Array.from(field.options).some(o=>o.value===value))continue;
   field.value=value;
  }
 }
}
function renderPlay(){
 const drafts=mode==='play'?collectDrafts():{};
 mode='play';const you=state.you;
 if(!you){app.innerHTML='<p>Синхронизация личного состояния…</p>';return;}
 const active=state.turnId===me?.id;
 app.innerHTML='<div class="row"><h1>Раунд '+state.round+' / '+state.rounds+'</h1><span class="chip">'+(active?'Твой ход':'Ход: '+esc(label(state.turnId)))+'</span>'+
 '<button type="button" data-action="leave">Выйти из комнаты</button></div>'+
 '<div class="panel"><h2>'+esc(you.character)+'</h2><p>Запасы: <strong>'+esc(amounts(you.resources))+'</strong>. Провалы срочных заказов: '+state.players.find(p=>p.id===me.id)?.strikes+'/3.</p></div>'+
 '<div class="layout"><div>'+secretBlock(you)+urgentBlock(you)+inventoryBlock(you)+'</div>'+
 '<div>'+tradePanel(you)+marketBlock(you,active)+(active?actionsBlock(you):'<div class="panel"><p>Пока другой игрок продаёт товар, можно предложить ставку на его лот или прямой обмен.</p></div>')+'</div>'+
 '<div class="wide">'+scoreBox()+'<div class="panel"><h2>Журнал событий</h2><ol>'+state.log.map(entry=>'<li>'+esc(entry)+'</li>').join('')+'</ol></div></div></div>';
 restoreDrafts(drafts);
}
function renderDone(){
 mode='done';
 const ranks=state.ranking||[];
 app.innerHTML='<h1>Партия окончена</h1><p>Рейтинг по выполнению секретной квоты. Банкротство лишает права на победу; легендарная связь может изменить второе место.</p>'+
 '<div class="panel"><table class="table"><thead><tr><th>Место</th><th>Игрок</th><th>Квота</th><th>Итог</th></tr></thead><tbody>'+
 ranks.map(p=>'<tr><td>'+p.place+'</td><td>'+esc(p.character)+' · '+esc(p.name)+'</td><td>'+p.progress+'%</td><td>'+(p.bankrupt?'банкрот':p.complete?'выполнена':'не выполнена')+'</td></tr>').join('')+
 '</tbody></table></div><div class="row">'+(state.host===me?.id?'<button type="button" data-action="start" class="primary">Новая партия</button>':'')+
 '<button type="button" data-action="leave">В меню</button></div>';
}
function render(){
 if(!state)return renderHome();
 if(state.phase==='lobby')return renderLobby();
 if(state.phase==='done')return renderDone();
 return renderPlay();
}
function closeRoom(){
 if(net){try{if(connected)net.leaveRoom()}catch{}try{net.close()}catch{}}
 net=null;me=null;state=null;roomId='';connected=false;connecting=false;message('');renderHome();
}
function wire(client){
 client.on('connected',data=>{if(net!==client)return;me=data.player;connected=true;message('PocketNet подключён.');});
 client.on('room_joined',data=>{if(net!==client)return;roomId=data.roomId;state=data.state;connecting=false;message('Комната подключена.');render();});
 client.on('game_event',data=>{if(net!==client)return;if(data.event?.type==='state'){state=data.event.payload;render();}else if(data.event?.type==='notice')message(data.event.payload,true);});
 client.on('disconnected',()=>{if(net!==client)return;connected=false;message('Связь потеряна. PocketNet переподключается…',true);});
 client.on('error',e=>{if(net!==client)return;message('Ошибка сервера: '+String(e?.code||e?.message||'неизвестно'),true);});
 client.on('room_closed',()=>{if(net!==client)return;closeRoom();message('Комната закрылась.',true);});
}
async function connect(kind,code=''){
 if(connecting)return;
 connecting=true;state=null;roomId='';renderHome();message('Подключение к PocketNet…');
 try{
  if(net){net.close();net=null;}
  const storage=sessionStorage;
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
app.addEventListener('change',event=>{
 if(event.target.id!=='dealTarget')return;
 const target=state?.players?.find(p=>p.id===event.target.value);
 const dropdown=document.querySelector('#dealWantItem');
 if(dropdown&&target)dropdown.innerHTML=itemOptions(target.inventory.filter(i=>i.id!==state.listing?.id));
});
app.addEventListener('submit',event=>{
 const form=event.target.closest('form[data-form]');if(!form)return;
 event.preventDefault();const data=new FormData(form),type=form.dataset.form;
 const wallet=prefix=>Object.fromEntries(keys.map(k=>[k,Number(data.get(prefix+'_'+k)||0)]));
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
 if(type==='exchange')return request({type:'exchange',mode:data.get('mode')});
});
renderHome();
try{const saved=JSON.parse(sessionStorage.getItem('pocket-net:'+ORIGIN)||'null');if(saved?.roomId)connect('resume');}catch{}
