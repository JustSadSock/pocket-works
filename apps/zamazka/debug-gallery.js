// ZAMAZKA / QA SCREEN GALLERY
// Real app screens are mounted in a same-origin *isolated iframe* with synthetic
// immutable match data. The parent game session and its canvas remain untouched.
export const DEBUG_QUERY='__zamazka_debug_screen';
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
 {id:'solo-reveal',name:'Одиночная · сравнение',group:'Одиночная'}
];
export const isDebugKey=event=>event.code==='Backquote'||['`','~','ё','Ё'].includes(event.key);
export const debugId=id=>DEBUG_SCREENS.some(stage=>stage.id===id)?id:'home';
export function debugMatch(ids){
 const selected=ids.slice(0,5);
 if(selected.length<5)throw Error('Debug gallery requires five playable paintings');
 const names=['Куратор','Алиса','Борис','Мария'];
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
  phase:'lobby',deadline:Date.now()+160000,drawingSeconds:160,readyCount:2,
  mine:{art:selected[2],variation:1,strokes:[],id:participants[0].id,name:participants[0].name},
  candidate:gallery[0],author:participants[1],gallery,
  done:[participants[0].id,participants[2].id],voted:[],
  scores:Object.fromEntries(participants.map((p,i)=>[p.id,{mask:100-i*15,eye:30+i*29}])),
  board:{revision:0,segments:[]}
 };
}
export function mountDebugGallery({onSelect=null}={}){
 let layer=null,frame=null,active='home';
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
  frame.src=url.pathname+url.search;
  frame.title='Предпросмотр: '+DEBUG_SCREENS.find(x=>x.id===active).name;
  layer.classList.add('is-loading');
  updateCurrent();
  onSelect?.(active);
 }
 function close(){
  if(!layer)return;
  frame.src='about:blank';
  layer.remove();layer=null;frame=null;
 }
 function toggle(){
  if(layer){close();return}
  layer=document.createElement('section');
  layer.id='zamazkaDebugGallery';
  layer.className='zam-debug';
  layer.setAttribute('aria-label','Просмотр экранов Замазки');
  layer.innerHTML='<iframe class="zam-debug-frame" title="Предпросмотр экрана" tabindex="0"></iframe>'+
   '<aside class="zam-debug-nav" aria-label="Перейти к экрану">'+
    '<header class="zam-debug-head"><div><small>ЗАМАЗКА / ПРОСМОТР</small><strong>Режим экранов</strong></div>'+
    '<button type="button" data-debug-close aria-label="Закрыть режим просмотра">×</button></header>'+
    '<div class="zam-debug-tools"><button type="button" data-debug-collapse>Свернуть список</button>'+
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
  layer.querySelector('[data-debug-close]').addEventListener('click',close);
  layer.querySelector('[data-debug-collapse]').addEventListener('click',()=>layer?.classList.add('is-collapsed'));
  layer.querySelector('[data-debug-reopen]').addEventListener('click',()=>layer?.classList.remove('is-collapsed'));
  layer.querySelectorAll('[data-debug-select]').forEach(button=>button.addEventListener('click',()=>{
   select(button.dataset.debugSelect);
   if(matchMedia('(max-width:700px)').matches)layer?.classList.add('is-collapsed');
  }));
  select(active);
 }
 window.addEventListener('message',e=>{
  if(e.origin===location.origin&&frame&&e.source===frame.contentWindow&&
   e.data?.type==='zamazka-debug-toggle')close();
 });
 return {toggle,close,select,isOpen:()=>Boolean(layer),screens:DEBUG_SCREENS};
}
