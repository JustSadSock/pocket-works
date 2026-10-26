// Read-only visual inspector. Never calls the game's stateful screen handlers.
const PAGES=[
 {id:'home',screen:'home',name:'Старт'},
 {id:'library',screen:'library',name:'Выбор сцены'},
 {id:'trim',screen:'trim',name:'Подготовка видео'},
 {id:'room',screen:'room',name:'Комната'},
 {id:'room-offline',screen:'room',name:'Комната · сбой связи'},
 {id:'editor',screen:'editor',name:'Монтаж реплик'},
 {id:'editor-rec',screen:'editor',name:'Идёт запись'},
 {id:'editor-fx',screen:'editor',name:'Эффекты голоса'},
 {id:'wait',screen:'wait',name:'Ожидание игроков'},
 {id:'premiere',screen:'premiere',name:'Премьера'},
 {id:'premiere-export',screen:'premiere',name:'Экспорт фильма'}
];
const CSS=new URL('./styles.css',document.baseURI).href;
const MOBILE=new URL('../../shared/mobile-runtime.css',document.baseURI).href;
const PREVIEW_CSS=[
 '.debug-film-art{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;background:radial-gradient(ellipse at 58% 35%,#596766 0,#273537 45%,#111819 100%);color:#f5e6c9;text-align:center;pointer-events:none;overflow:hidden}',
 '.debug-film-art:before{content:"";position:absolute;inset:8% 23%;border:9px solid #c98a62;transform:rotate(-8deg);opacity:.48}',
 '.debug-film-art strong{font:700 clamp(26px,6vw,54px) Oswald,Impact,sans-serif;letter-spacing:.12em;z-index:1;text-shadow:0 3px 15px #000}',
 '.debug-film-art span{z-index:1;letter-spacing:.2em;font:800 11px Manrope,Arial,sans-serif}',
 '.debug-fixture-screen video{display:none!important}',
 '.debug-fixture-screen .trim-preview,.debug-fixture-screen .premiere-viewport,.debug-fixture-screen .stage-wrap{position:relative}',
 '.debug-fixture-screen .trim-preview{min-height:170px}',
 '.debug-fixture-screen .premiere-loading{display:none!important}',
 '.debug-fixture-screen .debug-film-art{z-index:0}',
 '.debug-fixture-screen .stage-vignette{z-index:1}',
 '.debug-fixture-screen button,.debug-fixture-screen input,.debug-fixture-screen select{pointer-events:none}',
 '.debug-fixture-screen .screen:not(.hidden){animation:none!important}',
 '.debug-fixture-banner{background:#5c3328;color:#fff2e9;padding:10px;font-size:12px;font-weight:800;margin-bottom:12px}',
 '.debug-fixture-screen .scene-thumb{background:linear-gradient(130deg,#454f4c,#bd7858)}',
 '.debug-fixture-screen .clip-bar{box-sizing:border-box}',
 '.debug-fixture-screen .voice-effects{display:block!important}'
].join('\n');
let overlay=null,frame=null,active='home',device='desktop',restoreFocus=null,interactive=false;
const byId=(root,id)=>root.querySelector('[id="'+id+'"]');
function content(root,id,html){
 const el=byId(root,id);if(el)el.innerHTML=html;
}
function value(root,id,txt){
 const el=byId(root,id);if(el)el.textContent=txt;
}
function visible(root,id,show=true){
 byId(root,id)?.classList.toggle('hidden',!show);
}
function film(root,selector){
 const parent=root.querySelector(selector);if(!parent)return;
 const art=document.createElement('div');
 art.className='debug-film-art';
 art.innerHTML='<span>ПОКАЗАТЕЛЬНЫЙ КАДР · БЕЗ ЗАГРУЗКИ ВИДЕО</span><strong>WING IT!</strong><span>НЕ ТЕМ ГОЛОСОМ</span>';
 parent.append(art);
}
function decorate(root,page){
 root.classList.remove('hidden');
 root.classList.add('debug-fixture-screen');
 root.querySelectorAll('video').forEach(video=>{
  video.pause();video.removeAttribute('src');video.removeAttribute('poster');
  video.querySelectorAll('source').forEach(s=>s.remove());
 });
 if(page.screen==='library'){
  const titles=['WING IT! · ПОЛЁТ','WING IT! · ХАОС','BIG BUCK BUNNY · ЛЕС','BIG BUCK BUNNY · МЕСТЬ','SPRITE FRIGHT · ЛЕС','SPRITE FRIGHT · ПАНИКА'];
  const html=titles.map((t,i)=>'<button class="scene-card"><div class="scene-thumb"><strong>'+(i<2?'WING':i<4?'BUNNY':'SPRITE')+' / 0'+(i%2+1)+'</strong><span class="duration">00:55</span></div><b>'+t+'</b><small>Blender · открытая лицензия</small></button>').join('');
  content(root,'scene-grid',html);
 }
 if(page.screen==='trim'){
  const title=byId(root,'scene-title');if(title)title.value='WING IT! · ПОЛЁТ';
  content(root,'role-tags',['Кот','Пёс','Курица'].map(t=>'<div class="role-tag"><input value="'+t+'" readonly aria-label="Роль"><button>×</button></div>').join(''));
  value(root,'trim-total-time','05:12');value(root,'trim-current-time','00:44');
  value(root,'trim-start-display','00:44');value(root,'trim-end-display','01:39');
  value(root,'trim-range-length','00:55');
  const fill=byId(root,'trim-range-fill');if(fill){fill.style.left='14%';fill.style.width='18%';}
  visible(root,'media-workbench',true);
  value(root,'media-source-size','пример · 48 МиБ');
  value(root,'media-estimate','Можно отправить без сжатия');
  film(root,'.trim-preview');
 }
 if(page.screen==='room'){
  value(root,'room-heading','Ваша команда');
  value(root,'room-code','TEST 2048');value(root,'player-count','3/6');
  value(root,'room-phase-note','Ожидаем актёров');
  visible(root,'join-panel',false);visible(root,'room-ticket',true);
  visible(root,'room-start',true);
  content(root,'room-players',
   ['Я · Кот','Игрок 2 · Пёс','Игрок 3 · Курица'].map((t,i)=>'<div class="room-player" style="border-left-color:'+['#db805f','#91ada4','#e5be6f'][i]+'"><span><b>'+t.split(' · ')[0]+'</b><small>'+(i===0?'Ведущий':'Актёр')+(page.id==='room-offline'&&i===2?' · Нет связи':' · Видео получено')+'</small></span><b>'+t.split(' · ')[1]+'</b></div>').join(''));
  if(page.id==='room-offline'){
   visible(root,'room-connection',true);visible(root,'room-retry',true);
   value(root,'room-connection-status','Соединение прервано · ожидание восстановления');
   const banner=document.createElement('div');banner.className='debug-fixture-banner';
   banner.textContent='Связь потеряна · места игроков и записанные реплики сохраняются';
   root.querySelector('.topbar')?.after(banner);
  }
 }
 if(page.screen==='editor'){
  value(root,'editor-scene','WING IT! · ПОЛЁТ');
  value(root,'editor-role','Роль: Кот');
  value(root,'stage-time','00:15 / 00:55');
  value(root,'draft-status','Сохранено');
  value(root,'clip-total','3 реплики');
  value(root,'selected-clip-info','00:12.0 – 00:16.5 · Голос: обычный');
  visible(root,'voice-effects',true);
  value(root,'voice-fx-current','· Обычный');
  content(root,'clip-lane',
   '<button class="clip-bar" style="left:5%;width:17%;top:4px">Реплика 1</button>'+
   '<button class="clip-bar selected" style="left:24%;width:12%;top:4px">Реплика 2</button>'+
   '<button class="clip-bar" style="left:42%;width:23%;top:4px">Реплика 3</button>');
  content(root,'time-ruler','<span>00:00</span><span>00:15</span><span>00:30</span><span>00:45</span><span>00:55</span>');
  const playhead=byId(root,'playhead');if(playhead)playhead.style.left='27%';
  const buttons=byId(root,'voice-effects-options');
  if(buttons&&!buttons.children.length)
   buttons.innerHTML='<div class="voice-fx-primary">'+['Обычный','Женский','Мужской','Детский','Выше','Ниже'].map(t=>'<button>'+t+'</button>').join('')+'</div>';
  if(page.id==='editor-rec'){
   visible(root,'record-badge',true);value(root,'record-elapsed','00:03');
   const b=byId(root,'record-btn');b?.classList.add('recording');value(root,'record-label','Стоп');
   visible(root,'mic-meter',true);
  }
  if(page.id==='editor-fx'){
   visible(root,'voice-fx-extra',true);
   if(!byId(root,'voice-fx-extra'))content(root,'voice-effects-options',
    '<div class="voice-fx-primary">'+['Обычный','Женский','Мужской','Детский','Выше','Ниже','Телефон','Робот','Эхо','Призрак','Космос'].map(t=>'<button>'+t+'</button>').join('')+'</div>');
  }
  visible(root,'stage-placeholder',false);
  film(root,'.stage-wrap');
 }
 if(page.screen==='wait'){
  content(root,'wait-roster','<span class="wait-chip ready">Ты · Готов</span><span class="wait-chip ready">Игрок 2 · Готов</span><span class="wait-chip">Игрок 3 · Записывает</span>');
  visible(root,'unready-btn',true);
 }
 if(page.screen==='premiere'){
  content(root,'premiere-credits',
   '<span class="credit">Ты · Кот</span><span class="credit">Игрок 2 · Пёс</span><span class="credit">Игрок 3 · Курица</span>');
  visible(root,'premiere-loading',false);
  value(root,'premiere-export-status',page.id==='premiere-export'?'Сохраняем видео · 45%':'Все голоса получены. Можно сохранить видео.');
  const button=byId(root,'premiere-export');if(button)button.disabled=false;
  if(page.id==='premiere-export'){
   visible(root,'premiere-export-progress',true);
   const bar=byId(root,'premiere-export-bar');if(bar)bar.value=45;
  }
  film(root,'.premiere-viewport');
 }
}
function preview(page){
 if(interactive){
  frame.removeAttribute('sandbox');frame.removeAttribute('srcdoc');
  const url=new URL(location.pathname,location.href);
  url.searchParams.set('debug','play');url.searchParams.set('screen',page.id);
  frame.src=url.href;
  return;
 }
 frame.setAttribute('sandbox','');frame.removeAttribute('src');
 const source=document.getElementById('screen-'+page.screen);
 if(!source||!frame)return;
 const clone=source.cloneNode(true);
 decorate(clone,page);
 // A sandboxed about:srcdoc document cannot run the game's scripts or send game messages.
 frame.srcdoc='<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="'+MOBILE+'"><link rel="stylesheet" href="'+CSS+'"><style>'+PREVIEW_CSS+'</style></head><body><main id="app">'+clone.outerHTML+'</main></body></html>';
}
function selectPage(id){
 const page=PAGES.find(x=>x.id===id)||PAGES[0];active=page.id;
 overlay.querySelectorAll('[data-debug-page]').forEach(button=>{
  const chosen=button.dataset.debugPage===id;
  button.setAttribute('aria-current',chosen?'page':'false');
  button.classList.toggle('active',chosen);
 });
 overlay.querySelector('[data-debug-title]').textContent=page.name;
 preview(page);
}
function setDevice(next){
 device=next==='phone'?'phone':'desktop';
 overlay.querySelector('[data-debug-device-shell]').dataset.device=device;
 overlay.querySelectorAll('[data-debug-device]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.debugDevice===device)));
}
function closeInspector(){
 if(!overlay)return;
 overlay.remove();overlay=null;frame=null;document.body.classList.remove('ntg-debug-open');
 restoreFocus?.focus({preventScroll:true});restoreFocus=null;
}
function openInspector(){
 if(overlay){closeInspector();return;}
 const recording=document.getElementById('record-btn')?.classList.contains('recording');
 const mediaBusy=!document.getElementById('media-progress')?.classList.contains('hidden');
 const exportBusy=!document.getElementById('premiere-export-progress')?.classList.contains('hidden');
 if(recording||mediaBusy||exportBusy){
  const toast=document.getElementById('toast');
  if(toast){toast.textContent='Заверши запись или экспорт перед просмотром экранов.';toast.classList.add('visible');}
  return;
 }
 restoreFocus=document.activeElement;
 overlay=document.createElement('aside');overlay.className='ntg-debug-overlay';overlay.setAttribute('role','dialog');
 overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Просмотр экранов НЕ ТЕМ ГОЛОСОМ');
 overlay.innerHTML='<header class="ntg-debug-top"><div><small>NTG / QA</small><strong>Все экраны</strong></div><div class="ntg-debug-devices" role="group" aria-label="Размер устройства"><button data-debug-device="desktop" type="button">ПК</button><button data-debug-device="phone" type="button">Телефон</button></div><button class="ntg-debug-exit" type="button" data-debug-close aria-label="Закрыть дебаг-режим">✕ Закрыть</button></header>'+
 '<div class="ntg-debug-grid"><nav class="ntg-debug-nav" aria-label="Экраны приложения">'+PAGES.map((p,i)=>'<button type="button" data-debug-page="'+p.id+'"><span>'+String(i+1).padStart(2,'0')+'</span>'+p.name+'</button>').join('')+'</nav>'+
 '<section class="ntg-debug-work"><div class="ntg-debug-heading"><b data-debug-title></b><span>Демонстрационные данные · без изменения комнаты и записей</span></div><div class="ntg-debug-canvas"><div class="ntg-debug-device-shell" data-debug-device-shell><iframe title="Предпросмотр экрана" sandbox="" referrerpolicy="no-referrer" loading="eager"></iframe></div></div></section></div>';
 document.body.append(overlay);document.body.classList.add('ntg-debug-open');
 frame=overlay.querySelector('iframe');
 overlay.addEventListener('click',e=>{
  const page=e.target.closest('[data-debug-page]'),dev=e.target.closest('[data-debug-device]');
  if(page)selectPage(page.dataset.debugPage);
  if(dev)setDevice(dev.dataset.debugDevice);
  if(e.target.closest('[data-debug-close]'))closeInspector();
 });
 setDevice(device);selectPage(active);
 overlay.querySelector('[data-debug-close]').focus({preventScroll:true});
}
document.addEventListener('keydown',e=>{
 if(e.code==='Escape'&&overlay){e.preventDefault();e.stopImmediatePropagation();closeInspector();return;}
 if(e.code!=='Backquote'||e.repeat||e.ctrlKey||e.metaKey||e.altKey||
   e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
 e.preventDefault();e.stopImmediatePropagation();openInspector();
},true);
if(new URLSearchParams(location.search).get('debug')==='1'&&!new URLSearchParams(location.search).has('room')){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',openInspector,{once:true});
 else openInspector();
}
