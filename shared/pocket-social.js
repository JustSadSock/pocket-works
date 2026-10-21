import {askUnsaved,confirmShell} from './shell-dialogs.js';
import {pocketAvatarMarkup} from './capabilities/identity.js';
import {zamazkaAchievements} from './capabilities/zamazka-achievements.js';
import {collectProfileRewards,profileRewardById,rewardIsEquipped,equipProfileReward} from './capabilities/profile-rewards.js';
import {mountCardCanvas} from './capabilities/card-studio.js';
import {mascotSvg,safeMascot,mascotPublicUnlocks,mascotAnimals,mascotHats,mascotClothes,mascotAccessories,mascotFaces,mascotTitles} from './capabilities/maskot.js';
// Pocket Social shared UI. No dependency on a specific app runtime or framework.
const q=(s,root=document)=>root.querySelector(s);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const backgrounds=[['forest','Лес','#426c60'],['clay','Терракота','#965545'],['lilac','Сирень','#776185'],['ocean','Океан','#347e8c'],['night','Ночь','#252d39'],['paper','Бумага','#d6bea1'],['gallery','Галерея при свечах','#846142']];
const frames=[['clean','Чистая'],['double','Двойная'],['corners','Углы'],['stamp','Марка']];
const portraitFrames=[['none','Без рамки'],['wood','Резное дерево'],['gilt','Позолоченная'],['worn-gilt','Потёртая позолота']];
const colors=['#273d46','#fff8e6','#d75e55','#f2ad6c','#f2d478','#82aa73','#478d8c','#6092bd','#8865a3','#c87eac','#8a604d','#101c29'];
const errors={party_full:'В компании уже три друга.',invalid_code:'Неверный код.',sign_in_required:'Войди в Pocket ID, чтобы пользоваться друзьями.',identity_unavailable:'Не удалось проверить аккаунт Pocket ID.',rate_limited:'Слишком много запросов. Попробуй позже.',not_room_member:'Сначала войди в игровую комнату.',room_unavailable:'Комната уже закрыта, заполнена или игра началась.',invite_expired:'Приглашение уже недействительно.',blocked:'Запрос недоступен для этого игрока.',invites_disabled:'Игрок отключил приглашения.',friends_only:'Приглашать можно только друзей.',already_requested:'Заявка уже отправлена.',already_friends:'Вы уже друзья.',user_not_found:'Игрок не найден.',invalid_profile:'Проверь выбранное оформление.',network:'Нет подключения к серверу PocketWorks.'};
const button=(name,label,kind='quiet',extra='')=>'<button type="button" class="pws-btn pws-btn--'+kind+'" data-pws="'+name+'" '+extra+'>'+label+'</button>';
const state={editorTab:'animal',rewardGame:'all',rewardView:'all',paintOpen:false,reward:null,tab:'profile',exiting:false,draftBase:null,editorSection:'appearance',me:null,other:null,query:'',results:[],room:'',game:'zamazka',catalog:[],loading:false,busy:false,edit:false,draft:null,artHistory:[],ink:colors[0],notice:'',error:'',confirm:null,searchVersion:0,searchLoading:false,searchError:'',unseenIncoming:[],unseenInvites:[],friendOrder:[],otherReturn:null,syncOffline:false,cloud:null,cloudAccount:null,cloudLoading:false,cloudError:'',cloudVersion:0,cloudUpdated:0,expanded:{account:false,cloud:false,incoming:true,outgoing:false,blocked:false,party:false,appearance:false}};
let dialog,content,entry,paintSession=null,searchClock=0,pollClock=0,heartbeatClock=0;
let livePollClock=0,livePollBusy=false,reloadVersion=0,lastPortraitKey='',lastNotificationKey='',lastHomeKey='',liveRevision=null,lastCatalogCheck=0;
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
const avatar=p=>p.maskot?mascotSvg(p.maskot,{unlocks:p.unlocked||mascotPublicUnlocks}):
  p.artwork?'<img src="'+esc(p.artwork)+'" alt="Нарисованный аватар">':pocketAvatarMarkup(p.avatar,{accountId:p.id});
const gameLabel=id=>state.catalog.find(g=>g.slug===id)?.name||id||'Не выбрана';
function card(p){
  const mode=p.backgroundMode==='drawing'?'drawing':'preset';
  const portraitFrame=portraitFrames.some(f=>f[0]===p.portraitFrame)?p.portraitFrame:'wood';
  const paint=(mode==='drawing'&&p.artwork)?'<img class="pws-card__paint" src="'+esc(p.artwork)+'" alt="">':'';
  const portrait=p.maskot?'<div class="pws-portrait" data-portrait-frame="'+portraitFrame+
    '"><div class="pws-avatar">'+avatar(p)+'</div></div>':
    '<div class="pws-avatar">'+avatar(p)+'</div>';
  return '<div class="pws-card" data-background="'+(mode==='drawing'?'drawing':esc(p.background))+
    '" data-frame="'+esc(p.frame)+'">'+paint+
    '<div class="pws-card__top">'+portrait+'<div class="pws-card__id">POCKET / ID<br>PLAYER CARD</div></div>'+
    '<div class="pws-card__name">'+esc(p.nickname)+'</div>'+
    (p.title?'<div class="pws-card__title">'+esc(p.title)+'</div>':'')+
    '<div class="pws-card__foot"><span>'+esc(p.favoriteGame?gameLabel(p.favoriteGame):'Участник PocketWorks')+'</span>'+
    '<span>'+ (p.owned?'Мой профиль':p.online?'● В сети':'Не в сети')+'</span></div></div>';
}
const errorMarkup=()=>state.error?'<div class="pws-error" role="alert">'+esc(state.error)+'</div>':state.notice?'<div class="pws-notice" role="status">'+esc(state.notice)+'</div>':'';
// The compact identity card uses the same saved Pocket ID background, frame and art
// as the full player card. All social surfaces share this renderer.
const presenceLabel=p=>p.activity?
  '● '+gameLabel(p.activity.gameId)+(p.activity.joinable?
    ' · '+p.activity.players+'/'+p.activity.maxPlayers+' в комнате':' · играет'):
  p.online?'● В сети'+(p.gameId?' · '+gameLabel(p.gameId):''):'Не в сети';
const joinButton=p=>p.activity?.joinable?
  button('join-friend','Присоединиться','primary','data-id="'+esc(p.id)+'"'):'';
