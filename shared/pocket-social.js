import {pocketAvatarMarkup} from './capabilities/identity.js';
import {mountCardCanvas} from './capabilities/card-studio.js';
import {mascotSvg,safeMascot,mascotAnimals,mascotHats,mascotClothes,mascotFaces,mascotTitles} from './capabilities/maskot.js';
// Pocket Social shared UI. No dependency on a specific app runtime or framework.
const q=(s,root=document)=>root.querySelector(s);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const backgrounds=[['forest','Лес','#426c60'],['clay','Терракота','#965545'],['lilac','Сирень','#776185'],['ocean','Океан','#347e8c'],['night','Ночь','#252d39'],['paper','Бумага','#d6bea1']];
const frames=[['clean','Чистая'],['double','Двойная'],['corners','Углы'],['stamp','Марка']];
const portraitFrames=[['none','Без рамки'],['wood','Резное дерево'],['gilt','Позолоченная']];
const colors=['#273d46','#fff8e6','#d75e55','#f2ad6c','#f2d478','#82aa73','#478d8c','#6092bd','#8865a3','#c87eac','#8a604d','#101c29'];
const errors={invalid_code:'Неверный код.',sign_in_required:'Войди в Pocket ID, чтобы пользоваться друзьями.',identity_unavailable:'Не удалось проверить аккаунт Pocket ID.',rate_limited:'Слишком много запросов. Попробуй позже.',not_room_member:'Сначала войди в игровую комнату.',room_unavailable:'Комната уже закрыта, заполнена или игра началась.',invite_expired:'Приглашение уже недействительно.',blocked:'Запрос недоступен для этого игрока.',invites_disabled:'Игрок отключил приглашения.',friends_only:'Приглашать можно только друзей.',already_requested:'Заявка уже отправлена.',already_friends:'Вы уже друзья.',user_not_found:'Игрок не найден.',invalid_profile:'Проверь выбранное оформление.',network:'Нет подключения к серверу PocketWorks.'};
const button=(name,label,kind='quiet',extra='')=>'<button type="button" class="pws-btn pws-btn--'+kind+'" data-pws="'+name+'" '+extra+'>'+label+'</button>';
const state={editorTab:'animal',paintOpen:false,reward:null,tab:'profile',me:null,other:null,query:'',results:[],room:'',game:'zamazka',catalog:[],loading:false,busy:false,edit:false,draft:null,artHistory:[],ink:colors[0],notice:'',error:'',confirm:null,searchVersion:0,cloud:null,cloudAccount:null,cloudLoading:false,cloudError:'',cloudVersion:0,cloudUpdated:0,expanded:{account:false,cloud:false,incoming:true,outgoing:false,blocked:false,appearance:false}};
let dialog,content,entry,paintSession=null,searchClock=0,pollClock=0,heartbeatClock=0;
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
const avatar=p=>p.maskot?mascotSvg(p.maskot,{unlocks:p.unlocked||['astronaut','wedding']}):
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
const presenceLabel=p=>p.online?'● В сети'+(p.gameId?' · '+gameLabel(p.gameId):''):'Не в сети';
function personRow(p,actions,subtitle=presenceLabel(p)){
  const background=backgrounds.some(t=>t[0]===p.background)?p.background:'forest';
  const frame=frames.some(t=>t[0]===p.frame)?p.frame:'clean';
  return '<div class="pws-person" data-background="'+background+'" data-frame="'+frame+'">'+
    '<div class="pws-person__avatar">'+avatar(p)+'</div>'+
    '<div class="pws-person__name"><strong>'+esc(p.nickname)+'</strong><small>'+esc(subtitle)+'</small></div>'+
    '<div class="pws-person__actions">'+actions+'</div></div>';
}
function person(p){
  return personRow(p,button('open-user','Профиль','quiet','data-id="'+esc(p.id)+'"'));
}
function listPeople(list,empty){return list?.length?'<div class="pws-list">'+list.map(person).join('')+'</div>':'<div class="pws-empty">'+empty+'</div>'}
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
  ['animal','Зверь'],['hat','Голова'],['clothes','Одежда'],['face','Лицо'],
  ['portrait','Рамка'],['background','Фон'],['account','Профиль']
];
function paintingStudio(){
  return '<section class="pws-studio" aria-label="Редактор нарисованного фона">'+
    '<div class="pws-studio__header"><div><strong>Мой рисунок</strong><small>Фон карточки · рисуй пальцем или мышью</small></div>'+
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
function editor(){
  if(state.paintOpen)return paintingStudio();
  const d=state.draft,m=d.maskot||safeMascot(null),unlocks=state.me?.profile?.unlocked||[];
  const secretHats=[...(unlocks.includes('astronaut')?[['helmet','Шлем космонавта']]:[]),
    ...(unlocks.includes('wedding')?[['veil','Фата']]:[])];
  const secretClothes=[...(unlocks.includes('astronaut')?[['spacesuit','Скафандр']]:[]),
    ...(unlocks.includes('wedding')?[['wedding','Свадебный наряд']]:[])];
  const category=state.editorTab;
  const options=(rows,field)=>'<div class="pws-maskot-options">'+rows.map(([id,label])=>
    '<button type="button" data-pws="maskot-item" data-field="'+field+'" data-value="'+id+
    '" aria-pressed="'+(m[field]===id)+'"><span class="pws-maskot-option__art">'+
    mascotSvg({...m,[field]:id},{unlocks,size:92})+'</span><span>'+esc(label)+'</span></button>').join('')+'</div>';
  const frameOptions='<div class="pws-portrait-options">'+portraitFrames.map(([id,label])=>
    '<button type="button" data-pws="portrait-frame" data-value="'+id+
    '" aria-pressed="'+(d.portraitFrame===id)+'"><span class="pws-portrait-sample" data-portrait-frame="'+id+
    '">'+mascotSvg(m,{unlocks,size:80})+'</span><span>'+esc(label)+'</span></button>').join('')+'</div>';
  const presetControls='<div class="pws-field"><label>Цветовая тема карточки</label><div class="pws-options">'+backgrounds.map(t=>
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
    category==='face'?options(mascotFaces,'face'):
    category==='portrait'?frameOptions:
    category==='background'?backgroundControls:
      '<div class="pws-field"><label for="pws-nickname">Никнейм</label>'+
      '<input id="pws-nickname" type="text" maxlength="20" minlength="3" value="'+esc(d.nickname)+'"></div>'+
      '<div class="pws-field"><label for="pws-title">Титул</label><select id="pws-title">'+mascotTitles.map(t=>
      '<option value="'+esc(t)+'" '+(d.title===t?'selected':'')+'>'+esc(t||'Без титула')+'</option>').join('')+'</select></div>'+
      '<div class="pws-field"><label for="pws-favorite">Любимая игра</label><select id="pws-favorite">'+
      '<option value="">Не выбрана</option>'+state.catalog.map(g=>
      '<option value="'+esc(g.slug)+'" '+(g.slug===d.favoriteGame?'selected':'')+'>'+esc(g.name)+'</option>').join('')+
      '</select><small>Если игра не выбрана, карточка показывает «Участник PocketWorks» — это не титул.</small></div>'+
      '<label class="pws-check"><input type="checkbox" id="pws-discoverable" '+(d.discoverable?'checked':'')+'> Показывать профиль в поиске</label>'+
      '<label class="pws-check"><input type="checkbox" id="pws-presence" '+(d.presenceVisible?'checked':'')+'> Показывать онлайн</label>'+
      '<label class="pws-check"><input type="checkbox" id="pws-invites" '+(d.allowInvites?'checked':'')+'> Разрешать приглашения</label>'+
      '<details class="pws-fold pws-maskot-redeem"><summary>Активировать код</summary><div class="pws-fold__body">'+
      '<div class="pws-maskot-redeem__row"><input id="pws-cosmetic-code" placeholder="Код награды" maxlength="60" autocomplete="off" spellcheck="false">'+
      button('redeem','Получить','primary')+'</div></div></details>';
  return '<div class="pws-maskot-editor"><div class="pws-maskot-editor__preview">'+
    card({...state.me.profile,...d})+
    '<div class="pws-maskot-editor__actions">'+button('cancel-edit','Отмена')+
    button('save-profile',state.busy?'Сохранение…':'Сохранить','primary')+'</div></div>'+
    '<div class="pws-maskot-editor__work"><div class="pws-maskot-tabs">'+maskotCategories.map(([id,label])=>
    '<button type="button" data-pws="maskot-tab" data-value="'+id+
    '" aria-pressed="'+(category===id)+'">'+label+'</button>').join('')+'</div>'+
    '<div class="pws-maskot-editor__picker">'+appearance+'</div></div></div>'+
    (state.reward?'<div class="pws-reward-shade"><div class="pws-reward" role="dialog" aria-label="Косметика получена">'+
      '<div class="pws-reward__gift"><div class="pws-reward__lid"></div><div class="pws-reward__bow"></div></div>'+
      '<h3>Новый образ!</h3><p>'+esc(state.reward==='astronaut'?'Шлем и скафандр':'Фата и свадебный наряд')+
      '</p>'+button('reward-close','Примерить','primary')+'</div></div>':'');
}
function profilePanel(){
  const p=state.me?.profile;
  if(!p)return '<div class="pws-empty">Создай Pocket ID, чтобы добавить друзей.</div>'+
    '<div class="pws-actions">'+button('login','Открыть Pocket ID','primary')+'</div>';
  if(state.edit)return editor();
  return '<h2>Профиль</h2><div class="pws-profile-layout"><section>'+card(p)+
    '<div class="pws-actions">'+button('edit','Изменить профиль','primary')+
    button('copy-id','Скопировать ID','quiet')+'</div></section>'+
    '<details class="pws-fold pws-fold--aside" data-pws-fold="account"'+(state.expanded.account?' open':'')+'>'+
    '<summary>Аккаунт и безопасность</summary><div class="pws-fold__body"><p class="pws-muted">ID: <code>'+esc(p.id)+'</code></p>'+
    button('account','Настройки Pocket ID')+'</div></details></div>'+
    '<details class="pws-fold pws-cloud-fold" data-pws-fold="cloud"'+(state.expanded.cloud?' open':'')+'>'+
    '<summary>Облако'+(state.cloud?' · '+cloudBytes(state.cloud.usedBytes)+' / '+cloudBytes(state.cloud.maxBytes):'')+'</summary>'+
    cloudPanel()+'</details>';
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
  const m=state.me, fold=(key,label,items)=>{
    if(!items?.length)return '';
    return '<details class="pws-fold" data-pws-fold="'+key+'"'+(state.expanded[key]?' open':'')+'>'+
      '<summary>'+label+' · '+items.length+'</summary><div class="pws-fold__body">'+listPeople(items,'')+'</div></details>';
  };
  return '<h2>Друзья</h2><div class="pws-field">'+
    '<input id="pws-search" type="search" aria-label="Поиск игрока" maxlength="40" autocomplete="off" spellcheck="false" placeholder="Найти игрока по нику или ID" value="'+esc(state.query)+'"></div>'+
    '<div id="pws-results">'+searchResults()+'</div>'+
    (m.incoming.length?fold('incoming','Заявки',m.incoming):'')+
    '<h3>Мои друзья · '+m.friends.length+'</h3>'+listPeople(m.friends,'Пока нет друзей. Найди игрока по нику.')+
    fold('outgoing','Отправленные заявки',m.outgoing)+
    fold('blocked','Заблокированные',m.blocked||[]);
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
    (invites.length?'<div class="pws-list">'+invites.map(i=>{
      const peerId=i.incoming?i.fromId:i.toId;
      // Invitations are sent between friends. Reuse the actual profile rather than
      // substituting an arrow or an initial for their chosen portrait.
      const peer=state.me.friends.find(p=>p.id===peerId)||
        {id:peerId,nickname:i.incoming?i.fromName:i.toName,avatar:'clay'};
      const actions=i.incoming?
        button('accept-invite','Войти','primary','data-id="'+esc(i.id)+'"')+
        button('decline-invite','Отклонить','quiet','data-id="'+esc(i.id)+'"'):
        button('cancel-invite','Отозвать','quiet','data-id="'+esc(i.id)+'"');
      return personRow(peer,actions,gameLabel(i.gameId)+' · '+(i.incoming?'приглашает тебя':'ожидает ответа'));
    }).join('')+'</div>':'<div class="pws-empty">Нет ожидающих приглашений.</div>');
}
function invitePanel(){
  if(!state.me)return profilePanel();
  return '<h2>Позвать в '+esc(gameLabel(state.game))+'</h2><p class="pws-muted">Приглашение получит друг, который сможет войти в эту комнату одним нажатием.</p>'+
    '<div class="pws-list">'+(state.me.friends.filter(p=>p.allowInvites).map(p=>
      personRow(p,button('send-invite','Пригласить','primary','data-id="'+esc(p.id)+'"'))
    ).join('')||
    '<div class="pws-empty">Нет друзей, которым можно отправить приглашение. Добавь их в разделе «Друзья».</div>')+'</div>';
}
function render(){
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
  content.innerHTML=errorMarkup()+(state.loading?'<div class="pws-loading">Загрузка…</div>':
    state.tab==='profile'?profilePanel():
    state.tab==='friends'?friendsPanel():
    state.tab==='invites'?invitesPanel():
    state.tab==='invite'?invitePanel():otherPanel());
  if(state.edit&&state.tab==='profile'&&state.paintOpen){
    paintSession=mountCardCanvas(content,{initial:state.draft.artwork,
      onError:message=>{const label=q('.pws-studio__message',content);if(label)label.textContent=message;}});
  }else paintSession=null;
}
function updateNotification(count){
  const invites=(state.me?.invites||[]).filter(i=>i.incoming&&i.status==='pending').length;
  const requests=(state.me?.incoming||[]).length;
  document.dispatchEvent(new CustomEvent('pocket-social:notifications',{detail:{count,invites,requests}}));
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
  const data=await api('me');
  // Ignore an in-flight response from a previous account after sign-out/switch.
  const currentAccount=window.PocketID?.getUser?.();
  if(q('#pocket-id-trigger')&&(!currentAccount?.complete||data.profile.id!==currentAccount.id)){
    state.me=null;resetCloud();updateNotification(0);if(rerender)render();return;
  }
  if(state.cloudAccount&&state.cloudAccount!==data.profile.id)resetCloud();
  state.me=data;
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
  const pending=(data.invites||[]).filter(i=>i.incoming&&i.status==='pending').length;
  const requests=(data.incoming||[]).length;
  updateNotification(pending+requests);
  document.dispatchEvent(new CustomEvent('pocket-social:portrait',{detail:{accountId:data.profile.id,artwork:data.profile.artwork||'',maskot:data.profile.maskot||null}}));
  if(rerender)render();
}
async function loadCatalog(){
  try{
    const r=await fetch('/apps.json',{cache:'force-cache'});
    if(r.ok){const apps=await r.json();state.catalog=Array.isArray(apps)?apps.filter(x=>x&&x.slug&&x.name).map(x=>({slug:x.slug,name:x.name})).sort((a,b)=>a.name.localeCompare(b.name)):[]}
  }catch{}
}
function resetNotice(){state.notice='';state.error='';state.confirm=null}
async function open(room='',editNow=false,gameId='zamazka'){
  state.game=['zamazka','blind-pals'].includes(gameId)?gameId:'zamazka';
  if(!dialog.open)dialog.showModal();
  state.room=room||'';state.tab=room?'invite':'profile';state.edit=false;state.other=null;
  state.loading=true;resetNotice();render();
  try{await Promise.all([reload(false),loadCatalog()])}
  catch(e){state.me=null;state.error=e.message}
  finally{state.loading=false}
  if(state.me&&editNow){
    state.tab='profile';state.edit=true;state.draft={...state.me.profile};
    state.draft.maskot=safeMascot(state.draft.maskot,state.draft.unlocked);
    state.editorTab='animal';state.artHistory=[state.draft.artwork];resetNotice();
  }else if(state.me&&!room){
    const incoming=(state.me.invites||[]).some(i=>i.incoming&&i.status==='pending');
    if(incoming)state.tab='invites';
    else if((state.me.incoming||[]).length)state.tab='friends';
  }
  render();
  if(state.me&&state.tab==='profile'&&!state.edit)void loadCloudUsage();
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
      backgroundMode:draft.backgroundMode||'preset',portraitFrame:draft.portraitFrame||'wood',
      artwork:draft.artwork,maskot:draft.maskot,title:draft.title||'',favoriteGame:draft.favoriteGame,
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
    if(t.id==='pws-title')state.draft.title=t.value;
  });
  dialog.addEventListener('toggle',event=>{
    const key=event.target?.dataset?.pwsFold;
    if(key&&Object.hasOwn(state.expanded,key))state.expanded[key]=event.target.open;
  },true);
  dialog.addEventListener('input',e=>{
    if(e.target.id==='pws-nickname'&&state.draft){state.draft.nickname=e.target.value;return}
    if(e.target.id!=='pws-search')return;
    state.query=e.target.value;clearTimeout(searchClock);
    searchClock=setTimeout(search,300);
  });
  document.addEventListener('click',e=>{
    const target=e.target.closest?.('[data-social-invite]');
    if(target){e.preventDefault();open(target.dataset.roomId||'',false,target.dataset.gameId||'zamazka')}
  });
  dialog.addEventListener('click',async e=>{
    const tab=e.target.closest('[data-pws-tab]');
    if(tab){resetNotice();state.tab=tab.dataset.pwsTab;state.edit=false;state.other=null;render();if(state.tab==='profile'&&state.me)void loadCloudUsage();return}
    const target=e.target.closest('[data-pws]');
    if(!target||state.busy)return;
    const action=target.dataset.pws,id=target.dataset.id;
    if(action==='close'){dialog.close();return}
    if(action==='login'){dialog.close();if(window.PocketID?.openAccount)window.PocketID.openAccount();else location.assign('/?pocket-id=login');return}
    if(action==='refresh-cloud'){void loadCloudUsage();return}
    if(action==='account'){dialog.close();if(window.PocketID?.openAccount)window.PocketID.openAccount();else location.assign('/?pocket-id=login');return}
    if(action==='copy-id'){try{await navigator.clipboard.writeText(state.me.profile.id);state.notice='ID скопирован.'}catch{state.error='Не удалось скопировать ID.'}render();return}
    if(action==='edit'){state.edit=true;state.paintOpen=false;state.draft={...state.me.profile,
      backgroundMode:state.me.profile.backgroundMode||'preset',
      portraitFrame:state.me.profile.portraitFrame||'wood',
      maskot:safeMascot(state.me.profile.maskot,state.me.profile.unlocked)};
      state.editorTab='animal';state.artHistory=[state.draft.artwork];resetNotice();render();return}
    if(action==='maskot-tab'){state.editorTab=target.dataset.value;render();return}
    if(action==='portrait-frame'){state.draft.portraitFrame=target.dataset.value;render();return}
    if(action==='background-mode'){state.draft.backgroundMode=target.dataset.value;render();return}
    if(action==='paint-open'){state.paintOpen=true;render();return}
    if(action==='paint-cancel'){
      if(paintSession?.hasChanges()&&!window.confirm('Отменить несохранённые изменения рисунка?'))return;
      state.paintOpen=false;paintSession=null;render();return;
    }
    if(action==='paint-done'){
      const art=paintSession?.commit();
      if(!art){const el=q('.pws-studio__message',content);if(el)el.textContent='Не удалось сохранить рисунок.';return;}
      state.draft.artwork=art;state.draft.backgroundMode='drawing';
      state.paintOpen=false;paintSession=null;render();return;
    }
    if(action==='maskot-item'){
      if(!['animal','hat','clothes','face'].includes(target.dataset.field))return;
      state.draft.maskot={...state.draft.maskot,[target.dataset.field]:target.dataset.value};
      render();return;
    }
    if(action==='redeem'){
      const input=q('#pws-cosmetic-code',dialog),code=input?.value.trim();
      if(!code){state.error='Введите код.';render();return}
      state.busy=true;resetNotice();
      try{
        const response=await api('redeem',{code});
        state.me.profile=response.profile;
        state.draft.unlocked=response.profile.unlocked;
        if(!response.already){
          state.reward=response.reward;
          state.draft.maskot=response.reward==='astronaut'
            ?{...state.draft.maskot,hat:'helmet',clothes:'spacesuit'}
            :{...state.draft.maskot,hat:'veil',clothes:'wedding'};
        }else state.notice='Награда уже получена.';
      }catch(e){state.error=e.message==='invalid_code'?'Неверный код.':e.message}
      finally{state.busy=false;render()}return;
    }
    if(action==='reward-close'){state.reward=null;render();return}
    if(action==='cancel-edit'){state.edit=false;state.paintOpen=false;render();return}
    if(action==='background'||action==='frame'){state.draft[action]=target.dataset.value;render();return}
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
      const gameId=location.pathname.startsWith('/apps/zamazka/')?'zamazka':location.pathname.startsWith('/apps/blind-pals/')?'blind-pals':'';
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
      state.me=null;state.other=null;state.edit=false;state.results=[];resetCloud();
      updateNotification(0);if(dialog.open)render();
    }else{if(state.cloudAccount&&state.cloudAccount!==event.detail.user.id)resetCloud();reload(false).catch(()=>{});}
    pulse();
  });
  pulse();reload(false).catch(()=>{});
}
window.PocketSocial=Object.freeze({open:(room='',gameId='zamazka')=>open(room,false,gameId),openEditor:()=>open('',true)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
