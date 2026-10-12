import {pocketAvatarMarkup} from './capabilities/identity.js';
// Pocket Social shared UI. No dependency on a specific app runtime or framework.
const q=(s,root=document)=>root.querySelector(s);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const backgrounds=[['forest','Лес','#426c60'],['clay','Терракота','#965545'],['lilac','Сирень','#776185'],['ocean','Океан','#347e8c'],['night','Ночь','#252d39'],['paper','Бумага','#d6bea1']];
const frames=[['clean','Чистая'],['double','Двойная'],['corners','Углы'],['stamp','Марка']];
const colors=['#1d3040','#d65b48','#edb55f','#529276','#8b65ab','#ffffff'];
const errors={sign_in_required:'Войди в Pocket ID, чтобы пользоваться друзьями.',identity_unavailable:'Не удалось проверить аккаунт Pocket ID.',rate_limited:'Слишком много запросов. Попробуй позже.',not_room_member:'Сначала войди в игровую комнату.',room_unavailable:'Комната уже закрыта, заполнена или игра началась.',invite_expired:'Приглашение уже недействительно.',blocked:'Запрос недоступен для этого игрока.',invites_disabled:'Игрок отключил приглашения.',friends_only:'Приглашать можно только друзей.',already_requested:'Заявка уже отправлена.',already_friends:'Вы уже друзья.',user_not_found:'Игрок не найден.',invalid_profile:'Проверь выбранное оформление.',network:'Нет подключения к серверу PocketWorks.'};
const button=(name,label,kind='quiet',extra='')=>'<button type="button" class="pws-btn pws-btn--'+kind+'" data-pws="'+name+'" '+extra+'>'+label+'</button>';
const state={tab:'profile',me:null,other:null,query:'',results:[],room:'',game:'zamazka',catalog:[],loading:false,busy:false,edit:false,draft:null,artHistory:[],ink:colors[0],notice:'',error:'',confirm:null,searchVersion:0};
let dialog,content,entry,searchClock=0,pollClock=0,heartbeatClock=0;
const api=async(path,body)=>{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch('/pocket-social/'+path,{credentials:'same-origin',cache:'no-store',
      method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},
      body:body?JSON.stringify(body):undefined,signal:controller.signal});
    const data=await response.json().catch(()=>({error:'invalid_response'}));
    if(!response.ok)throw Error(errors[data.error]||data.error||'Ошибка сервера');
    return data;
  }catch(error){
    if(error.name==='AbortError'||error instanceof TypeError)throw Error(errors.network);
    throw error;
  }finally{clearTimeout(timeout)}
};
const avatar=p=>p.artwork?'<img src="'+esc(p.artwork)+'" alt="Нарисованный аватар">':pocketAvatarMarkup(p.avatar,{accountId:p.id});
const gameLabel=id=>state.catalog.find(g=>g.slug===id)?.name||id||'Не выбрана';
function card(p){
  return '<div class="pws-card" data-background="'+esc(p.background)+'" data-frame="'+esc(p.frame)+'">'+
  '<div class="pws-card__top"><div class="pws-avatar">'+avatar(p)+'</div><div class="pws-card__id">POCKET / ID<br>PLAYER CARD</div></div>'+
  '<div class="pws-card__name">'+esc(p.nickname)+'</div>'+
  '<div class="pws-card__foot"><span>'+esc(p.favoriteGame?gameLabel(p.favoriteGame):'Участник PocketWorks')+'</span>'+
  '<span>'+ (p.owned?'Мой профиль':p.online?'● В сети':'Не в сети')+'</span></div></div>';
}
const errorMarkup=()=>state.error?'<div class="pws-error" role="alert">'+esc(state.error)+'</div>':state.notice?'<div class="pws-notice" role="status">'+esc(state.notice)+'</div>':'';
function person(p){
  return '<div class="pws-person"><div class="pws-person__avatar">'+avatar(p)+'</div>'+
  '<div class="pws-person__name"><strong>'+esc(p.nickname)+'</strong><small>'+
  (p.online?'● В сети'+(p.gameId?' · '+esc(gameLabel(p.gameId)):''):'Не в сети')+'</small></div>'+
  button('open-user','Профиль','quiet','data-id="'+esc(p.id)+'"')+'</div>';
}
function listPeople(list,empty){return list?.length?'<div class="pws-list">'+list.map(person).join('')+'</div>':'<div class="pws-empty">'+empty+'</div>'}
function profilePanel(){
  const p=state.me?.profile;
  if(!p)return '<div class="pws-empty">Создай аккаунт Pocket ID, чтобы открыть профиль и список друзей.</div>'+
    '<div class="pws-actions">'+button('login','Открыть Pocket ID','primary')+'</div>';
  return '<h2>Твоя карточка</h2><div class="pws-profile-layout"><section>'+card(state.edit?{...p,...state.draft}:p)+
    '<div class="pws-actions">'+(state.edit?'':button('edit','Изменить профиль','primary'))+
    button('copy-id','Скопировать ID','quiet')+'</div></section><section class="pws-section">'+
    '<h3>Личный профиль</h3><div class="pws-muted">Рисунок, любимая игра и оформление видны другим игрокам. При желании можно скрыть присутствие и профиль из поиска.</div>'+
    '<p class="pws-muted">ID: <code>'+esc(p.id)+'</code></p>'+button('account','Аккаунт и безопасность')+'</section></div>'+
    (state.edit?editor(): '');
}
function editor(){
  const d=state.draft;
  return '<section class="pws-editor"><h2>Единый редактор профиля</h2>'+
    '<div class="pws-field"><label for="pws-nickname">Никнейм Pocket ID</label>'+
    '<input id="pws-nickname" type="text" maxlength="20" minlength="3" autocomplete="nickname" spellcheck="false" value="'+esc(d.nickname)+'">'+
    '<div class="pws-muted">Уникальный никнейм для всех игр · 3–20 символов</div></div>'+
    '<div class="pws-field"><label>Нарисуй аватар</label><div class="pws-editor-tools">'+
    '<canvas class="pws-draw" width="160" height="160" aria-label="Редактор аватара"></canvas>'+
    '<div><div class="pws-muted">Проведи пальцем или мышью по холсту.</div>'+
    '<div class="pws-swatches">'+colors.map(c=>'<button type="button" class="pws-swatch" style="--swatch:'+c+'" data-pws="ink" data-value="'+c+'" aria-label="Цвет '+c+'" aria-pressed="'+(state.ink===c)+'"></button>').join('')+'</div>'+
    '<div class="pws-actions">'+button('undo','Отменить')+button('clear-art','Очистить')+'</div></div></div></div>'+
    '<div class="pws-field"><label>Фон карточки</label><div class="pws-options">'+
    backgrounds.map(t=>'<button type="button" class="pws-option pws-option--theme" style="--sample:'+t[2]+'" title="'+t[1]+'" aria-label="'+t[1]+'" data-pws="background" data-value="'+t[0]+'" aria-pressed="'+(d.background===t[0])+'"></button>').join('')+'</div></div>'+
    '<div class="pws-field"><label>Рамка</label><div class="pws-options">'+frames.map(t=>'<button type="button" class="pws-option" data-pws="frame" data-value="'+t[0]+'" aria-pressed="'+(d.frame===t[0])+'">'+t[1]+'</button>').join('')+'</div></div>'+
    '<div class="pws-field"><label for="pws-favorite">Любимая игра</label><select id="pws-favorite"><option value="">Не выбрана</option>'+
    state.catalog.map(g=>'<option value="'+esc(g.slug)+'" '+(g.slug===d.favoriteGame?'selected':'')+'>'+esc(g.name)+'</option>').join('')+'</select></div>'+
    '<label class="pws-check"><input type="checkbox" id="pws-discoverable" '+(d.discoverable?'checked':'')+'> Показывать профиль в поиске</label>'+
    '<label class="pws-check"><input type="checkbox" id="pws-presence" '+(d.presenceVisible?'checked':'')+'> Показывать, когда я в сети</label>'+
    '<label class="pws-check"><input type="checkbox" id="pws-invites" '+(d.allowInvites?'checked':'')+'> Разрешать игровые приглашения</label>'+
    '<div class="pws-actions">'+button('save-profile','Сохранить','primary')+button('cancel-edit','Отмена')+'</div></section>';
}
function otherPanel(){
  const p=state.other;
  if(!p)return button('back','← К друзьям')+'<div class="pws-empty">Не удалось получить профиль игрока.</div>';
  const status=p.friendship;
  const controls=status==='none'?button('send-request','Добавить в друзья','primary'):
    status==='outgoing'?button('cancel-friend','Отменить заявку'):
    status==='incoming'?button('accept-friend','Принять','primary')+button('decline-friend','Отклонить'):
    status==='friends'?button('remove-friend','Удалить из друзей'):
    p.blockedByMe?button('unblock-friend','Разблокировать'):'';
  return button('back','← Назад')+'<h2 style="margin-top:15px">'+esc(p.nickname)+'</h2>'+card(p)+
    '<div class="pws-actions">'+controls+
    (p.blockedByMe?'':button('block-friend','Заблокировать','danger'))+'</div>'+
    (state.confirm?confirmPanel():'');
}
function confirmPanel(){
  const action=state.confirm;
  return '<section class="pws-confirm"><strong>'+ (action==='block'?'Заблокировать игрока?':'Удалить из друзей?')+'</strong>'+
    '<div class="pws-muted">Действие изменит доступ к приглашениям и заявкам.</div><div class="pws-actions">'+
    button('confirm-action','Подтвердить','danger')+button('cancel-confirm','Отмена')+'</div></section>';
}
function friendsPanel(){
  if(!state.me)return profilePanel();
  return '<h2>Друзья</h2><div class="pws-field"><label for="pws-search">Найти игрока по нику или ID</label>'+
    '<input id="pws-search" type="search" maxlength="40" autocomplete="off" spellcheck="false" placeholder="Введите никнейм…" value="'+esc(state.query)+'"></div>'+
    '<div id="pws-results">'+searchResults()+'</div>'+
    '<h3>Друзья · '+state.me.friends.length+'</h3>'+listPeople(state.me.friends,'Пока никого. Найди игрока по нику, чтобы отправить заявку.')+
    '<h3>Входящие заявки · '+state.me.incoming.length+'</h3>'+listPeople(state.me.incoming,'Новых заявок нет.')+
    '<h3>Отправленные заявки · '+state.me.outgoing.length+'</h3>'+listPeople(state.me.outgoing,'Нет ожидающих заявок.')+
    '<h3>Заблокированные · '+(state.me.blocked||[]).length+'</h3>'+listPeople(state.me.blocked||[],'Заблокированных нет.');
}
function searchResults(){
  if(!state.query.trim())return '';
  if(state.query.trim().length<2)return '<div class="pws-muted">Введите хотя бы 2 символа.</div>';
  return state.results.length?'<h3>Результаты поиска</h3>'+listPeople(state.results,'Игроки не найдены.'):'<div class="pws-muted">Нет совпадений.</div>';
}
function invitesPanel(){
  if(!state.me)return profilePanel();
  const invites=state.me.invites.filter(i=>i.status==='pending');
  return '<h2>Игровые приглашения</h2>'+
    (invites.length?'<div class="pws-list">'+invites.map(i=>'<div class="pws-person"><div class="pws-person__avatar">↗</div>'+
    '<div class="pws-person__name"><strong>'+esc(i.incoming?i.fromName:i.toName)+'</strong>'+
    '<small>'+esc(gameLabel(i.gameId))+' · '+(i.incoming?'приглашает тебя':'ожидает ответа')+'</small></div>'+
    (i.incoming?button('accept-invite','Войти','primary','data-id="'+esc(i.id)+'"')+
      button('decline-invite','Отклонить','quiet','data-id="'+esc(i.id)+'"'):
      button('cancel-invite','Отозвать','quiet','data-id="'+esc(i.id)+'"'))+
    '</div>').join('')+'</div>':'<div class="pws-empty">Нет ожидающих приглашений.</div>')+
    '<p class="pws-muted">Приглашения действуют 30 минут, пока комната ожидания открыта.</p>';
}
function invitePanel(){
  if(!state.me)return profilePanel();
  return '<h2>Позвать в Замазку</h2><p class="pws-muted">Приглашение получит друг, который сможет войти в эту комнату одним нажатием.</p>'+
    '<div class="pws-list">'+(state.me.friends.filter(p=>p.allowInvites).map(p=>
    '<div class="pws-person"><div class="pws-person__avatar">'+esc((p.nickname||'?')[0].toUpperCase())+'</div>'+
    '<div class="pws-person__name"><strong>'+esc(p.nickname)+'</strong><small>'+(p.online?'● В сети':'Не в сети')+'</small></div>'+
    button('send-invite','Пригласить','primary','data-id="'+esc(p.id)+'"')+'</div>').join('')||
    '<div class="pws-empty">Нет друзей, которым можно отправить приглашение. Добавь их в разделе «Друзья».</div>')+'</div>';
}
function render(){
  if(!dialog?.open)return;
  q('#pws-tabs',dialog).hidden=!state.me;
  for(const t of dialog.querySelectorAll('[data-pws-tab]'))t.setAttribute('aria-selected',String(t.dataset.pwsTab===state.tab));
  content.innerHTML=errorMarkup()+(state.loading?'<div class="pws-loading">Загрузка…</div>':
    state.tab==='profile'?profilePanel():
    state.tab==='friends'?friendsPanel():
    state.tab==='invites'?invitesPanel():
    state.tab==='invite'?invitePanel():otherPanel());
  if(state.edit&&state.tab==='profile')initCanvas();
}
function updateNotification(count){
  if(!entry)return;
  let badge=q('.pws-entry__count',entry);
  if(!badge){
    badge=document.createElement('span');
    badge.className='pws-entry__count';
    entry.append(badge);
  }
  badge.textContent=String(Math.min(count,99));badge.hidden=!count;
  entry.title=count?count+' новых запросов и приглашений':'Pocket ID · Профиль и друзья';
}
async function reload(rerender=true){
  const data=await api('me');
  // Ignore an in-flight response from a previous account after sign-out/switch.
  const currentAccount=window.PocketID?.getUser?.();
  if(q('#pocket-id-trigger')&&(!currentAccount?.complete||data.profile.id!==currentAccount.id)){
    state.me=null;updateNotification(0);if(rerender)render();return;
  }
  state.me=data;
  const accountButton=q('#pocket-id-trigger');
  if(accountButton && data.profile?.artwork){
    accountButton.innerHTML='<img class="pw-social-personal-avatar" src="'+esc(data.profile.artwork)+'" alt="">';
  } else if(accountButton?.querySelector('.pw-social-personal-avatar')){
    const fallback=q('#pocket-id-active-avatar .pw-id-avatar')?.outerHTML;
    accountButton.innerHTML=fallback?fallback.replace('pw-id-avatar','pw-id-nav-avatar'):
      '<span class="pw-id-nav-glyph" aria-hidden="true">◎</span>';
  }
  const pending=(data.invites||[]).filter(i=>i.incoming&&i.status==='pending').length;
  const requests=(data.incoming||[]).length;
  updateNotification(pending+requests);
  document.dispatchEvent(new CustomEvent('pocket-social:portrait',{detail:{accountId:data.profile.id,artwork:data.profile.artwork||''}}));
  if(rerender)render();
}
async function loadCatalog(){
  try{
    const r=await fetch('/apps.json',{cache:'force-cache'});
    if(r.ok){const apps=await r.json();state.catalog=Array.isArray(apps)?apps.filter(x=>x&&x.slug&&x.name).map(x=>({slug:x.slug,name:x.name})).sort((a,b)=>a.name.localeCompare(b.name)):[]}
  }catch{}
}
function resetNotice(){state.notice='';state.error='';state.confirm=null}
async function open(room=''){
  if(!dialog.open)dialog.showModal();
  state.room=room||'';state.tab=room?'invite':'profile';state.edit=false;state.other=null;
  state.loading=true;resetNotice();render();
  try{await Promise.all([reload(false),loadCatalog()])}
  catch(e){state.me=null;state.error=e.message}
  finally{state.loading=false;render()}
}
async function showUser(id){
  state.tab='other';state.other=null;state.loading=true;resetNotice();render();
  try{state.other=(await api('user?id='+encodeURIComponent(id))).profile}
  catch(e){state.error=e.message}
  finally{state.loading=false;render()}
}
async function search(){
  const query=state.query.trim(),generation=++state.searchVersion;
  if(query.length<2){state.results=[];q('#pws-results',dialog)?.replaceChildren();return}
  try{
    if(/^[0-9a-f-]{36}$/i.test(query)){
      const data=await api('user?id='+encodeURIComponent(query));
      if(generation!==state.searchVersion)return;
      state.results=[data.profile];
    }else{
      const data=await api('search?q='+encodeURIComponent(query));
      if(generation!==state.searchVersion)return;
      state.results=data.users;
    }
  }catch(e){if(generation!==state.searchVersion)return;state.results=[];state.error=e.message}
  const node=q('#pws-results',dialog);
  if(node)node.innerHTML=(state.error?'<div class="pws-error">'+esc(state.error)+'</div>':'')+searchResults();
}
async function updateIdentityNickname(nickname){
  let current=window.PocketID?.getUser?.();
  if(!current){
    const reply=await fetch('/pocket-id/me',{credentials:'same-origin',cache:'no-store'});
    current=(await reply.json()).user;
  }
  if(!current?.complete)throw Error('Для редактирования нужен Pocket ID.');
  if(nickname===current.nickname)return;
  if(nickname.length<3||nickname.length>20||!/^[\p{L}\p{N}_-]+$/u.test(nickname))
    throw Error('Никнейм: от 3 до 20 символов, только буквы, цифры, _ и -.');
  const response=await fetch('/pocket-id/profile',{method:'POST',credentials:'same-origin',
    headers:{'content-type':'application/json'},body:JSON.stringify({nickname,avatar:current.avatar})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(({nickname_taken:'Этот никнейм уже занят.',invalid_profile:'Недопустимый никнейм.'})[data.error]||data.error||'Не удалось сменить никнейм.');
  if(window.PocketID?.refresh)await window.PocketID.refresh();
}
async function saveUnifiedProfile(){
  if(state.busy)return;
  const draft={...state.draft},name=String(draft.nickname||'').trim();
  if(!name){state.error='Введите никнейм.';render();return}
  state.busy=true;resetNotice();
  try{
    // Identity is always canonical for the nickname. Appearance is stored in Pocket Social.
    await updateIdentityNickname(name);
    await api('profile',{background:draft.background,frame:draft.frame,
      artwork:draft.artwork,favoriteGame:draft.favoriteGame,
      discoverable:draft.discoverable,presenceVisible:draft.presenceVisible,
      allowInvites:draft.allowInvites});
    await reload(false);
    state.edit=false;state.notice='Профиль сохранён.';
    document.dispatchEvent(new CustomEvent('pocket-social:profile-updated',{detail:{accountId:state.me?.profile?.id}}));
  }catch(error){
    // The nickname can be saved before an appearance request fails; retry is safe.
    state.error=error.message+' Если никнейм уже изменился, повторное сохранение завершит настройку.';
  }finally{state.busy=false;render()}
}
async function mutate(path,body,{tab,stay=false}={}){
  if(state.busy)return;
  state.busy=true;resetNotice();
  try{
    const value=await api(path,body);
    if(value.url){location.assign(new URL(value.url,location.origin).href);return}
    state.notice=path==='invite'?'Приглашение отправлено.':path==='profile'?'Карточка сохранена.':'Изменения сохранены.';
    await reload(false);
    if(tab)state.tab=tab;
    if(!stay)state.other=null;
  }catch(e){state.error=e.message}
  finally{state.busy=false;render()}
}
function initCanvas(){
  const canvas=q('.pws-draw',dialog);if(!canvas)return;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const restore=data=>{
    ctx.clearRect(0,0,160,160);
    if(!data)return;
    const img=new Image();img.onload=()=>{if(canvas.isConnected)ctx.drawImage(img,0,0,160,160)};img.src=data;
  };
  restore(state.draft.artwork);
  let active=false,last=null;
  canvas.addEventListener('pointerdown',e=>{
    if(state.busy)return;
    active=true;canvas.setPointerCapture(e.pointerId);
    const rect=canvas.getBoundingClientRect();last={x:(e.clientX-rect.left)*160/rect.width,y:(e.clientY-rect.top)*160/rect.height};
    ctx.strokeStyle=state.ink;ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=6;
    ctx.beginPath();ctx.arc(last.x,last.y,3,0,Math.PI*2);ctx.fillStyle=state.ink;ctx.fill();
  });
  canvas.addEventListener('pointermove',e=>{
    if(!active)return;
    const rect=canvas.getBoundingClientRect(),now={x:(e.clientX-rect.left)*160/rect.width,y:(e.clientY-rect.top)*160/rect.height};
    ctx.beginPath();ctx.strokeStyle=state.ink;ctx.lineWidth=6;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.moveTo(last.x,last.y);ctx.lineTo(now.x,now.y);ctx.stroke();last=now;
  });
  const done=()=>{if(!active)return;active=false;
    state.draft.artwork=canvas.toDataURL('image/webp',.78);
    if(state.draft.artwork.length>24000){
      state.draft.artwork=canvas.toDataURL('image/webp',.48);
    }
    if(state.draft.artwork.length>24000){state.error='Слишком большой рисунок. Упрости его.';state.draft.artwork=state.artHistory.at(-1)||'';restore(state.draft.artwork);render();return}
    state.artHistory.push(state.draft.artwork);if(state.artHistory.length>25)state.artHistory.shift();
    const avatarEl=q('.pws-card .pws-avatar',dialog);if(avatarEl)avatarEl.innerHTML=avatar({...state.me.profile,artwork:state.draft.artwork});
  };
  canvas.addEventListener('pointerup',done);canvas.addEventListener('pointercancel',done);
}
function install(){
  if(!document.body||dialog)return;
  const identityTrigger=q('#pocket-id-trigger');
  if(identityTrigger){
    // Launcher has one entry: Pocket ID opens this card. No second Social icon.
    entry=identityTrigger;
    entry.classList.add('pws-entry');
    entry.insertAdjacentHTML('beforeend','<span class="pws-entry__count" hidden></span>');
  }else{
    // Standalone apps keep their own tools (e.g. Zamazka's personal seal).
    const host=q('.nav-tools')||q('header.top');
    if(host){
      entry=document.createElement('button');entry.id='pocket-social-trigger';entry.type='button';
      entry.className='pws-entry round-control';entry.setAttribute('aria-label','Pocket ID · Профиль и друзья');
      entry.innerHTML='<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 19v-2a6 6 0 0 1 12 0v2M17 7a3 3 0 0 1 0 6M18 16a4 4 0 0 1 3 3"/></svg><span class="pws-entry__count" hidden></span>';
      host.append(entry);entry.addEventListener('click',()=>open());
    }
  }
  dialog=document.createElement('dialog');dialog.className='pws-dialog';dialog.setAttribute('aria-label','Pocket Social');
  dialog.innerHTML='<div class="pws-shell"><header class="pws-top"><div class="pws-brand">POCKET / ID</div>'+
    '<button class="pws-close" type="button" data-pws="close" aria-label="Закрыть">✕</button></header>'+
    '<nav class="pws-tabs" id="pws-tabs" aria-label="Социальные разделы">'+
    '<button type="button" class="pws-tab" data-pws-tab="profile">Профиль</button>'+
    '<button type="button" class="pws-tab" data-pws-tab="friends">Друзья</button>'+
    '<button type="button" class="pws-tab" data-pws-tab="invites">Приглашения</button></nav>'+
    '<div class="pws-content" id="pws-content"></div>'+
    '<footer class="pws-mobile-exit">'+button('close','Закрыть меню')+'</footer></div>';
  document.body.append(dialog);content=q('#pws-content',dialog);
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
  dialog.addEventListener('change',e=>{
    if(!state.draft)return;
    const t=e.target;
    if(t.id==='pws-favorite')state.draft.favoriteGame=t.value;
    if(t.id==='pws-discoverable')state.draft.discoverable=t.checked;
    if(t.id==='pws-presence')state.draft.presenceVisible=t.checked;
    if(t.id==='pws-invites')state.draft.allowInvites=t.checked;
    if(t.id==='pws-nickname')state.draft.nickname=t.value;
  });
  dialog.addEventListener('input',e=>{
    if(e.target.id==='pws-nickname'&&state.draft){state.draft.nickname=e.target.value;return}
    if(e.target.id!=='pws-search')return;
    state.query=e.target.value;clearTimeout(searchClock);
    searchClock=setTimeout(search,300);
  });
  document.addEventListener('click',e=>{
    const target=e.target.closest?.('[data-social-invite]');
    if(target){e.preventDefault();open(target.dataset.roomId||'')}
  });
  dialog.addEventListener('click',async e=>{
    const tab=e.target.closest('[data-pws-tab]');
    if(tab){resetNotice();state.tab=tab.dataset.pwsTab;state.edit=false;state.other=null;render();return}
    const target=e.target.closest('[data-pws]');
    if(!target||state.busy)return;
    const action=target.dataset.pws,id=target.dataset.id;
    if(action==='close'){dialog.close();return}
    if(action==='login'){dialog.close();if(window.PocketID?.openAccount)window.PocketID.openAccount();else location.assign('/?pocket-id=login');return}
    if(action==='account'){dialog.close();if(window.PocketID?.openAccount)window.PocketID.openAccount();else location.assign('/?pocket-id=login');return}
    if(action==='copy-id'){try{await navigator.clipboard.writeText(state.me.profile.id);state.notice='ID скопирован.'}catch{state.error='Не удалось скопировать ID.'}render();return}
    if(action==='edit'){state.edit=true;state.draft={...state.me.profile};
      state.artHistory=[state.draft.artwork];resetNotice();render();return}
    if(action==='cancel-edit'){state.edit=false;render();return}
    if(action==='background'||action==='frame'){state.draft[action]=target.dataset.value;render();return}
    if(action==='ink'){state.ink=target.dataset.value;render();return}
    if(action==='undo'){
      if(state.artHistory.length>1)state.artHistory.pop();
      state.draft.artwork=state.artHistory.at(-1)||'';render();return;
    }
    if(action==='clear-art'){state.draft.artwork='';state.artHistory.push('');render();return}
    if(action==='save-profile'){await saveUnifiedProfile();return}
    if(action==='open-user'){await showUser(id);return}
    if(action==='back'){state.tab='friends';state.other=null;resetNotice();render();return}
    if(action==='send-request'){await mutate('friend-request',{id:state.other.id},{tab:'friends'});return}
    if(action==='cancel-friend'){await mutate('friend-action',{id:state.other.id,action:'cancel'},{tab:'friends'});return}
    if(action==='accept-friend'){await mutate('friend-action',{id:state.other.id,action:'accept'},{tab:'friends'});return}
    if(action==='decline-friend'){await mutate('friend-action',{id:state.other.id,action:'decline'},{tab:'friends'});return}
    if(action==='remove-friend'||action==='block-friend'){state.confirm=action==='block-friend'?'block':'remove';render();return}
    if(action==='cancel-confirm'){state.confirm=null;render();return}
    if(action==='confirm-action'){
      await mutate('friend-action',{id:state.other.id,action:state.confirm},{tab:'friends'});return;
    }
    if(action==='unblock-friend'){await mutate('friend-action',{id:state.other.id,action:'unblock'},{tab:'friends'});return}
    if(action==='send-invite'){await mutate('invite',{toId:id,roomId:state.room,gameId:state.game},{tab:'invite',stay:true});return}
    if(action==='accept-invite'){await mutate('invite-action',{id,action:'accept'},{tab:'invites'});return}
    if(action==='decline-invite'){await mutate('invite-action',{id,action:'decline'},{tab:'invites'});return}
    if(action==='cancel-invite'){await mutate('invite-action',{id,action:'cancel'},{tab:'invites'});return}
  });
  async function pulse(){
    if(document.visibilityState==='hidden'||!navigator.onLine)return;
    try{
      const u=await fetch('/pocket-id/me',{credentials:'same-origin',cache:'no-store'}).then(r=>r.json());
      if(!u.user?.complete)return;
      const gameId=location.pathname.startsWith('/apps/zamazka/')?'zamazka':'';
      await api('presence',{gameId});
    }catch{}
  }
  heartbeatClock=setInterval(pulse,32000);
  pollClock=setInterval(async()=>{
    if(document.visibilityState==='hidden'||!navigator.onLine||state.edit)return;
    try{await reload(dialog.open&&['friends','invites'].includes(state.tab))}catch{}
  },22000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){pulse();reload(false).catch(()=>{})}});
  document.addEventListener('pocket-id:changed',event=>{
    if(!event.detail?.user?.complete){
      state.me=null;state.other=null;state.edit=false;state.results=[];
      updateNotification(0);if(dialog.open)render();
    }else reload(false).catch(()=>{});
    pulse();
  });
  pulse();reload(false).catch(()=>{});
}
window.PocketSocial=Object.freeze({open:(room='')=>open(room)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