function friendActions(p){
  return joinButton(p)+button('open-user','Профиль','quiet','data-id="'+esc(p.id)+'"');
}
function personRow(p,actions,subtitle=presenceLabel(p),isNew=false){
  const background=backgrounds.some(t=>t[0]===p.background)?p.background:'forest';
  const frame=frames.some(t=>t[0]===p.frame)?p.frame:'clean';
  const painting=p.backgroundMode==='drawing'&&p.artwork?
    '<img class="pws-person__paint" src="'+esc(p.artwork)+'" alt="">':'';
  return '<article class="pws-person" data-background="'+background+'" data-frame="'+frame+
    '" data-new="'+isNew+'">'+painting+
    '<button type="button" class="pws-person__hit" data-pws="open-user" data-id="'+esc(p.id)+
    '" aria-label="Открыть профиль '+esc(p.nickname)+'"></button>'+
    '<div class="pws-person__top"><div class="pws-person__avatar">'+avatar(p)+'</div>'+
    '</div>'+
    '<div class="pws-person__name"><strong>'+esc(p.nickname)+'</strong><small>'+esc(subtitle)+'</small></div>'+
    (isNew?'<span class="pws-person__new">НОВОЕ</span>':'')+
    '<div class="pws-person__actions">'+actions+'</div></article>';
}
function person(p){
  return personRow(p,friendActions(p));
}
function listPeople(list,empty,newIds=[]){
  return list?.length?'<div class="pws-list">'+list.map(p=>
    personRow(p,friendActions(p),presenceLabel(p),newIds.includes(p.id))).join('')+'</div>':'<div class="pws-empty">'+empty+'</div>';
}
function orderFriends(friends){
  // Stable order throughout the current visit prevents buttons moving under a finger.
  if(!state.friendOrder.length){
    state.friendOrder=[...friends].sort((a,b)=>Number(!!b.online)-Number(!!a.online)||
      a.nickname.localeCompare(b.nickname,'ru')).map(p=>p.id);
  }
  const ranks=new Map(state.friendOrder.map((id,i)=>[id,i]));
  return [...friends].sort((a,b)=>(ranks.get(a.id)??(a.online?1e6:2e6))-
    (ranks.get(b.id)??(b.online?1e6:2e6))||a.nickname.localeCompare(b.nickname,'ru'));
}
const noticeStorageKey=account=>'pws-seen-notices:'+account;
function seenNotices(account){
  try{return JSON.parse(sessionStorage.getItem(noticeStorageKey(account))||'{}')}
  catch{return {}}
}
function rememberNotices(kind){
  const account=state.me?.profile?.id;if(!account)return;
  const seen=seenNotices(account);
  seen[kind]=kind==='incoming'?(state.me.incoming||[]).map(p=>p.id):
    (state.me.invites||[]).filter(i=>i.incoming&&i.status==='pending').map(i=>i.id);
  try{sessionStorage.setItem(noticeStorageKey(account),JSON.stringify(seen))}catch{}
  if(kind==='incoming')state.unseenIncoming=[];
  else state.unseenInvites=[];
}
function refreshUnseen(data){
  const seen=seenNotices(data.profile.id);
  state.unseenIncoming=(data.incoming||[]).filter(p=>!(seen.incoming||[]).includes(p.id)).map(p=>p.id);
  state.unseenInvites=(data.invites||[]).filter(i=>i.incoming&&i.status==='pending'&&
    !(seen.invites||[]).includes(i.id)).map(i=>i.id);
}
const cloudBytes=value=>{
 const bytes=Math.max(0,Number(value)||0);
 if(bytes<1000)return bytes+' Б';
 const small=bytes<1_000_000;
 return (bytes/(small?1000:1_000_000)).toLocaleString('ru-RU',{maximumFractionDigits:small?1:2})+(small?' КБ':' МБ');
};
const cloudAppLabel=app=>app==='folio'?'FOLIO':app==='zamazka'?'ЗАМАЗКА':app;
const cloudPlural=(value,one,few,many)=>{const n=Math.abs(Number(value)||0)%100,d=n%10;return value+' '+(n>=11&&n<=14?many:d===1?one:d>=2&&d<=4?few:many)};
function cloudPanel(){
 const data=state.cloud;
 const head='<div class="pws-cloud__heading"><div><span class="pws-cloud__kicker">ЛИЧНОЕ ХРАНИЛИЩЕ / POCKET CLOUD</span>'+
  '<h3 id="pws-cloud-heading">Место в облаке</h3></div>'+
  button('refresh-cloud',state.cloudLoading?'Обновление…':'↻ Обновить','quiet',state.cloudLoading?'disabled':'aria-label="Обновить статистику Pocket Cloud"')+'</div>';
 let body='';
 if(!data){
  body=state.cloudLoading?'<p class="pws-cloud__message" role="status">Сверяем сохранения с облаком…</p>':
   state.cloudError?'<p class="pws-cloud__message pws-cloud__message--error" role="alert">'+esc(state.cloudError)+'</p>':
   '<p class="pws-cloud__message">Данные облака ещё не загружены.</p>';
 }else{
  const cap=Math.max(1,data.maxBytes||16_000_000),used=Math.max(0,data.usedBytes||0),left=Math.max(0,data.freeBytes??cap-used);
  const percentage=Math.min(100,used/cap*100);
  const apps=Array.isArray(data.byApp)?data.byApp:[];
  const items=Array.isArray(data.items)?data.items:[];
  const usedCount=Number(data.usedItems)||0,maxCount=Number(data.maxItems)||160;
  const parts=apps.map(x=>'<span class="pws-cloud__fill pws-cloud__fill--'+(x.app==='folio'?'folio':'zamazka')+
   '" style="width:'+Math.max(0,Math.min(100,Number(x.usedBytes||0)/cap*100))+'%" title="'+esc(cloudAppLabel(x.app))+'"></span>').join('');
  body='<div class="pws-cloud__totals"><div><span>Занято</span><strong>'+cloudBytes(used)+'</strong></div>'+
   '<div><span>Свободно</span><strong>'+cloudBytes(left)+'</strong></div>'+
   '<div class="pws-cloud__capacity"><span>Всего</span><strong>'+cloudBytes(cap)+'</strong></div></div>'+
   '<div class="pws-cloud__meter" role="progressbar" aria-label="Использовано облачное пространство" aria-valuemin="0" aria-valuemax="'+cap+'" aria-valuenow="'+used+'">'+parts+'</div>'+
   '<div class="pws-cloud__under"><span>'+(percentage>0&&percentage<0.1?'Менее 0,1%':percentage.toLocaleString('ru-RU',{maximumFractionDigits:1})+'%')+' занято</span>'+
   '<span>'+cloudPlural(usedCount,'сохранение','сохранения','сохранений')+' из '+maxCount+'</span></div>'+
   '<div class="pws-cloud__breakdown">'+apps.map(x=>
    '<div class="pws-cloud__category"><span class="pws-cloud__dot pws-cloud__dot--'+(x.app==='folio'?'folio':'zamazka')+'"></span>'+
    '<span class="pws-cloud__category-name">'+esc(cloudAppLabel(x.app))+'<small>'+cloudPlural(x.items,'объект','объекта','объектов')+'</small></span>'+
    '<strong>'+cloudBytes(x.usedBytes)+'</strong></div>').join('')+'</div>'+
   (items.length?'<details class="pws-cloud__details"><summary>Что занимает место · '+cloudPlural(items.length,'файл','файла','файлов')+'</summary>'+
    '<div class="pws-cloud__files">'+items.map(item=>'<div class="pws-cloud__file"><div><strong>'+esc(item.title||item.id||'Без названия')+
    '</strong><small>'+esc(cloudAppLabel(item.app))+'</small></div><span>'+cloudBytes(item.bytes)+'</span></div>').join('')+'</div></details>':
    '<p class="pws-cloud__empty">Пока пусто. Рисунки FOLIO и сохранения ЗАМАЗКИ появятся здесь после синхронизации.</p>')+
   '<p class="pws-cloud__limits">До '+cloudBytes(data.maxItemBytes||1_000_000)+' на объект · учитываются облачные данные, не локальные файлы'+
   (state.cloudUpdated?' · проверено '+new Date(state.cloudUpdated).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'')+'</p>'+
   (percentage>=90?'<p class="pws-cloud__warning">Облако почти заполнено. Новые сохранения могут не синхронизироваться.</p>':'');
 }
 if(state.cloudError&&data)body+='<p class="pws-cloud__message pws-cloud__message--error" role="alert">Не удалось обновить: '+esc(state.cloudError)+'. Показаны предыдущие данные.</p>';
 return '<section class="pws-cloud" aria-labelledby="pws-cloud-heading">'+head+body+'</section>';
}
function resetCloud(){
 state.cloudVersion++;state.cloud=null;state.cloudAccount=null;state.cloudLoading=false;state.cloudError='';state.cloudUpdated=0;
}
function renderCloud(){if(!state.edit&&state.tab==='profile')render()}
async function loadCloudUsage(){
 const account=state.me?.profile?.id;
 if(!account)return;
 if(state.cloudAccount!==account){resetCloud();state.cloudAccount=account}
 const version=++state.cloudVersion;
 state.cloudLoading=true;state.cloudError='';renderCloud();
 try{
  const response=await fetch('/pocket-cloud/usage',{credentials:'same-origin',cache:'no-store',headers:{'x-pw-expected-account':account}});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(response.status===401?'Сессия истекла. Войди в Pocket ID снова.':result.error==='account_changed'?'Аккаунт сменился. Открой профиль ещё раз.':'Облако недоступно. Проверь подключение и повтори запрос.');
  if(version!==state.cloudVersion||state.me?.profile?.id!==account)return;
  if(!Number.isFinite(result.usedBytes)||!Number.isFinite(result.maxBytes)||!Array.isArray(result.byApp)||!Array.isArray(result.items))throw Error('Некорректный ответ хранилища.');
  state.cloud=result;state.cloudUpdated=Date.now();
 }catch(error){
  if(version!==state.cloudVersion||state.me?.profile?.id!==account)return;
  state.cloudError=error.message||'Ошибка получения статистики.';
 }finally{
  if(version===state.cloudVersion){state.cloudLoading=false;renderCloud()}
 }
}
const maskotCategories=[
  ['animal','Зверь'],['hat','Голова'],['clothes','Одежда'],['face','Лицо'],['accessory','Плечо'],
  ['portrait','Рамка'],['background','Фон']
];
function paintingStudio(){
  return '<section class="pws-studio" aria-label="Редактор нарисованного фона">'+
    '<div class="pws-studio__header"><div><strong>Мой рисунок</strong></div>'+
    '<div class="pws-studio__header-actions">'+button('paint-cancel','Назад')+
    button('paint-done','Готово','primary')+'</div></div>'+
    '<div class="pws-studio__body"><div class="pws-studio__workspace"><canvas class="pws-studio-canvas" width="480" height="320" aria-label="Холст для рисования фона"></canvas></div>'+
    '<div class="pws-studio__controls"><div class="pws-studio__section-label">Цвет</div>'+
    '<div class="pws-studio__palette">'+colors.map(c=>'<button type="button" data-paint-color="'+c+
    '" style="--paint:'+c+'" aria-label="Цвет '+c+'"></button>').join('')+
    '<label class="pws-studio__custom" title="Свой цвет"><input data-paint-custom type="color" value="#325f75" aria-label="Выбрать свой цвет"><span>+</span></label></div>'+
    '<div class="pws-studio__section-label">Инструмент</div><div class="pws-studio__tools">'+
    '<button type="button" data-paint-tool="brush">Кисть</button>'+
    '<button type="button" data-paint-tool="eraser">Ластик</button></div>'+
    '<label class="pws-studio__size">Размер <input data-paint-size type="range" min="3" max="48" step="1" value="10">'+
    '<span data-paint-size-label>10</span></label>'+
    '<div class="pws-studio__history"><button type="button" data-paint-undo disabled>↶ Отменить</button>'+
    '<button type="button" data-paint-redo disabled>↷ Вернуть</button>'+
    '<button type="button" data-paint-clear>Очистить</button></div>'+
    '<div class="pws-studio__message" role="status" aria-live="polite"></div></div></div></section>';
}
function rewardCollection(unlocks,draft){
  const groups=collectProfileRewards(unlocks,state.catalog);
  const total=groups.reduce((sum,g)=>sum+g.total,0);
  const earned=groups.reduce((sum,g)=>sum+g.earned,0);
  const selected=groups.filter(g=>state.rewardGame==='all'||state.rewardGame===g.id);
  const hasCodeSource=selected.some(g=>g.id==='pocketworks');
  const mode=state.rewardView;
  const buttons=group=>group.rewards.filter(a=>
    mode==='owned'?a.earned:mode==='locked'?!a.earned:true);
  return '<section class="pws-collection" aria-label="Коллекция наград">'+
    '<div class="pws-collection__overview"><div><strong>'+earned+'<span> / '+total+'</span></strong>'+
    '<small>наград получено</small></div><div class="pws-collection__meter" role="progressbar" aria-label="Получено наград" aria-valuemin="0" aria-valuemax="'+total+'" aria-valuenow="'+earned+'"><span style="width:'+(total?Math.round(earned/total*100):0)+'%"></span></div></div>'+
    '<nav class="pws-collection__games" aria-label="Источник награды">'+
    '<button type="button" data-pws="reward-game" data-value="all" aria-pressed="'+(state.rewardGame==='all')+'">Все <small>'+earned+'/'+total+'</small></button>'+
    groups.map(g=>'<button type="button" data-pws="reward-game" data-value="'+esc(g.id)+'" aria-pressed="'+(state.rewardGame===g.id)+'">'+
      esc(g.name)+' <small>'+g.earned+'/'+g.total+'</small></button>').join('')+'</nav>'+
    '<div class="pws-collection__filters" aria-label="Статус наград">'+[
      ['all','Все'],['owned','Получены'],['locked','Не получены']
    ].map(([id,label])=>'<button type="button" data-pws="reward-view" data-value="'+id+'" aria-pressed="'+(mode===id)+'">'+label+'</button>').join('')+'</div>'+
    selected.map(g=>{
      const rewards=buttons(g);
      if(!rewards.length)return '';
      return '<section class="pws-collection__group" aria-label="'+esc(g.name)+'"><div class="pws-collection__heading"><strong>'+esc(g.name)+
        '</strong><span>'+g.earned+' из '+g.total+'</span></div><div class="pws-collection__entries">'+
      rewards.map(a=>{
        const equipped=a.earned&&rewardIsEquipped(a,draft);
        return '<article class="pws-collection__entry" data-owned="'+a.earned+'" data-tier="'+esc(a.tier)+'">'+
          '<div class="pws-collection__entry-head"><span class="pws-collection__status">'+(a.earned?'Получено':'Не получено')+
          '</span><span class="pws-collection__tier">'+esc(a.tier)+'</span></div>'+
          '<strong>'+esc(a.name)+'</strong>'+
          '<p>'+esc(a.detail)+'</p>'+
          '<div class="pws-collection__reward"><span>НАГРАДА</span><b>'+esc(a.reward)+'</b></div>'+
          (a.earned&&a.items.length?
            '<button type="button" data-pws="equip-achievement" data-value="'+esc(a.id)+'" aria-pressed="'+equipped+'"'+(equipped?' disabled':'')+'>'+
            (equipped?'Примерено':'Примерить на карточке')+'</button>':
            a.unknown?'<small class="pws-collection__unknown">Оформление этой награды ещё не зарегистрировано.</small>':'')+
          '</article>';
      }).join('')+'</div></section>';
    }).join('')+
    (!selected.some(g=>buttons(g).length)?'<div class="pws-empty">По этому фильтру наград пока нет.</div>':'')+
    (hasCodeSource?'<div class="pws-collection__redeem"><label for="pws-cosmetic-code">Есть код награды?</label>'+
      '<div class="pws-maskot-redeem__row"><input id="pws-cosmetic-code" type="text" maxlength="60" autocapitalize="characters" autocomplete="off" placeholder="Введите код">'+
      button('redeem','Активировать','primary')+'</div></div>':'')+
    '</section>';
}

