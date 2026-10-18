// ZAMAZKA / QA SCREEN GALLERY
// Real app screens are mounted in a same-origin *isolated iframe* with synthetic
// immutable match data. The parent game session and its canvas remain untouched.
export const DEBUG_QUERY='__zamazka_debug_screen';
export const DEBUG_DEVICE_QUERY='__zamazka_debug_device';
export const DEBUG_DEVICES=Object.freeze({phone:{width:390,height:844,label:'Телефон'},desktop:{width:1440,height:900,label:'ПК'}});
export const DEBUG_SCREENS=[
 {id:'home',name:'Главный экран',group:'Главная'},
 {id:'create',name:'Создание комнаты',group:'Подключение'},
 {id:'join',name:'Вход по коду',group:'Подключение'},
 {id:'join-error',name:'Ошибка приглашения',group:'Подключение'},
 {id:'connecting',name:'Подключение к PocketNet',group:'Подключение'},
 {id:'lobby-host',name:'Комната ожидания · ведущий',group:'Комната'},
 {id:'lobby-guest',name:'Комната ожидания · игрок',group:'Комната'},
 {id:'preparing',name:'Подготовка картин',group:'Раунд'},
 {id:'preview',name:'Запоминание картин',group:'Раунд'},
 {id:'drawing',name:'Реставрация',group:'Раунд'},
 {id:'waiting',name:'Работа сдана',group:'Раунд'},
 {id:'voting',name:'Голосование',group:'Экспертиза'},
 {id:'voting-wait',name:'Ожидание голосов',group:'Экспертиза'},
 {id:'voting-author',name:'Моя картина на проверке',group:'Экспертиза'},
 {id:'verdict',name:'Протокол ставок',group:'Экспертиза'},
 {id:'reveal',name:'Разоблачение',group:'Экспертиза'},
 {id:'round-review',name:'Выставка реставраций',group:'Финал'},
 {id:'results',name:'Итоги и победитель',group:'Финал'},
 {id:'awards',name:'Достижения · полученные',group:'Личное'},
 {id:'awards-guest',name:'Достижения · гость',group:'Личное'},
 {id:'collection',name:'Архив реставраций',group:'Личное'},
 {id:'settings-brushes',name:'Настройки · кисти',group:'Личное'},
 {id:'settings-preferences',name:'Настройки · параметры',group:'Личное'},
 {id:'solo-settings',name:'Одиночная · настройки',group:'Одиночная'},
 {id:'solo-reveal',name:'Одиночная · сравнение',group:'Одиночная'},
 {id:'sounds',name:'Все звуки · прослушивание',group:'Звуки'}
];
export const isDebugKey=event=>event.code==='Backquote'||['`','~','ё','Ё'].includes(event.key);
export const debugId=id=>DEBUG_SCREENS.some(stage=>stage.id===id)?id:'home';
export function debugMatch(ids){
 const selected=ids.slice(0,5);
 if(selected.length<5)throw Error('Debug gallery requires five playable paintings');
 const names=['Куратор','Алиса','Борис','Мария','Лев'];
 const participants=names.map((name,i)=>({id:'debug-'+i,name,verified:i===0}));
 const ballots=Object.fromEntries(participants.slice(1).map((p,i)=>[p.id,
  selected.map((_,j)=>j===(i+1)%5?3:0)]));
 const gallery=participants.map((p,i)=>({
  id:p.id,name:p.name,art:selected[(i+2)%5],variation:(i%3)+1,
  strokes:[],votes:i===0?ballots:Object.fromEntries(participants.filter(x=>x.id!==p.id).map((v,k)=>
   [v.id,selected.map((_,j)=>j===(k+i)%5?3:0)]))
 }));
 return {
  host:participants[0].id,participants,selected,round:2,rounds:3,turn:0,
  phase:'lobby',timedScoring:true,deadline:Date.now()+160000,drawingSeconds:160,readyCount:2,
  mine:{art:selected[2],variation:1,strokes:[],id:participants[0].id,name:participants[0].name},
  candidate:gallery[0],author:participants[1],gallery,
  done:[participants[0].id,participants[2].id],voted:[],
  scores:Object.fromEntries(participants.map((p,i)=>[p.id,{mask:100-i*15,eye:30+i*29}])),
  board:{revision:0,segments:[]}
 };
}
export function mountDebugGallery({onSelect=null}={}){
 let layer=null,frame=null,active='home';
 let device=window.matchMedia('(max-width:700px)').matches?'phone':'desktop';
 const dims=type=>DEBUG_DEVICES[type]||DEBUG_DEVICES.desktop;
 function fit(){
  if(!layer||!frame)return;
  const stage=layer.querySelector('.zam-debug-stage'),windowEl=layer.querySelector('.zam-debug-device-window');
  const {width,height}=dims(device);
  const navOpen=!layer.classList.contains('is-collapsed');
  const sidebar=navOpen&&innerWidth>700?Math.min(315,innerWidth*.36):0;
  stage.style.left=sidebar+'px';
  const spaceWidth=Math.max(80,innerWidth-sidebar-24),spaceHeight=Math.max(80,innerHeight-28);
  const scale=Math.min(1,spaceWidth/width,spaceHeight/height);
  windowEl.style.width=(width*scale)+'px';windowEl.style.height=(height*scale)+'px';
  frame.style.width=width+'px';frame.style.height=height+'px';
  frame.style.transform='scale('+scale+')';
  layer.dataset.debugDevice=device;
  layer.querySelectorAll('[data-debug-device]').forEach(button=>{
   const active=button.dataset.debugDevice===device;
   button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));
  });
 }
 function setDevice(next){
  if(!DEBUG_DEVICES[next]||!layer)return;
  if(device===next)return;
  device=next;fit();
  // Re-render at the new CSS viewport width, without touching parent game state.
  frame.removeAttribute('src');select(active);
 }
 const groups=[...new Set(DEBUG_SCREENS.map(s=>s.group))];
 function updateCurrent(){
  if(!layer)return;
  const selected=DEBUG_SCREENS.find(x=>x.id===active);
  layer.querySelector('[data-debug-current]').textContent=selected?.name||'Экран';
  layer.querySelectorAll('[data-debug-select]').forEach(item=>{
   const on=item.dataset.debugSelect===active;
   item.classList.toggle('is-active',on);item.setAttribute('aria-current',on?'page':'false');
  });
 }
 function select(id){
  if(!layer)return;active=debugId(id);
  const url=new URL(location.pathname,location.href);
  url.searchParams.set(DEBUG_QUERY,active);
  url.searchParams.set(DEBUG_DEVICE_QUERY,device);
  const target=url.pathname+url.search;
  // Choosing the already open entry must not unload the live preview.
  if(frame.getAttribute('src')===target){updateCurrent();return}
  frame.src=target;
  frame.title='Предпросмотр: '+DEBUG_SCREENS.find(x=>x.id===active).name;
  layer.classList.add('is-loading');
  updateCurrent();
  onSelect?.(active);
 }
 function close(){
  if(!layer)return;
  frame.src='about:blank';
  window.removeEventListener('resize',fit);
  layer.remove();layer=null;frame=null;
 }
 function toggle(){
  if(layer){close();return}
  layer=document.createElement('section');
  layer.id='zamazkaDebugGallery';
  layer.className='zam-debug';
  layer.setAttribute('aria-label','Просмотр экранов Замазки');
  layer.innerHTML='<div class="zam-debug-stage"><div class="zam-debug-device-window">'+
   '<iframe class="zam-debug-frame" title="Предпросмотр экрана" tabindex="0"></iframe></div></div>'+
   '<aside class="zam-debug-nav" aria-label="Перейти к экрану">'+
    '<header class="zam-debug-head"><div><small>ЗАМАЗКА / ПРОСМОТР</small><strong>Режим экранов</strong></div>'+
    '<button type="button" data-debug-close aria-label="Закрыть режим просмотра">×</button></header>'+
    '<div class="zam-debug-tools"><div class="zam-debug-device-picker" role="group" aria-label="Формат экрана">'+
     '<button type="button" data-debug-device="phone" aria-pressed="false">Телефон</button>'+
     '<button type="button" data-debug-device="desktop" aria-pressed="false">ПК</button></div>'+
    '<button type="button" data-debug-collapse>Свернуть список</button>'+
    '<span>Данные демонстрационные</span></div>'+
    '<nav class="zam-debug-list" aria-label="Список экранов">'+groups.map(group=>
     '<div class="zam-debug-group"><div class="zam-debug-group-name">'+group+'</div>'+
     DEBUG_SCREENS.filter(s=>s.group===group).map(s=>
      '<button type="button" data-debug-select="'+s.id+'" aria-current="false">'+s.name+'</button>').join('')+
     '</div>').join('')+'</nav></aside>'+
   '<button type="button" class="zam-debug-reopen" data-debug-reopen aria-label="Развернуть список экранов">'+
   '<span>ЭКРАНЫ</span><strong data-debug-current>Главный экран</strong><i>☰</i></button>'+
   '<div class="zam-debug-load" aria-hidden="true">Открываем экран…</div>';
  document.body.appendChild(layer);
  frame=layer.querySelector('iframe');frame.addEventListener('load',()=>layer?.classList.remove('is-loading'));
  window.addEventListener('resize',fit);fit();
  layer.querySelectorAll('[data-debug-device]').forEach(button=>button.addEventListener('click',()=>setDevice(button.dataset.debugDevice)));

  layer.querySelector('[data-debug-close]').addEventListener('click',close);
  layer.querySelector('[data-debug-collapse]').addEventListener('click',()=>{layer?.classList.add('is-collapsed');fit()});
  layer.querySelector('[data-debug-reopen]').addEventListener('click',()=>{layer?.classList.remove('is-collapsed');fit()});
  layer.querySelectorAll('[data-debug-select]').forEach(button=>button.addEventListener('click',()=>{
   select(button.dataset.debugSelect);
   if(matchMedia('(max-width:700px)').matches){layer?.classList.add('is-collapsed');fit()}
  }));
  select(active);
 }
 window.addEventListener('message',e=>{
  if(e.origin===location.origin&&frame&&e.source===frame.contentWindow&&
   e.data?.type==='zamazka-debug-toggle')close();
 });
 return {toggle,close,select,setDevice,isOpen:()=>Boolean(layer),screens:DEBUG_SCREENS};
}
