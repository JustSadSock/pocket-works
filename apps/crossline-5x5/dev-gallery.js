// 5×5 Arena QA gallery: real app rendered in disposable same-origin iframe.
export const DEV_QUERY='__arena_dev';
export const DEV_SCENES=[
 ['menu','Меню','Главный экран'],['difficulty','Меню','Сложности ИИ'],['rules','Меню','Правила'],
 ['tutorial-start','Обучение','Шаг 1: движение'],['tutorial-attack','Обучение','Шаг 2: атака'],['tutorial-ready','Обучение','Подтверждение пяти шагов'],
 ['settings','Настройки','Громкость, звук, движение'],
 ['lobby-connect','PocketNet','Подключение'],['lobby-host','PocketNet','Комната ведущего'],
 ['lobby-guest','PocketNet','Комната гостя'],['lobby-ready','PocketNet','Оба игрока готовы'],['lobby-error','PocketNet','Ошибка сети'],
 ['planning','План','Пустой план'],['plan-partial','План','Часть приказов'],['plan-attack','План','Выбор атаки'],
 ['plan-full','План','План заполнен'],['plan-wait','План','Ожидание соперника'],
 ['plan-rival-wait','План','Соперник уже готов'],['plan-route','План','Маршрут из 5 шагов'],['plan-edit','План','Редактирование шага'],['plan-danger','План','Опасная клетка'],['handoff','План','Передача устройства'],
 ['round-four','План','Четвёртый раунд'],
 ['marks','План','Тактические пометки'],
 ['pause','Диалоги','Пауза'],['win','Диалоги','Победа'],['lose','Диалоги','Поражение'],['draw','Диалоги','Ничья'],
 ['toast','Диалоги','Уведомление'],['replay','Повторы','Покадровый повтор'],
 ['replay-end','Повторы','Финальный кадр'],['replay-playing','Повторы','Автопрокрутка'],
 ['replay-analysis','Повторы','Оба раскрытых плана'],['archive-empty','Повторы','Пустой архив'],['archive-list','Повторы','Сохранённые матчи'],
 ['anim-move','Анимации','Движение'],['anim-attack','Анимации','Попадание'],
 ['anim-shield','Анимации','Блок щитом'],['anim-mutual','Анимации','Встречный удар'],
 ['anim-collapse','Анимации','Обрушение'],
 ['fx-hit','Эффекты','Вспышка попадания'],['fx-block','Эффекты','Вспышка щита'],
 ['fx-danger','Эффекты','Опасная зона'],['fx-fall','Эффекты','Падение'],
 ['sounds','Звуки','Прослушать все звуки']
].map(([id,group,name])=>({id,group,name}));
export const devScene=id=>DEV_SCENES.some(x=>x.id===id)?id:'menu';
export const isDevKey=e=>e.code==='Backquote'||e.key==='ё'||e.key==='Ё';
const DEVICES={phone:[390,844,'Телефон'],landscape:[844,390,'Альбом'],desktop:[1280,800,'ПК']};
export function mountArenaDevGallery({onDiagnostics=()=>{}}={}){
 let layer=null,frame=null,current='menu',device='phone',speed=1,previousFocus=null;
 const q=s=>layer?.querySelector(s);
 function fit(){
  if(!layer||!frame)return;
  const [width,height]=DEVICES[device];
  const left=!layer.classList.contains('is-collapsed')&&innerWidth>740?300:0;
  const scale=Math.min(1,Math.max(90,innerWidth-left-28)/width,Math.max(100,innerHeight-30)/height);
  q('.arena-dev__viewport').style.left=left+'px';
  q('.arena-dev__device').style.width=Math.round(width*scale)+'px';
  q('.arena-dev__device').style.height=Math.round(height*scale)+'px';
  frame.style.width=width+'px';frame.style.height=height+'px';
  frame.style.transform='scale('+scale+')';
 }
 function post(type,extra={}){frame?.contentWindow?.postMessage({type,...extra},location.origin)}
 function select(id,force=false){
  if(!layer)return;
  current=devScene(id);
  const url=new URL(location.pathname,location.href);
  url.search='';url.searchParams.set(DEV_QUERY,current);
  const target=url.pathname+url.search;
  if(force||frame.getAttribute('src')!==target){layer.classList.add('is-loading');frame.src=target}
  else post('arena-dev-restart');
  const scene=DEV_SCENES.find(x=>x.id===current);
  frame.title='Предпросмотр: '+scene.name;q('[data-arena-current]').textContent=scene.name;
  layer.querySelectorAll('[data-arena-scene]').forEach(b=>{
   b.classList.toggle('is-active',b.dataset.arenaScene===current);
   b.setAttribute('aria-current',b.dataset.arenaScene===current?'page':'false');
  });
  if(innerWidth<=740){layer.classList.add('is-collapsed');fit()}
 }
 function setDevice(v){
  if(!DEVICES[v])return;
  device=v;
  layer.querySelectorAll('[data-arena-device]').forEach(b=>{
   b.classList.toggle('is-active',b.dataset.arenaDevice===v);
   b.setAttribute('aria-pressed',String(b.dataset.arenaDevice===v));
  });
  fit();select(current,true);
 }
 function setSpeed(v){
  speed=v;
  layer?.querySelectorAll('[data-arena-speed]').forEach(b=>{
   b.classList.toggle('is-active',Number(b.dataset.arenaSpeed)===v);
   b.setAttribute('aria-pressed',String(Number(b.dataset.arenaSpeed)===v));
  });
  post('arena-dev-speed',{speed});
 }
 function close(){
  if(!layer)return;
  const old=layer;layer=null;old.querySelector('iframe').src='about:blank';old.remove();frame=null;
  window.removeEventListener('resize',fit);previousFocus?.focus?.({preventScroll:true});
 }
 function open(){
  if(layer)return;
  previousFocus=document.activeElement;
  layer=document.createElement('section');layer.id='arenaDevGallery';layer.className='arena-dev';
  layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');
  layer.setAttribute('aria-label','5×5 Arena — тестовый режим');
  const presets=Object.entries(DEVICES).map(([id,info])=>'<button type="button" data-arena-device="'+id+'">'+info[2]+'</button>').join('');
  const speeds=[.25,.5,1,2,4].map(x=>'<button type="button" data-arena-speed="'+x+'">'+x+'×</button>').join('');
  const groups=[...new Set(DEV_SCENES.map(s=>s.group))];
  const scenes=groups.map(g=>'<section class="arena-dev__group"><h3>'+g+'</h3>'+
   DEV_SCENES.filter(s=>s.group===g).map(s=>'<button type="button" data-arena-scene="'+s.id+'">'+s.name+'</button>').join('')+'</section>').join('');
  layer.innerHTML='<section class="arena-dev__viewport"><div class="arena-dev__device"><iframe class="arena-dev__frame" title="Предпросмотр экрана"></iframe></div><span class="arena-dev__loading">Открываем…</span></section>'+
  '<aside class="arena-dev__aside"><header class="arena-dev__header"><div><small>5×5 ARENA / QA</small><strong>Тестовый режим</strong></div><button type="button" data-arena-close aria-label="Закрыть">×</button></header>'+
  '<div class="arena-dev__options"><label>Устройство</label><div class="arena-dev__presets">'+presets+'</div>'+
  '<label>Скорость анимаций</label><div class="arena-dev__presets arena-dev__speeds">'+speeds+'</div>'+
  '<div class="arena-dev__quick"><button type="button" data-arena-restart>↺ Повторить</button><button type="button" data-arena-theme>◐ Тема</button><button type="button" data-arena-collapse>Скрыть</button></div>'+
  '<button type="button" data-arena-diagnostics>Диагностика / FPS / ошибки ↗</button>'+
  '<p>Настоящие экраны на тестовых данных. PocketNet и сохранения не используются.</p></div>'+
  '<nav class="arena-dev__scenes">'+scenes+'</nav></aside>'+
  '<button type="button" class="arena-dev__reopen" data-arena-reopen><span>QA</span><strong data-arena-current>Главный экран</strong><b>☰</b></button>';
  document.body.append(layer);frame=q('iframe');
  frame.addEventListener('load',()=>{layer?.classList.remove('is-loading');post('arena-dev-speed',{speed})});
  q('[data-arena-close]').onclick=close;q('[data-arena-restart]').onclick=()=>post('arena-dev-restart');
  q('[data-arena-theme]').onclick=()=>post('arena-dev-theme');
  q('[data-arena-diagnostics]').onclick=()=>{close();onDiagnostics()};
  q('[data-arena-collapse]').onclick=()=>{layer.classList.add('is-collapsed');fit()};
  q('[data-arena-reopen]').onclick=()=>{layer.classList.remove('is-collapsed');fit()};
  layer.querySelectorAll('[data-arena-device]').forEach(b=>b.onclick=()=>setDevice(b.dataset.arenaDevice));
  layer.querySelectorAll('[data-arena-speed]').forEach(b=>b.onclick=()=>setSpeed(Number(b.dataset.arenaSpeed)));
  layer.querySelectorAll('[data-arena-scene]').forEach(b=>b.onclick=()=>select(b.dataset.arenaScene));
  window.addEventListener('resize',fit);fit();
  setSpeed(speed);layer.querySelector('[data-arena-device="'+device+'"]').classList.add('is-active');
  select(current,true);
 }
 function toggle(){if(layer)close();else open()}
 window.addEventListener('message',e=>{
  if(layer&&e.origin===location.origin&&e.source===frame?.contentWindow&&e.data?.type==='arena-dev-toggle')close();
 });
 window.addEventListener('keydown',e=>{
  if(e.repeat||!isDevKey(e)||e.altKey||e.ctrlKey||e.metaKey)return;
  if(!layer&&/INPUT|TEXTAREA/.test(document.activeElement?.tagName||''))return;
  e.preventDefault();toggle();
 },true);
 document.querySelectorAll('[data-workshop-trigger]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();toggle()}));
 return {open,close,toggle,select,isOpen:()=>!!layer};
}