function editor(){
  if(state.paintOpen)return paintingStudio();
  const d=state.draft,m=d.maskot||safeMascot(null),unlocks=state.me?.profile?.unlocked||[];
  const secretHats=[...(unlocks.includes('astronaut')?[['helmet','Шлем космонавта']]:[]),
    ...(unlocks.includes('wedding')?[['veil','Фата']]:[]),
    ...(unlocks.includes('knight')?[['bascinet','Бацинет стража']]:[]),
     ...(unlocks.includes('seoul-artist')?[['stage-pin','Лунная шпилька артиста']]:[]),
    ...(unlocks.includes('zamazka.shared-canvas')?[['brush','Кисть за ухом']]:[]),
     ...(unlocks.includes('zamazka.eagle-eye')?[['seer-diadem','Диадема проницательности']]:[])];
  const secretClothes=[...(unlocks.includes('astronaut')?[['spacesuit','Скафандр']]:[]),
    ...(unlocks.includes('wedding')?[['wedding','Свадебный наряд']]:[]),
    ...(unlocks.includes('herald')?[['tabard','Накидка герольда']]:[]),
    ...(unlocks.includes('groom')?[['groom','Свадебный мужской костюм']]:[]),
     ...(unlocks.includes('seoul-artist')?[['stage-hanbok','Сценический ханбок']]:[]),
    ...(unlocks.includes('zamazka.maestro')?[['restorer','Мантия великого реставратора']]:[])];
  const secretAccessories=[...mascotAccessories,...(unlocks.includes('dragon-keeper')?[['shoulder-dragon','Изумрудный дракон на плече']]:[]),
     ...(unlocks.includes('zamazka.ghost-brush')?[['spectral-quill','Призрачное перо']]:[])];
  const rewardFace=[...mascotFaces,...(unlocks.includes('zamazka.sharp-eye')?[['monocle','Монокль']]:[])];
  const retiredTitles={'Призрачная кисть':'zamazka.ghost-brush','Всевидящий':'zamazka.eagle-eye'};
  const rewardTitles=mascotTitles.filter(t=>(!zamazkaAchievements.some(a=>a.slot==='title'&&a.item===t)||
    zamazkaAchievements.some(a=>a.slot==='title'&&a.item===t&&unlocks.includes(a.id)))&&
    (!retiredTitles[t]||unlocks.includes(retiredTitles[t])));
  const rewardBg=backgrounds.filter(([id])=>id!=='gallery'||unlocks.includes('zamazka.five-works'));
  const rewardFrames=portraitFrames.filter(([id])=>id!=='worn-gilt'||unlocks.includes('zamazka.perfect-forgery'));
  const category=state.editorSection==='data'?'account':state.editorTab;
  const options=(rows,field)=>'<div class="pws-maskot-options">'+rows.map(([id,label])=>
    '<button type="button" data-pws="maskot-item" data-field="'+field+'" data-value="'+id+
    '" aria-pressed="'+(m[field]===id)+'"><span class="pws-maskot-option__art">'+
    mascotSvg({...m,[field]:id},{unlocks,size:92})+'</span><span>'+esc(label)+'</span></button>').join('')+'</div>';
  const frameOptions='<div class="pws-portrait-options">'+rewardFrames.map(([id,label])=>
    '<button type="button" data-pws="portrait-frame" data-value="'+id+
    '" aria-pressed="'+(d.portraitFrame===id)+'"><span class="pws-portrait-sample" data-portrait-frame="'+id+
    '">'+mascotSvg(m,{unlocks,size:80})+'</span><span>'+esc(label)+'</span></button>').join('')+'</div>';
  const presetControls='<div class="pws-field"><label>Цветовая тема карточки</label><div class="pws-options">'+rewardBg.map(t=>
      '<button type="button" class="pws-option pws-option--theme" style="--sample:'+t[2]+
      '" title="'+t[1]+'" aria-label="'+t[1]+'" data-pws="background" data-value="'+t[0]+
      '" aria-pressed="'+(d.background===t[0])+'"></button>').join('')+'</div></div>'+
      '<div class="pws-field"><label>Внешняя рамка карточки</label><div class="pws-options">'+frames.map(t=>
      '<button type="button" class="pws-option" data-pws="frame" data-value="'+t[0]+
      '" aria-pressed="'+(d.frame===t[0])+'">'+t[1]+'</button>').join('')+'</div></div>';
  const backgroundControls='<div class="pws-background-choices"><button type="button" data-pws="background-mode" data-value="preset" aria-pressed="'+(d.backgroundMode!=='drawing')+'">Готовый фон</button>'+
    '<button type="button" data-pws="background-mode" data-value="drawing" aria-pressed="'+(d.backgroundMode==='drawing')+'">Мой рисунок</button></div>'+
    (d.backgroundMode==='drawing'?
    '<div class="pws-drawing-choice"><div class="pws-drawing-choice__thumbnail">'+
      (d.artwork?'<img alt="Мой рисунок" src="'+esc(d.artwork)+'">':'<span>Пустой холст</span>')+
      '</div><div>'+button('paint-open',d.artwork?'Редактировать рисунок':'Нарисовать фон','primary')+
      '<p>Рисунок заменяет готовую цветовую тему, а не смешивается с ней.</p></div></div>':
    presetControls);
  const appearance=category==='animal'?options(mascotAnimals,'animal'):
    category==='hat'?options([...mascotHats,...secretHats],'hat'):
    category==='clothes'?options([...mascotClothes,...secretClothes],'clothes'):
    category==='face'?options(rewardFace,'face'):
    category==='accessory'?options(secretAccessories,'accessory'):
    category==='portrait'?frameOptions:
    category==='background'?backgroundControls:
      '<div class="pws-field"><label for="pws-nickname">Никнейм</label>'+
      '<input id="pws-nickname" type="text" maxlength="20" minlength="3" value="'+esc(d.nickname)+'"></div>'+
      '<div class="pws-field"><label for="pws-title">Титул</label><select id="pws-title">'+rewardTitles.map(t=>
      '<option value="'+esc(t)+'" '+(d.title===t?'selected':'')+'>'+esc(t||'Без титула')+'</option>').join('')+'</select></div>'+
      '<div class="pws-field"><label for="pws-favorite">Любимая игра</label><select id="pws-favorite">'+
      '<option value="">Не выбрана</option>'+state.catalog.map(g=>
      '<option value="'+esc(g.slug)+'" '+(g.slug===d.favoriteGame?'selected':'')+'>'+esc(g.name)+'</option>').join('')+
      '</select></div>';
  return '<div class="pws-maskot-editor"><div class="pws-maskot-editor__preview">'+
    card({...state.me.profile,...d})+
    '<div class="pws-maskot-editor__actions">'+button('cancel-edit','Отмена')+
    button('save-profile',state.busy?'Сохранение…':'Сохранить','primary')+'</div></div>'+
    '<div class="pws-maskot-editor__work"><nav class="pws-editor-modes" aria-label="Раздел редактора">'+
    [['appearance','Оформление'],['collection','Коллекция'],['data','Данные']].map(([id,label])=>
      '<button type="button" data-pws="editor-mode" data-value="'+id+'" aria-pressed="'+(state.editorSection===id)+'">'+label+'</button>').join('')+'</nav>'+
    (state.editorSection==='appearance'?'<div class="pws-maskot-tabs">'+maskotCategories.map(([id,label])=>
      '<button type="button" data-pws="maskot-tab" data-value="'+id+
      '" aria-pressed="'+(category===id)+'">'+label+'</button>').join('')+'</div>':'')+
    '<div class="pws-maskot-editor__picker">'+(state.editorSection==='collection'?rewardCollection(unlocks,d):appearance)+'</div></div></div>'+
    (state.reward?'<div class="pws-reward-shade"><div class="pws-reward" role="dialog" aria-label="Косметика получена">'+
      '<div class="pws-reward__gift"><div class="pws-reward__lid"></div><div class="pws-reward__bow"></div></div>'+
      '<h3>Новая косметика!</h3><p>'+esc(({astronaut:'Шлем и скафандр',wedding:'Фата и свадебный наряд',knight:'Бацинет стража',herald:'Гербовая накидка герольда',groom:'Свадебный мужской костюм','seoul-artist':'Лунная шпилька и сценический ханбок','dragon-keeper':'Изумрудный дракон на плече'})[state.reward]||'Награда получена')+
      '</p>'+button('reward-close','Примерить','primary')+'</div></div>':'');
}
function profilePanel(){
  const p=state.me?.profile;
  if(!p)return '<div class="pws-empty">Создай Pocket ID, чтобы добавить друзей.</div>'+
    '<div class="pws-actions">'+button('login','Открыть Pocket ID','primary')+'</div>';
  if(state.edit)return editor();
  return '<h2>Профиль</h2><div class="pws-profile-layout"><section>'+card(p)+
    '<div class="pws-actions">'+button('edit','Оформить карточку','primary')+button('collection','Коллекция наград')+button('edit-data','Данные профиля')+button('privacy','Приватность и вход')+
    button('copy-id','Скопировать ID','quiet')+'</div></section>'+
    '</div>'+
    '<details class="pws-fold"><summary>Активировать код награды</summary><div class="pws-fold__body"><div class="pws-maskot-redeem__row"><input id="pws-cosmetic-code" placeholder="Код награды" maxlength="60">'+button('redeem','Получить')+'</div></div></details>'+
    '<details class="pws-fold pws-cloud-fold" data-pws-fold="cloud"'+(state.expanded.cloud?' open':'')+'>'+
    '<summary>Облако'+(state.cloud?' · '+cloudBytes(state.cloud.usedBytes)+' / '+cloudBytes(state.cloud.maxBytes):'')+'</summary>'+
    cloudPanel()+'</details>';
}
function privacyPanel(){
  if(!state.me)return profilePanel();
  const p=state.draft||state.me.profile;
  return button('profile-back','← К профилю')+'<h2>Приватность и вход</h2><section class="pws-privacy">'+
    '<h3>Кто видит меня</h3>'+[
      ['discoverable','Показывать профиль в поиске','pws-discoverable'],
      ['presenceVisible','Показывать онлайн','pws-presence'],
      ['allowInvites','Разрешать приглашения','pws-invites']
    ].map(([key,label,id])=>'<label class="pws-check"><input type="checkbox" id="'+id+'" '+(p[key]?'checked':'')+'> '+label+'</label>').join('')+
    '<div class="pws-actions">'+button('save-privacy','Сохранить приватность','primary')+'</div></section>'+
    '<section id="pws-account-host" class="pws-account-host"></section>';
}
const draftFields=['nickname','background','frame','backgroundMode','portraitFrame','artwork','maskot','title','favoriteGame','discoverable','presenceVisible','allowInvites'];
const draftSignature=p=>JSON.stringify(draftFields.map(k=>p?.[k]??null));
function beginDraft(){
  if(state.draft)return;
  state.draft={...state.me.profile,backgroundMode:state.me.profile.backgroundMode||'preset',
    portraitFrame:state.me.profile.portraitFrame||'wood',maskot:safeMascot(state.me.profile.maskot,state.me.profile.unlocked)};
  state.draftBase=draftSignature(state.draft);
}
function capturePainting(){
  if(state.paintOpen&&paintSession?.hasChanges()){
    const art=paintSession.commit();if(!art)return false;
    state.draft.artwork=art;state.draft.backgroundMode='drawing';
  }
  state.paintOpen=false;return true;
}
function hasDraft(){return state.draft&&draftSignature(state.draft)!==state.draftBase;}
async function beforeIdentityLeave(){
  if(!hasDraft())return true;
  const choice=await askUnsaved();
  if(choice==='cancel')return false;
  if(choice==='save')return await saveUnifiedProfile();
  state.draft=null;state.draftBase=null;render();return true;
}
async function leaveDraft(close=false){
  if(state.busy||state.exiting||!capturePainting())return false;
  state.exiting=true;
  if(hasDraft()){
    const choice=await askUnsaved();
    if(choice==='cancel'){state.exiting=false;render();return false;}
    if(choice==='save'){if(!await saveUnifiedProfile()){state.exiting=false;return false;}}
    else {state.draft=null;state.draftBase=null;}
  }else {state.draft=null;state.draftBase=null;}
  state.edit=false;state.exiting=false;
  if(close)dialog.close();else {state.tab='profile';render();}
  return true;
}
function otherPanel(){
  const p=state.other;
  if(!p)return button('back','← К друзьям')+'<div class="pws-empty">Не удалось получить профиль игрока.</div>';
  const status=p.friendship;
  const controls=status==='none'?button('send-request','Добавить в друзья','primary'):
    status==='outgoing'?button('cancel-friend','Отменить заявку'):
    status==='incoming'?button('accept-friend','Принять','primary')+button('decline-friend','Отклонить'):
    status==='friends'?'':
    p.blockedByMe?button('unblock-friend','Разблокировать'):'';
  const saved=(state.me?.party||[]).includes(p.id);
  const companyButton=status==='friends'?
    saved?button('remove-party','Убрать из компании','quiet'):
    (state.me?.party||[]).length<3?button('add-party','В компанию','quiet'):'':'';
  const join= status==='friends'?joinButton(p):'';
  return button('back','← Назад')+'<h2 style="margin-top:15px">'+esc(p.nickname)+'</h2>'+card(p)+
    (p.activity?'<p class="pws-playing">'+esc(presenceLabel(p))+'</p>':'')+
    '<div class="pws-actions">'+join+companyButton+controls+
    (p.blockedByMe?'':'<details class="pws-more"><summary>Ещё ···</summary><div>'+ (status==='friends'?button('remove-friend','Удалить из друзей'):'' )+button('block-friend','Заблокировать','danger')+'</div></details>')+'</div>';
}
function partyPanel(){
  const members=state.me?.party||[],friends=state.me?.friends||[];
  return '<details class="pws-fold pws-company" data-pws-fold="party"'+(state.expanded.party?' open':'')+'>'+
    '<summary>Моя компания · '+(members.length+1)+'/4</summary>'+
    '<div class="pws-fold__body"><p class="pws-muted">Сохрани до трёх друзей, чтобы приглашать всех из игровой комнаты.</p>'+
    (members.length?'<div class="pws-company__members">'+members.map(id=>{
      const p=friends.find(x=>x.id===id);
      return p?'<button type="button" class="pws-company__member" data-pws="open-user" data-id="'+esc(p.id)+'">'+
        '<span class="pws-company__avatar">'+avatar(p)+'</span><span>'+esc(p.nickname)+'</span></button>':'';
    }).join('')+'</div>':
    '<div class="pws-muted">Открой профиль друга и нажми «В компанию».</div>')+
    '</div></details>';
}
function friendsPanel(){
  if(!state.me)return profilePanel();
  const m=state.me, fold=(key,label,items)=>{
    if(!items?.length)return '';
    return '<details class="pws-fold" data-pws-fold="'+key+'"'+(state.expanded[key]?' open':'')+'>'+
      '<summary>'+label+' · '+items.length+'</summary><div class="pws-fold__body">'+
      listPeople(items,'',key==='incoming'?state.unseenIncoming:[])+'</div></details>';
  };
  return '<h2>Друзья</h2><div class="pws-field">'+
    '<input id="pws-search" type="search" aria-label="Поиск игрока" maxlength="40" autocomplete="off" spellcheck="false" placeholder="Найти игрока по нику или ID" value="'+esc(state.query)+'"></div>'+
    '<div id="pws-results" aria-live="polite">'+searchResults()+'</div>'+
    (m.incoming.length?fold('incoming','Заявки',m.incoming):'')+
    '<h3>Мои друзья · '+m.friends.length+' <span class="pws-online-count">В сети: '+
      m.friends.filter(p=>p.online).length+'</span></h3>'+
    listPeople(orderFriends(m.friends),'Пока нет друзей. Найди игрока по нику.')+
    partyPanel()+
    fold('outgoing','Отправленные заявки',m.outgoing)+
    fold('blocked','Заблокированные',m.blocked||[]);
}
function searchResults(){
  if(!state.query.trim())return '';
  if(state.query.trim().length<2)return '<div class="pws-muted">Введите хотя бы 2 символа.</div>';
  if(state.searchLoading)return '<div class="pws-search-status">Ищем игроков…</div>';
  if(state.searchError)return '<div class="pws-search-status pws-search-status--error">'+esc(state.searchError)+'</div>';
  return state.results.length?'<h3>Результаты поиска</h3>'+listPeople(state.results,'Игроки не найдены.'):'<div class="pws-muted">Нет совпадений.</div>';
}
function invitesPanel(){
  if(!state.me)return profilePanel();
  const invites=state.me.invites.filter(i=>i.status==='pending');
  return '<h2>Игровые приглашения</h2>'+
    (invites.length?'<div class="pws-list">'+invites.map(i=>{
      const peerId=i.incoming?i.fromId:i.toId;
      // Invitations are sent between friends. Reuse the actual profile rather than
      // substituting an arrow or an initial for their chosen portrait.
      const peer=state.me.friends.find(p=>p.id===peerId)||
        {id:peerId,nickname:i.incoming?i.fromName:i.toName,avatar:'clay'};
      const actions=i.incoming?
        button('accept-invite',['zamazka','blind-pals','lipki'].includes(i.gameId)?'Войти':'Открыть игру','primary','data-id="'+esc(i.id)+'"')+
        button('decline-invite','Отклонить','quiet','data-id="'+esc(i.id)+'"'):
        button('cancel-invite','Отозвать','quiet','data-id="'+esc(i.id)+'"');
      const validUntil=i.expiresAt?' · до '+new Date(i.expiresAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'';
      return personRow(peer,actions,gameLabel(i.gameId)+' · '+
        (i.incoming?'приглашает тебя':'ожидает ответа')+validUntil,
        i.incoming&&state.unseenInvites.includes(i.id));
    }).join('')+'</div>':'<div class="pws-empty">Нет ожидающих приглашений.</div>');
}
function invitePanel(){
  if(!state.me)return profilePanel();
  return '<h2>Позвать в '+esc(gameLabel(state.game))+'</h2><p class="pws-muted">Приглашение получит друг, который сможет войти в эту комнату одним нажатием.</p>'+
    ((state.me.party||[]).length?'<div class="pws-company__invite">'+
      button('invite-party','Пригласить компанию · '+state.me.party.length,'primary')+
      '</div>':'')+
    '<div class="pws-list">'+(state.me.friends.filter(p=>p.allowInvites).map(p=>
      personRow(p,button('send-invite','Пригласить','primary','data-id="'+esc(p.id)+'"'))
    ).join('')||
    '<div class="pws-empty">Нет друзей, которым можно отправить приглашение. Добавь их в разделе «Друзья».</div>')+'</div>';
}
function refreshTabBadges(){
  if(!dialog?.open)return;
  q('#pws-tabs',dialog).hidden=!state.me;
  for(const t of dialog.querySelectorAll('[data-pws-tab]')){
    t.setAttribute('aria-selected',String(t.dataset.pwsTab===state.tab));
    const count=t.dataset.pwsTab==='friends'?(state.me?.incoming||[]).length:
      t.dataset.pwsTab==='invites'?(state.me?.invites||[]).filter(i=>i.incoming&&i.status==='pending').length:0;
    let dot=t.querySelector('.pws-tab__badge');
    if(count&&!dot){dot=document.createElement('span');dot.className='pws-tab__badge';t.append(dot);}
    if(dot){dot.textContent=String(Math.min(count,99));dot.hidden=!count;}
  }
}
function render(){
  if(!dialog?.open)return;
  refreshTabBadges();
  window.PocketID?.unmountAccount?.();
  content.innerHTML=errorMarkup()+(state.loading?'<div class="pws-loading">Загрузка…</div>':
    state.tab==='profile'?profilePanel():
    state.tab==='privacy'?privacyPanel():
    state.tab==='friends'?friendsPanel():
    state.tab==='invites'?invitesPanel():
    state.tab==='invite'?invitePanel():otherPanel());
  if(state.tab==='privacy'){window.PocketID?.mountAccount?.(q('#pws-account-host',content),{beforeLeave:beforeIdentityLeave});}
  if(state.edit&&state.tab==='profile'&&state.paintOpen){
    paintSession=mountCardCanvas(content,{initial:state.draft.artwork,
      onError:message=>{const label=q('.pws-studio__message',content);if(label)label.textContent=message;}});
  }else paintSession=null;
}
function updateNotification(count){
  const invites=(state.me?.invites||[]).filter(i=>i.incoming&&i.status==='pending').length;
  const requests=(state.me?.incoming||[]).length;
  const notificationKey=JSON.stringify([count,invites,requests]);
  if(notificationKey!==lastNotificationKey){
    lastNotificationKey=notificationKey;
    document.dispatchEvent(new CustomEvent('pocket-social:notifications',{detail:{count,invites,requests}}));
  }
  if(!entry)return;
  let badge=q('.pws-entry__count',entry);
  if(!badge){
    badge=document.createElement('span');
    badge.className='pws-entry__count';
    entry.append(badge);
  }
  badge.textContent=String(Math.min(count,99));badge.hidden=!count;
  entry.title=count?count+' новых запросов и приглашений':'Pocket ID · Профиль и друзья';
  entry.setAttribute('aria-label',count?('Pocket ID: '+count+' новых уведомлений'):'Pocket ID: Профиль и друзья');
}
async function reload(rerender=true){
  const requestVersion=++reloadVersion;
  const data=await api('me');
  if(requestVersion!==reloadVersion)return false;
  // Ignore an in-flight response from a previous account after sign-out/switch.
  const currentAccount=window.PocketID?.getUser?.();
  if(q('#pocket-id-trigger')&&(!currentAccount?.complete||data.profile.id!==currentAccount.id)){
    state.me=null;state.draft=null;state.draftBase=null;state.edit=false;lastPortraitKey='';resetCloud();updateNotification(0);
    if(rerender)render();
    return false;
  }
  if(state.cloudAccount&&state.cloudAccount!==data.profile.id)resetCloud();
  const accountChanged=state.me?.profile?.id!==data.profile.id;
  if(accountChanged){state.friendOrder=[];liveRevision=null;state.draft=null;state.draftBase=null;state.edit=false;}
  state.me=data;refreshUnseen(data);updateHomeActivity();
  const portraitKey=JSON.stringify([data.profile.id,data.profile.avatar,data.profile.artwork,data.profile.maskot,data.profile.unlocked]);
  // Polling must not replace the nav avatar DOM every two seconds.
  if(portraitKey!==lastPortraitKey){
    const accountButton=q('#pocket-id-trigger');
    if(accountButton && data.profile?.maskot){
      accountButton.innerHTML='<span class="pw-social-maskot-nav">'+mascotSvg(data.profile.maskot,{unlocks:data.profile.unlocked||[]})+'</span>';
    } else if(accountButton && data.profile?.artwork){
      accountButton.innerHTML='<img class="pw-social-personal-avatar" src="'+esc(data.profile.artwork)+'" alt="">';
    } else if(accountButton?.querySelector('.pw-social-personal-avatar,.pw-social-maskot-nav')){
      const fallback=q('#pocket-id-active-avatar .pw-id-avatar')?.outerHTML;
      accountButton.innerHTML=fallback?fallback.replace('pw-id-avatar','pw-id-nav-avatar'):
        '<span class="pw-id-nav-glyph" aria-hidden="true">◎</span>';
    }
    lastPortraitKey=portraitKey;
    document.dispatchEvent(new CustomEvent('pocket-social:portrait',{detail:{accountId:data.profile.id,artwork:data.profile.artwork||'',maskot:data.profile.maskot||null}}));
  }
  const pending=(data.invites||[]).filter(i=>i.incoming&&i.status==='pending').length;
  const requests=(data.incoming||[]).length;
  updateNotification(pending+requests);
  refreshTabBadges();
  if(rerender)render();
  return true;
}
// Track user-visible data, not request timestamps or heartbeat activity.
function updateHomeActivity(){
  const home=q('#deck-home');
  if(!home)return;
  let quick=q('#pws-home-activity',home);
  const online=(state.me?.friends||[]).filter(p=>p.online||p.activity);
  const key=JSON.stringify([state.me?.profile?.id,online.map(p=>[p.id,p.nickname,p.avatar,p.maskot,p.artwork,p.activity?.gameId])]);
  if(key===lastHomeKey&&quick)return;
  lastHomeKey=key;
  if(!online.length){quick?.remove();return}
  if(!quick){
    quick=document.createElement('button');quick.id='pws-home-activity';quick.type='button';
    quick.className='pws-home-activity';quick.setAttribute('aria-label','Друзья в сети');
    const account=q('#deck-account-spotlight',home);
    account?.insertAdjacentElement('afterend',quick);
  }
  quick.innerHTML='<span class="pws-home-activity__faces">'+online.slice(0,3).map(p=>
    '<span>'+avatar(p)+'</span>').join('')+'</span><span><strong>'+online.length+
    ' '+(online.length===1?'друг в сети':online.length<5?'друга в сети':'друзей в сети')+
    '</strong><small>Посмотреть друзей и присоединиться</small></span><span aria-hidden="true">↗</span>';
}
function visibleSocialSignature(data,tab){
  if(!data)return 'signed-out';
  return JSON.stringify(tab==='profile'?[data.profile]:
    tab==='other'?[data.profile?.id,state.other]:
    [data.profile?.id,data.friends,data.incoming,data.outgoing,data.blocked,data.invites,data.party]);
}
function updateConnectionStatus(offline){
  state.syncOffline=offline;
  const node=q('#pws-connection',dialog);
  if(node){node.hidden=!offline;node.textContent=offline?'Нет соединения · показаны последние данные':'';}
}
function renderLiveChanges(){
  const y=content.scrollTop,active=document.activeElement;
  const searchFocused=active?.id==='pws-search';
  const start=searchFocused?active.selectionStart:null;
  const end=searchFocused?active.selectionEnd:null;
  const focusedAction=content.contains(active)?active?.dataset?.pws:null;
  const focusedId=content.contains(active)?active?.dataset?.id:null;
  render();
  content.scrollTop=y;
  if(searchFocused){
    const field=q('#pws-search',dialog);
    if(field){
      field.focus({preventScroll:true});
      if(start!==null&&end!==null)field.setSelectionRange(start,end);
    }
  }else if(focusedAction){
    const next=[...content.querySelectorAll('[data-pws]')].find(node=>
      node.dataset.pws===focusedAction&&node.dataset.id===focusedId);
    next?.focus({preventScroll:true});
  }
}
async function pollOpenSocial(){
  if(!dialog?.open||!state.me||document.hidden||state.busy||state.loading||livePollBusy)return;
  if(!navigator.onLine){updateConnectionStatus(true);return;}
  livePollBusy=true;
  const tab=state.tab,before=visibleSocialSignature(state.me,tab),peerId=state.other?.id;
  try{
    const sync=await api('sync');
    updateConnectionStatus(false);
    if(!dialog.open||state.tab!==tab)return;
    if(sync.revision!==liveRevision){
      const applied=await reload(false);
      if(!applied)return;
      liveRevision=sync.revision;
      if(tab==='other'&&peerId===state.other?.id){
        try{
          const peer=(await api('user?id='+encodeURIComponent(peerId))).profile;
          if(state.tab==='other'&&state.other?.id===peerId)state.other=peer;
        }catch{} // Keep the last profile if a transient read fails.
      }
      if(!state.busy&&!state.loading&&!state.edit&&tab!=='privacy'&&tab===state.tab&&
          before!==visibleSocialSignature(state.me,tab))renderLiveChanges();
    }
    if(Date.now()-lastCatalogCheck>60000){
      lastCatalogCheck=Date.now();
      void loadCatalog();
    }
  }catch{updateConnectionStatus(true)}
  finally{livePollBusy=false}
}
function startLivePolling(){
  if(!livePollClock)livePollClock=setInterval(()=>{void pollOpenSocial()},2000);
}

async function loadCatalog(){
  try{
    const r=await fetch('/apps.json',{cache:'no-store'});
    if(r.ok){
      const apps=await r.json();
      const list=Array.isArray(apps)?apps.filter(x=>x&&x.slug&&x.name).map(x=>({slug:x.slug,name:x.name})).sort((a,b)=>a.name.localeCompare(b.name)):[];
      const changed=JSON.stringify(list)!==JSON.stringify(state.catalog);
      state.catalog=list;
      if(changed&&dialog?.open&&state.edit&&state.tab==='profile'){
        const select=q('#pws-favorite',dialog);
        if(select){
          const selected=select.value;
          select.innerHTML='<option value="">Не выбрана</option>'+list.map(g=>
            '<option value="'+esc(g.slug)+'">'+esc(g.name)+'</option>').join('');
          select.value=selected;
        }
      }
    }
  }catch{}
}
function resetNotice(){state.notice='';state.error='';state.confirm=null}
async function open(room='',editNow=false,gameId='zamazka'){
  state.game=/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(gameId)?gameId:'zamazka';
  if(!dialog.open)dialog.showModal();
  startLivePolling();liveRevision=null;state.friendOrder=[];state.otherReturn=null;
  state.query='';state.results=[];state.searchVersion++;state.searchLoading=false;state.searchError='';
  state.room=room||'';state.tab=room?'invite':'profile';state.edit=false;state.other=null;
  state.loading=true;resetNotice();render();
  try{await Promise.all([reload(false),loadCatalog()]);updateConnectionStatus(false);lastCatalogCheck=Date.now()}
  catch(e){state.me=null;state.error=e.message;updateConnectionStatus(e.message===errors.network||!navigator.onLine)}
  finally{state.loading=false}
  if(state.me&&editNow){
    state.tab='profile';state.edit=true;beginDraft();
    state.editorSection='appearance';state.editorTab='animal';state.rewardGame='all';state.rewardView='all';state.artHistory=[state.draft.artwork];resetNotice();
  }else if(state.me&&!room){
    const incoming=(state.me.invites||[]).some(i=>i.incoming&&i.status==='pending');
    if(incoming)state.tab='invites';
    else if((state.me.incoming||[]).length)state.tab='friends';
  }
  render();
  if(state.me&&state.tab==='profile'&&!state.edit)void loadCloudUsage();
}
async function showUser(id){
  if(!id)return;
  state.otherReturn={tab:state.tab,scroll:content.scrollTop};
  state.tab='other';state.other=null;state.loading=true;resetNotice();render();content.scrollTop=0;
  try{state.other=(await api('user?id='+encodeURIComponent(id))).profile}
  catch(e){state.error=e.message}
  finally{state.loading=false;render();content.scrollTop=0}
}
function returnFromUser(){
  const previous=state.otherReturn||{tab:'friends',scroll:0};
  state.tab=previous.tab;state.other=null;state.otherReturn=null;resetNotice();render();
  content.scrollTop=previous.scroll;
}
async function search(){
  const query=state.query.trim(),generation=state.searchVersion;
  if(query.length<2){state.results=[];state.searchLoading=false;state.searchError='';return}
  try{
    const data=/^[0-9a-f-]{36}$/i.test(query)?
      await api('user?id='+encodeURIComponent(query)):
      await api('search?q='+encodeURIComponent(query));
    if(generation!==state.searchVersion||state.tab!=='friends')return;
    state.results=data.profile?[data.profile]:(data.users||[]);
  }catch(e){
    if(generation!==state.searchVersion||state.tab!=='friends')return;
    state.results=[];state.searchError=e.message||'Поиск недоступен.';
  }finally{
    if(generation===state.searchVersion){
      state.searchLoading=false;
      const node=q('#pws-results',dialog);
      if(node)node.innerHTML=searchResults();
    }
  }
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
      backgroundMode:draft.backgroundMode||'preset',portraitFrame:draft.portraitFrame||'wood',
      artwork:draft.artwork,maskot:draft.maskot,title:draft.title||'',favoriteGame:draft.favoriteGame,
      discoverable:draft.discoverable,presenceVisible:draft.presenceVisible,
      allowInvites:draft.allowInvites});
    await reload(false);
    state.edit=false;state.draft=null;state.draftBase=null;state.notice='Профиль сохранён.';
    document.dispatchEvent(new CustomEvent('pocket-social:profile-updated',{detail:{accountId:state.me?.profile?.id}}));
  }catch(error){
    // The nickname can be saved before an appearance request fails; retry is safe.
    state.error=error.message+' Если никнейм уже изменился, повторное сохранение завершит настройку.';
  }finally{state.busy=false;render()}
  return !state.draft;
}
async function mutate(path,body,{tab,stay=false}={}){
  if(state.busy)return;
  state.busy=true;resetNotice();liveRevision=null;
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
function install(){
  if(!document.body||dialog)return;
  if(!document.querySelector('link[data-shell-dialogs]')){const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./shell-dialogs.css',import.meta.url).href;css.dataset.shellDialogs='';document.head.append(css);}
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
    '<div class="pws-connection" id="pws-connection" role="status" hidden></div>'+
    '<div class="pws-content" id="pws-content"></div>'+
    '<footer class="pws-mobile-exit">'+button('close','Закрыть меню')+'</footer></div>';
  document.body.append(dialog);content=q('#pws-content',dialog);
  dialog.addEventListener('click',e=>{if(e.target===dialog)void leaveDraft(true)});
  dialog.addEventListener('cancel',e=>{e.preventDefault();void leaveDraft(true)});
  dialog.addEventListener('close',()=>{
    window.PocketID?.unmountAccount?.();
    clearInterval(livePollClock);livePollClock=0;clearTimeout(searchClock);
    state.searchVersion++;updateConnectionStatus(false);
  });
  dialog.addEventListener('change',e=>{
    if(!state.draft)return;
    const t=e.target;
    if(t.id==='pws-favorite')state.draft.favoriteGame=t.value;
    if(t.id==='pws-discoverable')state.draft.discoverable=t.checked;
    if(t.id==='pws-presence')state.draft.presenceVisible=t.checked;
    if(t.id==='pws-invites')state.draft.allowInvites=t.checked;
    if(t.id==='pws-nickname')state.draft.nickname=t.value;
    if(t.id==='pws-title')state.draft.title=t.value;
  });
  dialog.addEventListener('toggle',event=>{
    const key=event.target?.dataset?.pwsFold;
    if(key&&Object.hasOwn(state.expanded,key))state.expanded[key]=event.target.open;
  },true);
  dialog.addEventListener('input',e=>{
    if(e.target.id==='pws-nickname'&&state.draft){state.draft.nickname=e.target.value;return}
    if(e.target.id!=='pws-search')return;
    state.query=e.target.value;state.searchVersion++;clearTimeout(searchClock);
    state.results=[];state.searchError='';state.searchLoading=state.query.trim().length>=2;
    const results=q('#pws-results',dialog);if(results)results.innerHTML=searchResults();
    if(state.searchLoading)searchClock=setTimeout(search,300);
  });
  document.addEventListener('click',e=>{
    if(e.target.closest?.('#pws-home-activity')){
      e.preventDefault();
      void open().then(()=>{if(dialog.open){state.tab='friends';render();rememberNotices('incoming')}});
      return;
    }
    const target=e.target.closest?.('[data-social-invite]');
    if(target){e.preventDefault();open(target.dataset.roomId||'',false,target.dataset.gameId||'zamazka')}
  });
  dialog.addEventListener('click',async e=>{
    const tab=e.target.closest('[data-pws-tab]');
    if(tab){
      if(!capturePainting())return;
      resetNotice();state.tab=tab.dataset.pwsTab;state.edit=state.tab==='profile'&&!!state.draft;state.other=null;
      state.otherReturn=null;state.friendOrder=[];
      render();
      if(state.tab==='friends')rememberNotices('incoming');
      if(state.tab==='invites')rememberNotices('invites');
      if(state.tab==='profile'&&state.me)void loadCloudUsage();
      return;
    }
    const target=e.target.closest('[data-pws]');
    if(!target||state.busy)return;
    const action=target.dataset.pws,id=target.dataset.id;
    if(action==='close'){await leaveDraft(true);return}
    if(action==='login'){dialog.close();if(window.PocketID?.openAccount)window.PocketID.openAccount();else location.assign('/?pocket-id=login');return}
    if(action==='refresh-cloud'){void loadCloudUsage();return}
    if(action==='account'||action==='privacy'){beginDraft();state.tab='privacy';state.edit=false;render();return}
    if(action==='profile-back'){capturePainting();state.tab='profile';state.edit=false;render();return}
    if(action==='save-privacy'){await saveUnifiedProfile();return}
    if(action==='copy-id'){try{await navigator.clipboard.writeText(state.me.profile.id);state.notice='ID скопирован.'}catch{state.error='Не удалось скопировать ID.'}render();return}
    if(action==='edit'||action==='edit-data'||action==='collection'){beginDraft();state.edit=true;state.paintOpen=false;state.editorSection=action==='edit-data'?'data':action==='collection'?'collection':'appearance';state.editorTab='animal';state.rewardGame='all';state.rewardView='all';resetNotice();render();return}
    if(action==='editor-mode'){state.editorSection=target.dataset.value;render();return}
    if(action==='reward-game'){state.rewardGame=target.dataset.value;render();return}
    if(action==='reward-view'){state.rewardView=target.dataset.value;render();return}
    if(action==='maskot-tab'){state.editorTab=target.dataset.value;render();return}
    if(action==='portrait-frame'){state.draft.portraitFrame=target.dataset.value;render();return}
    if(action==='equip-achievement'){
      const item=profileRewardById.get(target.dataset.value);
      if(!item||!(state.me.profile.unlocked||[]).includes(item.id)||!item.items?.length)return;
      const y=q('.pws-maskot-editor__picker',content)?.scrollTop||0;
      state.draft=equipProfileReward(item,state.draft);
      render();
      const picker=q('.pws-maskot-editor__picker',content);
      if(picker)picker.scrollTop=y;
      return;
    }
    if(action==='background-mode'){state.draft.backgroundMode=target.dataset.value;render();return}
    if(action==='paint-open'){state.paintOpen=true;render();return}
    if(action==='paint-cancel'){
      if(paintSession?.hasChanges()&&!await confirmShell('Отменить рисунок?','Изменения рисунка не сохранятся.','Не сохранять'))return;
      state.paintOpen=false;paintSession=null;render();return;
    }
    if(action==='paint-done'){
      const art=paintSession?.commit();
      if(!art){const el=q('.pws-studio__message',content);if(el)el.textContent='Не удалось сохранить рисунок.';return;}
      state.draft.artwork=art;state.draft.backgroundMode='drawing';
      state.paintOpen=false;paintSession=null;render();return;
    }
    if(action==='maskot-item'){
      if(!['animal','hat','clothes','face','accessory'].includes(target.dataset.field))return;
      state.draft.maskot={...state.draft.maskot,[target.dataset.field]:target.dataset.value};
      render();return;
    }
    if(action==='redeem'){
      const input=q('#pws-cosmetic-code',dialog),code=input?.value.trim();
      if(!code){state.error='Введите код.';render();return}
      beginDraft();state.edit=true;state.editorSection='collection';
      state.busy=true;resetNotice();
      try{
        const response=await api('redeem',{code});
        state.me.profile=response.profile;
        state.draft.unlocked=response.profile.unlocked;
        if(!response.already){
          state.reward=response.reward;
          const claims={
            astronaut:{hat:'helmet',clothes:'spacesuit'},
            wedding:{hat:'veil',clothes:'wedding'},
            knight:{hat:'bascinet'},
            herald:{clothes:'tabard'},
            groom:{clothes:'groom'},
            'seoul-artist':{hat:'stage-pin',clothes:'stage-hanbok'},
            'dragon-keeper':{accessory:'shoulder-dragon'}
          };
          state.draft.maskot={...state.draft.maskot,...(claims[response.reward]||{})};
        }else state.notice='Награда уже получена.';
      }catch(e){state.error=e.message==='invalid_code'?'Неверный код.':e.message}
      finally{state.busy=false;render()}return;
    }
    if(action==='reward-close'){state.reward=null;render();return}
    if(action==='cancel-edit'){await leaveDraft();return}
    if(action==='background'||action==='frame'){state.draft[action]=target.dataset.value;render();return}
    if(action==='save-profile'){await saveUnifiedProfile();return}
    if(action==='open-user'){await showUser(id);return}
    if(action==='back'){returnFromUser();return}
    if(action==='send-request'){await mutate('friend-request',{id:state.other.id},{tab:'friends'});return}
    if(action==='cancel-friend'){await mutate('friend-action',{id:state.other.id,action:'cancel'},{tab:'friends'});return}
    if(action==='accept-friend'){await mutate('friend-action',{id:state.other.id,action:'accept'},{tab:'friends'});return}
    if(action==='decline-friend'){await mutate('friend-action',{id:state.other.id,action:'decline'},{tab:'friends'});return}
    if(action==='remove-friend'||action==='block-friend'){
      const block=action==='block-friend';
      if(await confirmShell(block?'Заблокировать игрока?':'Удалить из друзей?',block?'Игрок не сможет отправлять тебе заявки и приглашения.':'Чтобы играть вместе через список друзей, понадобится новая заявка.',block?'Заблокировать':'Удалить',true))
        await mutate('friend-action',{id:state.other.id,action:block?'block':'remove'},{tab:'friends'});
      return;
    }
        if(action==='unblock-friend'){await mutate('friend-action',{id:state.other.id,action:'unblock'},{tab:'friends'});return}
    if(action==='send-invite'){await mutate('invite',{toId:id,roomId:state.room,gameId:state.game},{tab:'invite',stay:true});return}
    if(action==='invite-party'){
      if(state.busy)return;
      state.busy=true;resetNotice();
      try{
        const result=await api('invite-party',{roomId:state.room,gameId:state.game});
        state.notice=result.sent?result.sent+' приглашений отправлено'+(result.skipped?' · '+result.skipped+' пропущено':''):
          'Все участники уже приглашены или запретили приглашения.';
        await reload(false);
      }catch(error){state.error=error.message}
      finally{state.busy=false;render()}
      return;
    }
    if(action==='join-friend'){
      if(state.busy)return;
      state.busy=true;resetNotice();
      try{
        const result=await api('join-friend',{id});
        if(!result.url||!/^\/apps\/[a-z0-9-]+\/\?room=[0-9a-f-]+$/.test(result.url))
          throw Error('Ссылка на комнату недействительна.');
        location.assign(new URL(result.url,location.origin).href);
        return;
      }catch(error){
        state.error=error.message||'Комната недоступна. Попроси друга создать новую.';
        await reload(false).catch(()=>{});
      }finally{state.busy=false;render()}
      return;
    }
    if(action==='add-party'||action==='remove-party'){
      if(!state.other)return;
      await mutate('party',{action:action==='add-party'?'add':'remove',id:state.other.id},{tab:'other',stay:true});
      // Keep the peer profile visible after adjusting the saved company.
      return;
    }
    if(action==='accept-invite'){await mutate('invite-action',{id,action:'accept'},{tab:'invites'});return}
    if(action==='decline-invite'){await mutate('invite-action',{id,action:'decline'},{tab:'invites'});return}
    if(action==='cancel-invite'){await mutate('invite-action',{id,action:'cancel'},{tab:'invites'});return}
  });
  async function pulse(){
    if(document.visibilityState==='hidden'||!navigator.onLine)return;
    try{
      const u=await fetch('/pocket-id/me',{credentials:'same-origin',cache:'no-store'}).then(r=>r.json());
      if(!u.user?.complete)return;
      const gameId=location.pathname.match(/^\/apps\/([a-z0-9-]+)\//)?.[1]||'';
      await api('presence',{gameId});
    }catch{}
  }
  heartbeatClock=setInterval(pulse,32000);
  pollClock=setInterval(async()=>{
    if(dialog.open||document.visibilityState==='hidden'||!navigator.onLine)return;
    try{await reload(false)}catch{}
  },22000);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden){
      pulse();
      if(dialog.open)void pollOpenSocial();
      else reload(false).catch(()=>{});
    }
  });
  document.addEventListener('pocket-id:changed',event=>{
    if(!event.detail?.user?.complete){
      reloadVersion++;lastPortraitKey='';
      liveRevision=null;state.friendOrder=[];state.otherReturn=null;
      state.me=null;state.other=null;state.edit=false;state.draft=null;state.draftBase=null;state.tab='profile';state.results=[];resetCloud();updateHomeActivity();
      updateNotification(0);if(dialog.open)render();
    }else{
      if(state.cloudAccount&&state.cloudAccount!==event.detail.user.id)resetCloud();
      liveRevision=null;
      if(dialog.open){
        reload(false).then(applied=>{if(applied){updateConnectionStatus(false);render()}}).catch(()=>{});
      }else reload(false).catch(()=>{});
    }
    pulse();
  });
  pulse();reload(false).catch(()=>{});
}
window.PocketSocial=Object.freeze({open:(room='',gameId='zamazka')=>open(room,false,gameId),openEditor:()=>open('',true)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
